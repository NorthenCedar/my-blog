import * as sdf from '@typegpu/sdf';
import { tgpu, common, d, std, type TgpuRoot } from 'typegpu';

import { Slider } from './slider.ts';
import { NumberProvider } from './numbers.ts';
import { Camera, CameraController } from './camera.ts';
import {
  DirectionalLight,
  HitInfo,
  LineInfo,
  ObjectType,
  Ray,
  rayMarchLayout,
  sampleLayout,
  SdfBbox,
} from './dataTypes.ts';
import {
  beerLambert,
  createBackgroundTexture,
  createTextures,
  fresnelSchlick,
  intersectBox,
} from './utils.ts';
import {
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
  AO_BIAS,
  AO_INTENSITY,
  AO_RADIUS,
  AO_STEPS,
  DARK_END,
  GROUND_ALBEDO,

  GROUND_MEAN,
  GROUND_TINT_LIGHT,
  JELLY_IOR,
  JELLY_SCATTER_STRENGTH,
  LIGHT_END,
  LINE_HALF_THICK,
  LINE_RADIUS,
  MAX_DIST,
  MAX_STEPS,
  SPECULAR_INTENSITY,
  SPECULAR_POWER,
  SURF_DIST,
} from './constants.ts';
import { randf } from '@typegpu/noise';
import { EventHandler } from './events.ts';
import { TAAResolver } from './taa.ts';

const SceneParams = d.struct({
  seed: d.vec2f,
  jellyColor: d.vec4f,
  light: DirectionalLight,
  /* ★ 2026-10-17 第三轮：地面基准色（rgb = 跟 --paper 走，w = 深色程度 0..1）。
     见 constants.ts 的 GROUND_TINT_* 注释 —— 为什么不是简单相乘。 */
  groundTint: d.vec4f,
  blurEnabled: d.u32,
});

const layout = tgpu.bindGroupLayout({
  filteringSampler: { sampler: 'filtering', sampleType: 'float' },
  bezierTexture: { texture: d.texture2d(d.f32) },
  digitsTexture: { texture: d.texture2dArray(d.f32) },
  endCap: { uniform: d.vec4f },
  sceneParams: { uniform: SceneParams },
});

const cameraAccess = tgpu.accessor(Camera);
function getRay(ndc: d.v2f) {
  'use gpu';
  const clipPos = d.vec4f(ndc.x, ndc.y, -1.0, 1.0);

  const invView = cameraAccess.$.viewInv;
  const invProj = cameraAccess.$.projInv;

  const viewPos = invProj * clipPos;
  const viewPosNormalized = d.vec4f(viewPos.xyz / viewPos.w, 1.0);

  const worldPos = invView * viewPosNormalized;

  const rayOrigin = invView.columns[3].xyz;
  const rayDir = std.normalize(worldPos.xyz - rayOrigin);

  return Ray({
    origin: rayOrigin,
    direction: rayDir,
  });
}

const GroundParams = {
  groundThickness: 0.03,
  groundRoundness: 0.02,
};

function rectangleCutoutDist(position: d.v2f) {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;

  return sdf.sdRoundedBox2d(
    position,
    d.vec2f(1 + groundRoundness, 0.2 + groundRoundness),
    0.2 + groundRoundness,
  );
}

function getMainSceneDist(position: d.v3f) {
  'use gpu';
  const groundThickness = GroundParams.groundThickness;
  const groundRoundness = GroundParams.groundRoundness;

  return sdf.opUnion(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0.06),
    sdf.opExtrudeY(position, -rectangleCutoutDist(position.xz), groundThickness - groundRoundness) -
      groundRoundness,
  );
}

const sliderBBoxAccess = tgpu.accessor(SdfBbox);
function sdInflatedPolyline2D(p: d.v2f) {
  'use gpu';
  const bbox = sliderBBoxAccess.$;

  const uv = d.vec2f(
    (p.x - bbox.left) / (bbox.right - bbox.left),
    (bbox.top - p.y) / (bbox.top - bbox.bottom),
  );
  const clampedUV = std.saturate(uv);

  const sampledColor = std.textureSampleLevel(
    layout.$.bezierTexture,
    layout.$.filteringSampler,
    clampedUV,
    0,
  );
  const segUnsigned = sampledColor.x;
  const progress = sampledColor.y;
  const normal = sampledColor.zw;

  return LineInfo({
    t: progress,
    distance: segUnsigned,
    normal: normal,
  });
}

function cap3D(position: d.v3f) {
  'use gpu';
  const secondLastPoint = layout.$.endCap.xy;
  const lastPoint = layout.$.endCap.zw;

  const angle = std.atan2(lastPoint.y - secondLastPoint.y, lastPoint.x - secondLastPoint.x);
  const rot = d.mat2x2f(std.cos(angle), -std.sin(angle), std.sin(angle), std.cos(angle));

  let pieP = position - d.vec3f(secondLastPoint, 0);
  pieP = d.vec3f(rot * pieP.xy, pieP.z);
  const hmm = sdf.sdPie(pieP.zx, d.vec2f(1, 0), LINE_HALF_THICK);
  return sdf.opExtrudeY(pieP, hmm, 0.001) - LINE_RADIUS;
}

function sliderSdf3D(position: d.v3f) {
  'use gpu';
  const poly2D = sdInflatedPolyline2D(position.xy);

  let finalDist = d.f32(0.0);
  if (poly2D.t > 0.94) {
    finalDist = cap3D(position);
  } else {
    const body = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) - LINE_RADIUS;
    finalDist = body;
  }

  return LineInfo({
    t: poly2D.t,
    distance: finalDist,
    normal: poly2D.normal,
  });
}

function sliderApproxDist(position: d.v3f) {
  'use gpu';
  const bbox = sliderBBoxAccess.$;

  const p = position.xy;
  if (p.x < bbox.left || p.x > bbox.right || p.y < bbox.bottom || p.y > bbox.top) {
    return 1e9;
  }

  const poly2D = sdInflatedPolyline2D(p);
  const dist3D = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) - LINE_RADIUS;

  return dist3D;
}

function getSceneDist(position: d.v3f) {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const poly3D = sliderSdf3D(position);

  const hitInfo = HitInfo();

  if (poly3D.distance < mainScene) {
    hitInfo.distance = poly3D.distance;
    hitInfo.objectType = ObjectType.SLIDER;
    hitInfo.t = poly3D.t;
  } else {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.BACKGROUND;
  }
  return hitInfo;
}

function getSceneDistForAO(position: d.v3f) {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const sliderApprox = sliderApproxDist(position);
  return std.min(mainScene, sliderApprox);
}

const sdfSlot = tgpu.slot<(pos: d.v3f) => number>();

const getNormalFromSdf = tgpu.fn(
  [d.vec3f, d.f32],
  d.vec3f,
)((position, epsilon) => {
  'use gpu';
  const k = d.vec3f(1, -1, 0);

  const offset1 = k.xyy * epsilon;
  const offset2 = k.yyx * epsilon;
  const offset3 = k.yxy * epsilon;
  const offset4 = k.xxx * epsilon;

  const sample1 = offset1 * sdfSlot.$(position + offset1);
  const sample2 = offset2 * sdfSlot.$(position + offset2);
  const sample3 = offset3 * sdfSlot.$(position + offset3);
  const sample4 = offset4 * sdfSlot.$(position + offset4);

  return std.normalize(sample1 + sample2 + sample3 + sample4);
});

const getNormalCapSdf = getNormalFromSdf.with(sdfSlot, cap3D);
const getNormalMainSdf = getNormalFromSdf.with(sdfSlot, getMainSceneDist);

function getNormalCap(pos: d.v3f) {
  'use gpu';
  return getNormalCapSdf(pos, 0.01);
}

function getNormalMain(position: d.v3f) {
  'use gpu';
  if (std.abs(position.z) > 0.22 || std.abs(position.x) > 1.02) {
    return d.vec3f(0, 1, 0);
  }
  return getNormalMainSdf(position, 0.0001);
}

function getSliderNormal(position: d.v3f, hitInfo: d.Infer<typeof HitInfo>) {
  'use gpu';
  const poly2D = sdInflatedPolyline2D(position.xy);
  const gradient2D = poly2D.normal;

  const threshold = LINE_HALF_THICK * 0.85;
  const absZ = std.abs(position.z);
  const zDistance = std.max(
    0,
    ((absZ - threshold) * LINE_HALF_THICK) / (LINE_HALF_THICK - threshold),
  );
  const edgeDistance = LINE_RADIUS - poly2D.distance;

  const edgeContrib = 0.9;
  const zContrib = 1.0 - edgeContrib;

  const zDirection = std.sign(position.z);
  const zAxisVector = d.vec3f(0, 0, zDirection);

  const edgeBlendDistance = edgeContrib * LINE_RADIUS + zContrib * LINE_HALF_THICK;

  const blendFactor = std.smoothstep(
    edgeBlendDistance,
    0.0,
    zDistance * zContrib + edgeDistance * edgeContrib,
  );

  const normal2D = d.vec3f(gradient2D.xy, 0);
  const blendedNormal = std.mix(zAxisVector, normal2D, blendFactor * 0.5 + 0.5);

  let normal = std.normalize(blendedNormal);

  if (hitInfo.t > 0.94) {
    const ratio = (hitInfo.t - 0.94) / 0.02;
    const fullNormal = getNormalCap(position);
    normal = std.normalize(std.mix(normal, fullNormal, ratio));
  }

  return normal;
}

function getNormal(position: d.v3f, hitInfo: d.Infer<typeof HitInfo>) {
  'use gpu';
  if (hitInfo.objectType === ObjectType.SLIDER && hitInfo.t < 0.96) {
    return getSliderNormal(position, hitInfo);
  }

  return std.select(
    getNormalCap(position),
    getNormalMain(position),
    hitInfo.objectType === ObjectType.BACKGROUND,
  );
}

function sqLength(a: d.v3f) {
  'use gpu';
  return std.dot(a, a);
}

function getFakeShadow(position: d.v3f, lightDir: d.v3f): d.v3f {
  'use gpu';
  const jellyColor = layout.$.sceneParams.jellyColor;
  const endCapX = layout.$.endCap.x;

  if (position.y < -GroundParams.groundThickness) {
    // Applying darkening under the ground (the shadow cast by the upper ground layer)
    const fadeSharpness = d.f32(30);
    const inset = 0.02;
    const cutout = rectangleCutoutDist(position.xz) + inset;
    const edgeDarkening = std.saturate(1 - cutout * fadeSharpness);

    // Applying a slight gradient based on the light direction
    const lightGradient = std.saturate(-position.z * 4 * lightDir.z + 1);

    return d.vec3f(1) * edgeDarkening * (lightGradient * 0.5);
  } else {
    const finalUV = d.vec2f(
      (position.x - position.z * lightDir.x * std.sign(lightDir.z)) * 0.5 + 0.5,
      1 - (-position.z / lightDir.z) * 0.5 - 0.2,
    );
    const data = std.textureSampleLevel(
      layout.$.bezierTexture,
      layout.$.filteringSampler,
      finalUV,
      0,
    );

    // Normally it would be just data.y, but there transition is too sudden when the jelly is bunched up.
    // To mitigate this, we transition into a position-based transition.
    const jellySaturation = std.mix(0, data.y, std.saturate(position.x * 1.5 + 1.1));
    const shadowColor = std.mix(d.vec3f(0, 0, 0), jellyColor.rgb, jellySaturation);

    const contrast = 20 * std.saturate(finalUV.y) * (0.8 + endCapX * 0.2);
    const shadowOffset = -0.3;
    const featherSharpness = d.f32(10);
    const uvEdgeFeather =
      std.saturate(finalUV.x * featherSharpness) *
      std.saturate((1 - finalUV.x) * featherSharpness) *
      std.saturate((1 - finalUV.y) * featherSharpness) *
      std.saturate(finalUV.y);
    const influence = std.saturate((1 - lightDir.y) * 2) * uvEdgeFeather;
    return std.mix(
      d.vec3f(1),
      std.mix(shadowColor, d.vec3f(1), std.saturate(data.x * contrast + shadowOffset)),
      influence,
    );
  }
}

function calculateAO(position: d.v3f, normal: d.v3f) {
  'use gpu';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (let i = 1; i <= AO_STEPS; i++) {
    const sampleHeight = stepDistance * d.f32(i);
    const samplePosition = position + normal * sampleHeight;
    const distanceToSurface = getSceneDistForAO(samplePosition) - AO_BIAS;
    const occlusionContribution = std.max(0.0, sampleHeight - distanceToSurface);
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5;
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) {
      break;
    }
  }

  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.saturate(rawAO);
}

function calculateLighting(hitPosition: d.v3f, normal: d.v3f, rayOrigin: d.v3f) {
  'use gpu';
  const lightDir = std.neg(layout.$.sceneParams.light.direction);

  const fakeShadow = getFakeShadow(hitPosition, lightDir);
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(rayOrigin - hitPosition);
  const reflectDir = std.reflect(std.neg(lightDir), normal);
  const specularFactor = std.max(std.dot(viewDir, reflectDir), 0) ** SPECULAR_POWER;
  const specular = layout.$.sceneParams.light.color * (specularFactor * SPECULAR_INTENSITY);

  const baseColor = d.vec3f(0.9);

  const directionalLight = baseColor * layout.$.sceneParams.light.color * diffuse * fakeShadow;
  const ambientLight = baseColor * AMBIENT_COLOR * AMBIENT_INTENSITY;

  const finalSpecular = specular * fakeShadow;

  return std.saturate(directionalLight + ambientLight + finalSpecular);
}

function applyAO(litColor: d.v3f, hitPosition: d.v3f, normal: d.v3f) {
  'use gpu';
  const ao = calculateAO(hitPosition, normal);
  const finalColor = litColor * ao;
  return d.vec4f(finalColor, 1.0);
}

function rayMarchNoJelly(rayOrigin: d.v3f, rayDirection: d.v3f, uv: d.v2f) {
  'use gpu';
  let distanceFromOrigin = d.f32();
  let hit = d.f32();

  for (let i = 0; i < 6; i++) {
    const p = rayOrigin + rayDirection * distanceFromOrigin;
    hit = getMainSceneDist(p);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST * 10) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    const behind = renderBackground(
      rayOrigin,
      rayDirection,
      distanceFromOrigin,
      d.f32(layout.$.sceneParams.blurEnabled === 1 ? 0.87 : 0),
      uv,
    );
    /* ★★ 2026-10-17 第五轮：果冻折射到的必须是**页面真实的样子**，不是"地面的固有色"。
       地面改成透明之后，槽内的实际观感 = `页面 × (1 − a) + 地面色 × a`
       —— 槽内 a 只有 0.3，所以肉眼看到的是**纸白**，不是那个被 AO 压到近 0 的槽底。
       原来这里直接返回 `.rgb`（地面的固有色），于是软条的端头/边缘会折射到近黑的槽底，
       在纸白上勾出一圈**硬黑边**（站主：「左边部分现在是黑色的」）。
       ⇒ 按 `renderBackground` 传回来的 alpha 合一次，拿"最终看得见的颜色"去折射。 */
    return std.mix(layout.$.sceneParams.groundTint.rgb, behind.rgb, behind.w);
  }
  return d.vec3f();
}

function renderPercentageOnGround(hitPosition: d.v3f, center: d.v3f, percentage: number) {
  'use gpu';

  const textWidth = 0.38;
  const textHeight = 0.33;

  if (
    std.abs(hitPosition.x - center.x) > textWidth * 0.5 ||
    std.abs(hitPosition.z - center.z) > textHeight * 0.5
  ) {
    return d.vec4f();
  }

  const localX = hitPosition.x - center.x;
  const localZ = hitPosition.z - center.z;

  const uvX = (localX + textWidth * 0.5) / textWidth;
  const uvZ = (localZ + textHeight * 0.5) / textHeight;

  if (uvX < 0.0 || uvX > 1.0 || uvZ < 0.0 || uvZ > 1.0) {
    return d.vec4f();
  }

  return std.textureSampleLevel(
    layout.$.digitsTexture,
    layout.$.filteringSampler,
    d.vec2f(uvX, uvZ),
    percentage,
    0,
  );
}

function renderBackground(
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  backgroundHitDist: number,
  offset: number,
  uv: d.v2f,
) {
  'use gpu';
  const hitPosition = rayOrigin + rayDirection * backgroundHitDist;

  /* ★★ 2026-10-17 第四轮（站主：「拉到最右边时不要显示 81%，显示 100%」）：
     原版读 `endCap.x`，而 `endCapUniform` 的四个分量是 **(倒数第二点.xy, 末点.xy)**
     （`slider.ts` 的 `#updateGPUBuffer`）⇒ `.x` 是**倒数第二个点**，天然比真端点落后半个链段。
     17 个点、链长 2.04 ⇒ 每段 ≈ 0.18，于是最右端算出 0.82 ⇒ 屏幕显示 **81%**（站主截图）。
     ⇒ 改读 `.z`（末点 x）：真端点。`.x` 仍留给焦散（fadeX 需要软一点，见下面 endCapX）。 */
  const tipX = layout.$.endCap.z;
  const percentage = d.u32(
    std.saturate((tipX - LIGHT_END) / (DARK_END - LIGHT_END)) * 100.0 + 0.5,
  );
  const percentageSample = renderPercentageOnGround(hitPosition, d.vec3f(0.72, 0, 0), percentage);

  let highlights = d.f32();

  const highlightWidth = d.f32(1);
  const highlightHeight = 0.2;
  let offsetX = d.f32();
  let offsetZ = d.f32(0.05);

  const lightDir = layout.$.sceneParams.light.direction;
  const causticScale = 0.2;
  offsetX -= lightDir.x * causticScale;
  offsetZ += lightDir.z * causticScale;

  const endCapX = layout.$.endCap.x;
  const sliderStretch = (endCapX + 1) * 0.5;

  if (
    std.abs(hitPosition.x + offsetX) < highlightWidth &&
    std.abs(hitPosition.z + offsetZ) < highlightHeight
  ) {
    const uvX_orig = ((hitPosition.x + offsetX + highlightWidth * 2) / highlightWidth) * 0.5;
    const uvZ_orig = ((hitPosition.z + offsetZ + highlightHeight * 2) / highlightHeight) * 0.5;

    const centeredUV = d.vec2f(uvX_orig - 0.5, uvZ_orig - 0.5);
    const finalUV = d.vec2f(centeredUV.x, 1 - (std.abs(centeredUV.y - 0.5) * 2) ** 2 * 0.3);

    const density = std.max(
      0,
      (std.textureSampleLevel(layout.$.bezierTexture, layout.$.filteringSampler, finalUV, 0).x -
        0.25) *
        8,
    );

    const fadeX = std.smoothstep(0, -0.2, hitPosition.x - endCapX);
    const fadeZ = 1 - (std.abs(centeredUV.y - 0.5) * 2) ** 3;
    const fadeStretch = std.saturate(1 - sliderStretch);
    const edgeFade = std.saturate(fadeX) * std.saturate(fadeZ) * fadeStretch;

    highlights = (density ** 3 * edgeFade * 3 * (1 + lightDir.z)) / 1.5;
  }

  const originYBound = std.saturate(rayOrigin.y + 0.01);
  const posOffset =
    hitPosition +
    d.vec3f(0, 1, 0) * (offset * (originYBound / (1.0 + originYBound)) * (1 + randf.sample() / 2));
  const newNormal = getNormalMain(posOffset);

  // Calculate fake bounce lighting
  const jellyColor = layout.$.sceneParams.jellyColor;
  const sqDist = sqLength(hitPosition - d.vec3f(endCapX, 0, 0));
  const bounceLight = jellyColor.rgb * ((1 / (sqDist * 15 + 1)) * 0.4);
  const sideBounceLight = jellyColor.rgb * ((1 / (sqDist * 40 + 1)) * 0.3) * std.abs(newNormal.z);

  const litColor = calculateLighting(posOffset, newNormal, rayOrigin);
  const rawGround =
    applyAO(GROUND_ALBEDO * litColor, posOffset, newNormal) +
    d.vec4f(bounceLight, 0) +
    d.vec4f(sideBounceLight, 0);

  /* ★ 2026-10-17 第三轮：把地面的**基准色**搬到当前主题的纸上（站主：「按钮周围的颜色
     改为和背景纸白相同…像抠图抠出来的」）。
     用**比例**而不是平移：`tint × (原地面 / 实测均值)` —— 平移会在曲线不同位置差出几十级
     （第一版就是这么偏灰的）；比例能精确落到目标色，槽的明暗比例也原样保留。
     ⚠ 不用乘法直接乘 tint：那样深色档（tint≈0.1）会把槽一起压扁成纯黑。 */
  const tint = layout.$.sceneParams.groundTint;
  const depth = tint.w; // 0 = 亮色档，1 = 深色档
  /* `saturate` 把"最亮的那片地面"**钉在 tint 上**（比例 ≥ 1 一律按 1 算）：
     这样两档的基准都精确落在纸色上，暗部（槽壁、投影）按比例保留。
     不钉死的话，ratio 略大于 1 就会把地面整体顶亮 —— 深色档实测过 30/42/36（页面 19/27/23），
     那正是"贴片"的来源。 */
  const ratio = std.saturate(rawGround.rgb * (1.0 / GROUND_MEAN));
  const gamma = 1.8;
  /* ⚠ 2026-10-17 第四轮**试过并否决**：在 这里按几何（`|z|` + `y`）把「槽口那一段地面」压暗。
     压是压下去了，但画面上出现一条**横贯整个画布的水平灰带** —— 因为 `|z| < 0.21` 命中的是
     "地面上沿 z 方向的一条带"，它的画面投影远宽于槽本身（槽只占其中一段），
     于是在槽左右两侧各多出一截灰带，比原来的"槽看不见"更糟（目检 `_tt-H6-knob.png`）。
     ⇒ 槽的可见度改由 `rayMarch` 里的 `slotShade`（压胶囊的反射与透射）负责，这里不动地面。 */
  const shaped = d.vec3f(
    std.pow(ratio.x, gamma),
    std.pow(ratio.y, gamma),
    std.pow(ratio.z, gamma),
  );
  const groundRgb = tint.rgb * shaped;

  /* 百分比刻度跟地面**反相**：亮档深字、暗档浅字（原版写死"saturate(地面×0.5)"=深字）。 */
  const inkLight = groundRgb * 0.5;
  const inkDark = d.vec3f(1.0) - groundRgb * 0.5;
  const textColor = std.saturate(inkLight + (inkDark - inkLight) * depth);

  /* 焦散高光与槽壁的亮边在深底上要更用力才看得见（原版增益只对浅底合适）。 */
  const highlightGain = 1.0 + 1.6 * depth;

  const litGround =
    std.saturate(std.mix(groundRgb, textColor, percentageSample.x)) *
    (1 + highlights * highlightGain);

  /* ★★ 2026-10-17 第五轮：这一层改成**直接算 alpha**（不再返回 1）。
     第五轮第二版（站主：「为什么这个边缘有锯齿那么糊」「为什么还有个灰色的小框，
     而且影子还是只在框内，被截断了」）。第一版错在哪，值得记下来：

       · 第一版按"区域"分区：`y < 0.05` 当槽内、固定 0.30；否则按 shade 算。
         **判据是错的** —— 整块可见地面都在 `rectangleCutoutDist` 挖出来的那个碗里
         （盒子 x 半宽 1.2、z 半宽 0.4，比整个取景还大）⇒ `inGroove` 恒为 1
         ⇒ **整块画布被刷了一层 30% 的纸色膜**（实测全画面 alpha 恒 0.298）。
         那层膜在纯纸白上看不出来，在 ∞ 底纹上就是一个矩形 —— 站主说的"灰色小框"。
       · 那层膜还顺带把画布边界变成了"影子的墙"：影子铺到边框就被膜收住，
         看起来"只在框内、被截断"。

     现在的模型只有一句：**alpha = 这块地面比纸暗多少**。
       · 纸白 ⇒ alpha 0 ⇒ 页面与底纹原样透出（画布外/画布内逐字节相同）；
       · 越暗 ⇒ alpha 越大 ⇒ 底纹按比例退到后面；
       · 因为是"乘影"合成（`src = graded − tint·(1−a)`），叠在纸面上时合成结果
         **逐像素还原成 `graded`** —— 影子的深浅只由 `graded` 决定，alpha 只管底纹透出多少。
     ⇒ 所以调影子深浅要去调地面比例曲线的 `gamma`，不在 alpha 上做文章。
     ⚠ 果冻本体在 `rayMarch` 里返回 alpha = 1（不透明），两者走同一条合成公式。 */
  const lumaK = d.vec3f(0.299, 0.587, 0.114);
  const paperLum = std.max(std.dot(tint.rgb, lumaK), d.f32(0.02));
  const dark = std.saturate(1.0 - std.dot(litGround, lumaK) / paperLum);

  /* alpha 直接取"比纸暗多少"：这样叠在纸面上时合成结果**逐像素等于**不透明那版，
     只有底纹的透出比例跟着浓度走。刻度墨单独顶到满浓度（否则会与纸混在一起）。 */
  const a = std.max(dark, std.saturate(percentageSample.x));

  return d.vec4f(litGround, a);
}

function rayMarch(rayOrigin: d.v3f, rayDirection: d.v3f, uv: d.v2f) {
  'use gpu';
  let backgroundDist = d.f32();
  for (let i = 0; i < MAX_STEPS; i++) {
    const p = rayOrigin + rayDirection * backgroundDist;
    const hit = getMainSceneDist(p);
    backgroundDist += hit;
    if (hit < SURF_DIST) {
      break;
    }
  }
  const background = renderBackground(rayOrigin, rayDirection, backgroundDist, d.f32(), uv);

  /* ★★ 2026-10-17 第五轮：`slotShade`（上一轮给亮色档压暗胶囊透射/反射的补丁）**删掉**。
     它存在的理由是"地面 = 纸白之后槽看不见"，而当时地面是**不透明的**纸色，
     槽只能靠把胶囊压到纸色之下来显形。现在地面整层改成了半透明墨影（见下面的 alpha），
     槽自己就有影子 —— 不需要再把胶囊压暗。而那个补丁的副作用正是站主这轮说的
     「左边部分是黑色的」：它把胶囊的透射与反射一起乘 0.55，端头 `reflection` 本来就接近 0
     （`saturate(y + 0.2)`），再乘一次就沉成黑块。⇒ 恢复原版光学。 */

  const bbox = sliderBBoxAccess.$;
  const zDepth = d.f32(0.25);

  /* 果冻的假反射与纸色同源（见下面 reflection 的长注释）。 */
  const tint = layout.$.sceneParams.groundTint;

  const sliderMin = d.vec3f(bbox.left, bbox.bottom, -zDepth);
  const sliderMax = d.vec3f(bbox.right, bbox.top, zDepth);

  const intersection = intersectBox(rayOrigin, rayDirection, sliderMin, sliderMax);

  if (!intersection.hit) {
    return background;
  }

  let distanceFromOrigin = std.max(d.f32(0), intersection.tMin);

  let totalSteps = d.u32();
  for (let i = 0; i < MAX_STEPS; i++) {
    if (totalSteps >= MAX_STEPS) {
      break;
    }

    const currentPosition = rayOrigin + rayDirection * distanceFromOrigin;

    const hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;
    totalSteps++;

    if (hitInfo.distance < SURF_DIST) {
      const hitPosition = rayOrigin + rayDirection * distanceFromOrigin;

      if (!(hitInfo.objectType === ObjectType.SLIDER)) {
        break;
      }

      const N = getNormal(hitPosition, hitInfo);
      const I = rayDirection;
      const cosi = std.saturate(std.dot(std.neg(I), N));
      const F = fresnelSchlick(cosi, d.f32(1), d.f32(JELLY_IOR));

      /* ★★ 2026-10-17 第五轮（站主：「亮色模式时软条的左边…应该是半透明显示出背景纸白，
         现在是黑色的」）。
         原版这里是**离线写死的假反射** `saturate(hitPosition.y + 0.2)` —— 一个从下到上
         0→1 的灰阶，当作"果冻反射到的环境"。它是给原版那块固定浅灰地面配的。
         换成纸白（250）之后这个灰阶偏暗一整档，而软条的**端头**是竖直面、正好在 y≈0 处
         ⇒ 反射只有 0.2，乘上 Fresnel 的高占比就沉成黑块。

         ⇒ 亮色档把假反射挂到**纸色**上并把下限抬高（端头 ≈ 0.74×纸白，读成磨砂玻璃）；
           深色档保持原版的灰阶（纸是 #131b17，乘上去会把果冻一起压成黑，
           而那里要的恰是"暗底上一条亮玻璃"）。`tint.w` 就是档位：0 = 亮，1 = 深。
         ⚠ 这是**外观上的**半透明，不是真去改 alpha：果冻是不透明实体，
           给它真 alpha 会让整条软条变成塑料片，端头与带身的接缝也会裂。 */
      const glassGrey = std.saturate(d.vec3f(hitPosition.y + 0.2));
      const glassPaper = tint.rgb * (0.62 + 0.62 * std.saturate(hitPosition.y + 0.2));
      const reflection = std.mix(glassPaper, glassGrey, tint.w);

      const eta = 1 / JELLY_IOR;
      const k = 1 - eta * eta * (1 - cosi * cosi);
      let refractedColor = d.vec3f();
      if (k > 0) {
        const refrDir = std.normalize(I * eta + N * (eta * cosi - std.sqrt(k)));
        const p = hitPosition + refrDir * (SURF_DIST * 2);
        const exitPos = p + refrDir * (SURF_DIST * 2);

        const env = rayMarchNoJelly(exitPos, refrDir, uv);
        const progress = hitInfo.t;
        const jellyColor = layout.$.sceneParams.jellyColor;

        const scatterTint = jellyColor.rgb * 1.5;
        const density = d.f32(20);
        const absorb = (1 - jellyColor.rgb) * density;

        const T = beerLambert(absorb * progress ** 2, 0.08);

        const lightDir = layout.$.sceneParams.light.direction * -1;

        const forward = std.max(0, std.dot(lightDir, refrDir));
        const scatter = scatterTint.mul(JELLY_SCATTER_STRENGTH * forward * progress ** 3);
        /* ★ 2026-10-17 第四轮：**透射进来的背景**也要压（见下面的 slotShade）。
           胶囊的下半是"透过玻璃看到的地面"，地面等于纸色 ⇒ 那一片与背景同色、看不见。
           只压 `env*T`（透射），**不动 `scatter`**（果冻自己的橙色散射）——
           这样胶囊沉下去变成浅灰，而果冻的橙仍然是橙，不会一起变成暗红。 */
        refractedColor = env * T + scatter;
      }

      /* ★★ 2026-10-17 第五轮：果冻本体**不透明**（alpha = 0，见片元里的 `color.w` 判据），
         地面层才走半透明墨影。果冻折射到的仍是"纸色的地面"（解析求交得到的 env）——
         而画面背后真正的页面是纸色 + ∞ 底纹，两者只差一层极淡的底纹，观感一致。 */
      return d.vec4f(std.mix(refractedColor, reflection, F), 1);
    }

    if (distanceFromOrigin > backgroundDist) {
      break;
    }
  }

  return background;
}

const rayMarchFragmentFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  randf.seed2(layout.$.sceneParams.seed * uv);

  const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
  const ray = getRay(ndc);

  const color = rayMarch(ray.origin, ray.direction, uv);
  /* ★★ 2026-10-17 第四轮：色调映射改成**以当前纸色为锚点归一**（站主：「亮暗的时候都和背景
     有色差」）。原版是裸的 `tanh(color.rgb * 1.3)` —— 它把 1.0 压到 **0.8617**（tanh(1.3)，
     正是实测那个"220 上限"：220/255 = 0.8627）。所以"画布地面"永远比纸白低 30 级，
     无论怎么校色都差一块。
     ⇒ 乘一个逐通道 `gain = tint / tanh(tint * 1.3)`：让**纸色那一档精确输出纸色**
       （亮档 #fafaf7 → 250/250/247，深档 #131b17 → 19/27/23），tanh 仍然保留
       （它压的是超出纸色的高光，不是地面）。 */
  const tint = layout.$.sceneParams.groundTint.rgb;
  const tanhAtPaper = std.max(std.tanh(tint * 1.3), d.vec3f(0.02));
  const gain = tint / tanhAtPaper;
  const graded = std.min(std.tanh(color.rgb * 1.3) * gain, d.vec3f(1.0));

  /* ★★ 2026-10-17 第五轮（站主：「按钮背景把底纹无限符号挡住了…直接把按钮背景改透明，
     影子直接出现在关于页的背景上」）

     上一轮把地面调成**精确的纸色**，色差是没了，但代价是这块地面变成**不透明的纸色板**：
     关于页那张 ∞ 底纹正好从按钮底下穿过，被整块盖住；影子的 alpha 也出不去，
     在画布下边界被切成一条直线。

     ⇒ 这一轮地面**不再画颜色，只画"影"**：alpha 由 `renderBackground` 按区域算好
       （开放地面 = 乘影、槽内 = 半透明玻璃膜），果冻本体给 1（不透明实体）。
       层标记就直接用 alpha 本身 —— 地面任何区域的 alpha 都 < 1，
       所以"alpha = 1" 天然等价于"这一像素是果冻"，不需要第五个通道。

     合成公式（premultiplied）：`out = src + dst × (1 − a)`。
     取 `src = graded − tint × (1 − a)` 这一个式子能同时覆盖两种情况：
       · `a = 1 − shade`（纯乘影）时它**精确复现**原来的地面像素；
       · `a` 比它小（半透明玻璃膜）时，同一式变成"页面 + 一层淡墨"；
       · 比纸亮的那一档（焦散）自动落进 `src > 0 且 a = 0`，即纯加色。
     ⇒ 不用再分"multiply 还是 over"两种模式，一条式子全包。

     ⚠ `graded` 先做以纸色为锚点的色调映射（第四轮），alpha 用的是**映射前**的 shade ——
       两者混用是故意的：展示色要走 tanh，浓度不该再被 tanh 压一次。 */
  const a = color.w;

  /* 最外一圈 alpha 淡出：影子铺到画布边框时不留硬切（上一轮站主说的"影子被截了"）。
     0.06 ≈ 6px（168×104 的小画布上）——真正的出口是"画布内部本来就快衰减完了"，
     这条只是兜住最后几像素。 */
  const edge = std.min(std.min(uv.x, 1.0 - uv.x), std.min(uv.y, 1.0 - uv.y));
  const edgeFade = std.smoothstep(0.0, 0.06, edge);

  const src = std.max(graded - tint * (1.0 - a), d.vec3f(0));
  return d.vec4f(src * edgeFade, a * edgeFade);
});

/**
 * ★ 本站改：取景（原版 fov 45°）。
 * 原版是整页展示，槽只占画面宽 ~35%；做成开关（168×W）时槽太小，收窄到 23° 让槽占 ~67% 宽度。
 * 相机机位/果冻/物理/百分号全部原样。
 *
 * ★★ 2026-10-17 第四轮：23° → **31.11°**，因为画布从 168×76 加高到 168×104
 * （给影子留空间，见 ThemeToggle.astro 的注释）。加高改的是**宽高比**，而
 * `mat4.perspective(fov, w/h)` 的 fov 是**垂直**的 ⇒ 不调 fov 就等于收窄水平视野、
 * 槽会变宽到溢出画面。这组数是解出来的（保持水平世界视野不变）：
 *     旧 2·d·tan(11.5°)·(168/76) = 新 2·d·tan(f/2)·(168/104)  ⇒  f = 31.11°
 * ⇒ 槽的**宽度占比保持不变**，变的是上下多出的留白（正是要给影子的）。
 */
const TOGGLE_FOV = (39.9 * Math.PI) / 180;

/** 相机 target 的垂直偏移：槽往上挪一点，下方的空间交给影子（0.22 世界 ≈ 12 px）。 */
const TOGGLE_TARGET_Y = -0.22;

/* ★ 本站加（2026-10-17 第七轮，第八轮收窄）：指针命中半径，单位 **CSS 像素**。
   第七轮把命中区从「整块画布」收到「整条软条」（13，管身 ±10 + 端头 12 都要兜住）；
   第八轮站主：「变成只有点软条右边的端头才能拖动」⇒ 命中区只剩**端头这一个把手**。
   尺寸依据：端头是半径 `LINE_HALF_THICK(0.17)` 世界的扇形，1 世界 ≈ 72 CSS
   （见 constants.ts 的 MOUSE_* 注释里按槽宽推算的比例）⇒ 屏幕上半径约 12 CSS。
   取 18 给它一圈余量：可点直径 36 CSS，220 宽的画布上手指点得中，
   又不会把旁边的槽壁与那片软影一起算成把手。 */
const TIP_GRAB_RADIUS_CSS = 18;

/** 点到线段的距离（CSS 像素空间，只给命中测试用，见 setupScene 里的 eventHandler.hitTest） */
function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export async function setupScene(root: TgpuRoot, context: GPUCanvasContext) {
  const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
  const canvas = context.canvas as HTMLCanvasElement;

  const NUM_POINTS = 17;
  /* ⚠ 2026-10-17 第四轮试过把终点从 0.9 改成 1.0（想让 DARK_END=1.0 真的可达），
     **否决**：链长变了之后果冻的 SDF 直接破面 —— 画面出现一块巨大的灰色多边形
     （目检 `_tt-K2-knob.png`）。原版的点间距/压缩/贝塞尔纹理都对 1.9 的总长有隐含依赖。
     ⇒ 不动物理，改为把 **DARK_END 定义成链的真实极限 0.9**（见 constants.ts）。 */
  const slider = new Slider(root, d.vec2f(-1, 0), d.vec2f(0.9, 0), NUM_POINTS, -0.03);
  const bezierTexture = slider.bezierTexture.createView();
  const bezierBbox = slider.bbox;

  const digitsProvider = new NumberProvider(root);
  await digitsProvider.fillAtlas();
  const digitsTexture = digitsProvider.digitTextureAtlas.createView(d.texture2dArray(d.f32));

  /* ★ 本站改（2026-10-17 第二轮）：0.5 → 1.0。
     画布当时只有 168×76 CSS（dpr 2 = 336×152 物理像素），0.5 时渲染目标只有
     168×76，放大到显示尺寸后槽与果冻都发糊、百分比小字也糊成一团。
     1.0 是这一尺寸下的 1:1（retina 上是 2× 超采样）。

     ★★ 2026-10-17 第五轮返工：1.0 → **2.0**（站主：「为什么这个边缘有锯齿那么糊」）。
     画布长到 220×136 之后，1.0 就是**逐设备像素**渲染：果冻与槽的轮廓是 SDF 的硬边界，
     WebGPU 默认没有 MSAA ⇒ 边缘是二值台阶。实测（dpr 2、同一取景、只切这一个旋钮）：
       1:1    39 行过渡里 **13 行（33.3%）零过渡像素**（86 → 254 一跳）
       2× SSAA 36 行过渡里只有 **3 行（8.3%）**，且出现 4 像素宽的过渡行
     2.0 时渲染目标是 880×544，blit 用 `linear` 采样降回 440×272（2×2 平均）。
     开销涨 4 倍像素，但这个装置**静止即停帧** ⇒ 只有拖动的那一两秒在算，稳态零成本。 */
  let qualityScale = 2.0;
  let [prevCanvasWidth, prevCanvasHeight] = [canvas.width, canvas.height];
  let [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];

  let textures = createTextures(root, width, height);
  let backgroundTexture = createBackgroundTexture(root, width, height);

  const filteringSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const camera = new CameraController(
    root,
    d.vec3f(0.024, 2.7, 1.9),
    d.vec3f(0, TOGGLE_TARGET_Y, 0),
    d.vec3f(0, 1, 0),
    TOGGLE_FOV,
    width,
    height,
  );

  const sliderBBox = tgpu.const(SdfBbox, {
    left: bezierBbox[3],
    right: bezierBbox[1],
    bottom: bezierBbox[2],
    top: bezierBbox[0],
  });

  const sceneParamsUniform = root.createUniform(SceneParams, {
    seed: d.vec2f(),
    jellyColor: d.vec4f(1.0, 0.45, 0.075, 1.0),
    light: {
      direction: std.normalize(d.vec3f(0.19, -0.24, 0.75)),
      color: d.vec3f(1, 1, 1),
    },
    groundTint: GROUND_TINT_LIGHT,
    blurEnabled: 0,
  });

  const group = root.createBindGroup(layout, {
    filteringSampler,
    bezierTexture,
    digitsTexture,
    endCap: slider.endCapUniform.buffer,
    sceneParams: sceneParamsUniform.buffer,
  });

  const rayMarchPipeline = root
    .with(cameraAccess, camera.cameraUniform)
    .with(sliderBBoxAccess, sliderBBox)
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: rayMarchFragmentFn,
      targets: { format: 'rgba8unorm' },
    })
    .with(group);

  /**
   * Responsible for rendering the bound texture to the screen as is
   *
   * ★★ 2026-10-17 第五轮：**这一层既不做抠像，也不填底色，只透传 alpha**。
   *   历史（别再走回去）：
   *     · 第三轮：按亮度识别"地面"、把 alpha 压到 79%/94% —— 那是为了绕过色调映射的 220 上限；
   *     · 第四轮：色调映射改成以纸色为锚点，地面精确等于纸白，抠像删掉，但画布**不透明**；
   *       后果是地面变成一块**不透明纸色板**，把关于页的 ∞ 底纹整个盖住，影子也在画布边界硬切。
   *     · 第五轮（站主：「直接把按钮背景改透明，影子直接出现在关于页的背景上」）：
   *       地面不再画颜色、只画影（见 rayMarchFragmentFn 里的 shade → a），blit 把 alpha 原样送出。
   *   画布是 `alphaMode: 'premultiplied'`（theme-toggle.ts）⇒ 这里拿到的 rgb 已经是预乘值，
   *   直接写给画布，半透明处由页面自己补底 —— 也就是"影子落在关于页的背景上"。
   *   ⚠ 画布必须 `alphaMode: 'premultiplied'`，否则半透明区会当不透明画。
   *   ⚠ 别再写 `vec4f(c.rgb, 1.0)`：那会把地面重新填成一块不透明纸色，底纹又一次被盖住。
   *   ⚠ 也别在这里二次乘 alpha（比如 `c.rgb * c.a`）：rgb 在 rayMarch 片元里已经乘过，
   *     再乘一次会让影子的边缘出现一圈"亮环"。
   *   ⚠ 画布高度 104（ThemeToggle.astro / about.astro 同步）仍然要保留 —— 影子要地方铺，
   *     边缘淡出只兜最后 6px，不能靠它把一圈大影子救回来。
   */
  const blitPipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu';
      return std.textureSample(sampleLayout.$.currentTexture, filteringSampler.$, uv);
    },
  });

  const eventHandler = new EventHandler(canvas);
  let lastTimestamp: number | null = null;
  let lastDt = 0;
  let frameCount = 0;
  let warmedUp = false;
  const taaResolver = new TAAResolver(root, width, height);

  function createBindGroups() {
    return {
      rayMarch: root.createBindGroup(rayMarchLayout, {
        backgroundTexture: backgroundTexture.sampled,
      }),
      render: [0, 1].map((frame) =>
        root.createBindGroup(sampleLayout, {
          currentTexture: taaResolver.getResolvedTexture(frame),
        }),
      ),
    };
  }
  let bindGroups = createBindGroups();

  function onResize() {
    [prevCanvasWidth, prevCanvasHeight] = [canvas.width, canvas.height];
    [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];
    camera.updateProjection(TOGGLE_FOV, width, height);
    textures = createTextures(root, width, height);
    backgroundTexture = createBackgroundTexture(root, width, height);
    taaResolver.resize(width, height);
    frameCount = 0;

    bindGroups = createBindGroups();
  }

  /* ★★ 2026-10-17 第二轮：静止即停帧（站主：「按钮上的数字抖动」）。
     病灶不是数字本身，是**画面每帧都在重算**：每帧换随机 seed + 相机 Halton jitter，
     TAA 只做时域混合 ⇒ 静止时画面也一直"没收敛"，高频小字（百分比）看起来就在抖；
     对一枚开关按钮，持续出帧还白烧 GPU。
     ⇒ 指针没按、没有吸附动画、手柄也不再移动时，再出 90 帧（≈1.5 s，让 TAA 收敛、
       果冻物理落定）然后停帧；任何新交互由 EventHandler.wake 唤醒（见 events.ts）。 */
  const IDLE_FRAMES_TO_STOP = 90;
  let animationFrameHandle = 0;
  let idleFrames = 0;
  let lastMouseX = Number.NaN;

  /* ★★ 2026-10-17 第六轮（站主：「刚点进这个关于页、按钮刷新出来的时候，软条突出部分的
     下部是黏在一起的；把这个软条拉到暗色再拉回亮色才不会粘在一起」）。

     **不是"物理还没收敛"**，是首帧的果冻链正处在一个**退化平衡点**上，三件事叠在一起：

       ① 17 个点被摆成一条**水平直线**，y 一律取到钳位下限 `baseY + yOffset`（−0.03）；
       ② 物理里**没有重力** —— `#integrate` 只有 Verlet 惯性和压缩时的拱形偏置，
          所以这条直线本身就是一个合法解，**没人碰它，它永远不会自己抬起来**；
       ③ 而 `getSceneDist` 是 `opUnion(地面, 果冻)`：果冻下半截埋在地面里时两者合成
          **同一张面**（没有交线、没有接触影）⇒ 看着就是"黏在一起"。

     站主手工做的那两步之所以能修好：`#targetX` 突变会让段长约束被违反，链条被拽开、
     抬离地面，之后同样没有重力把它按回去，于是停在新平衡态上。

     ⇒ 修法就是**在首帧之前把这件事自动做一遍**（而不是给初值硬塞一个形状 ——
       手搓的拱形和约束解出来的形状对不上，会看到一次跳变）。
     顺带解决第二个首帧病灶：首帧 `deltaTime = 0` ⇒ `update()` 直接 return ⇒
     **贝塞尔纹理一次都没被写过**，首帧采样到的是未初始化纹理（distance 全 0
     ⇒ 整个 bbox 都被判成"内部"），那本身就是一坨。
     ⚠ 中间步 `dispatchBezier = false`，只留最后一次派发（理由见 slider.ts 的注释）。 */
  function warmUpJelly() {
    slider.setDragX(DARK_END);
    for (let i = 0; i < 30; i++) slider.update(1 / 60, false);
    slider.setDragX(eventHandler.currentMouseX);
    for (let i = 0; i < 45; i++) slider.update(1 / 60, false);
    slider.update(1 / 60);
  }

  function render(timestamp: number) {
    if (canvas.width !== prevCanvasWidth || canvas.height !== prevCanvasHeight) {
      onResize();
    }

    frameCount++;
    camera.jitter();
    const deltaTime = Math.min(
      lastTimestamp !== null ? (timestamp - lastTimestamp) * 0.001 : 0,
      0.1,
    );
    lastTimestamp = timestamp;
    lastDt = deltaTime;

    sceneParamsUniform.patch({
      seed: d.vec2f((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
    });

    if (!warmedUp) {
      warmedUp = true;
      warmUpJelly();
    }

    eventHandler.update();
    slider.setDragX(eventHandler.currentMouseX);
    slider.update(deltaTime);

    const mouseX = eventHandler.currentMouseX;
    const moving =
      eventHandler.isPointerDown ||
      eventHandler.isSnapping ||
      Number.isNaN(lastMouseX) ||
      Math.abs(mouseX - lastMouseX) > 1e-4;
    lastMouseX = mouseX;
    idleFrames = moving ? 0 : idleFrames + 1;

    const currentFrame = frameCount % 2;

    rayMarchPipeline
      .withColorAttachment({
        view: textures[currentFrame].sampled,
      })
      .draw(3);

    taaResolver.resolve(textures[currentFrame].sampled, frameCount, currentFrame);

    blitPipeline
      .with(bindGroups.render[currentFrame])
      .withColorAttachment({
        view: context,
      })
      .draw(3);

    if (idleFrames < IDLE_FRAMES_TO_STOP) {
      animationFrameHandle = requestAnimationFrame(render);
    } else {
      /* 停帧：画布保留最后一帧（TAA 已收敛，静态图是干净的）。
         重启由 wake() 负责 —— 交互事件会调它。 */
      animationFrameHandle = 0;
    }
  }

  function wake() {
    if (animationFrameHandle !== 0) return;
    lastTimestamp = null;     // 重启后的第一帧不要拿到巨大的 dt
    lastMouseX = Number.NaN;  // 视为"刚动过"，重新打开 90 帧窗口
    idleFrames = 0;
    animationFrameHandle = requestAnimationFrame(render);
  }

  /* ★★ 本站改（2026-10-17 第七轮 → 第八轮）：命中区只剩**端头这一个把手**。

     第七轮（站主：「点原来那个框内部都能拖动软条的 bug，要求是只有点软条时才能拖动」）
     把命中区从「整块画布」收到了「整条软条」—— 遍历 17 个点组成的折线，量指针到
     折线的距离。第八轮站主再收一档：「变成只有点软条右边的端头才能拖动」。
     ⇒ 现在只量**最后一节**（`points[last-1]` → `points[last]`），也就是端头那一小段。

     ⚠ 命中区**不能**用固定矩形：软条是 17 个点的物理链条，形状每帧都在变
       （压缩时拱起、跟手时弯、端头是半径 0.17 的扇形）。固定矩形要么太松
       （就是站主报的"整块都能拖"），要么在链条拱起来时点在把手上也不算。
     ⚠ 也**不能**把端头写死成"画面右边"：`points[last]` 是 tip 端，它跟着主题走 ——
       亮色档 `targetX = LIGHT_END` 时把手在槽的左端，深色档在右端。
       物理上的"把手"永远是 tip，左右只是它当前停在哪。
     ⇒ 把**当前链条的末段**投到画布 CSS 像素上，量指针到这一小段的距离：
         点来自 `slider.points`（物理积分后的真实位置，不是构造时那条直线），
         投影走 `camera.project`（不含 jitter，见那里注释）。
       `eventHandler.hitTest` 只在 pointerdown 时调一次（拖动期间不再判定），
       所以这点 CPU 开销与那次交互绑定，不进渲染循环。 */
  eventHandler.hitTest = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const pts = slider.points;
    const last = pts.length - 1;
    if (last < 1) return false;

    const a = camera.project(pts[last - 1][0], pts[last - 1][1], 0);
    const b = camera.project(pts[last][0], pts[last][1], 0);
    const d = segmentDistance(
      px,
      py,
      a.x * rect.width,
      a.y * rect.height,
      b.x * rect.width,
      b.y * rect.height,
    );
    return d < TIP_GRAB_RADIUS_CSS;
  };

  eventHandler.wake = wake;
  wake();

  return {
    rayMarchPipeline,
    backgroundTexture,
    eventHandler, // ★ 本站加：主题切换需要驱动吸附（snapTo/setInitial）与读当前值
    get qualityScale() {
      return qualityScale;
    },
    set qualityScale(v: number) {
      qualityScale = v;
      onResize();
    },
    set lightDirection(v: d.v3f) {
      sceneParamsUniform.patch({
        light: {
          direction: v,
        },
      });
    },
    set jellyColor(v: d.v4f) {
      sceneParamsUniform.patch({
        jellyColor: v,
      });
    },
    /* ★ 2026-10-17 第三轮：地面基准色（rgb = 跟 --paper 走，w = 深色程度 0..1）。
       ⚠ 必须 wake() —— 静止时是**停帧**的，只 patch uniform 不排帧的话，
         切主题后画面要等到下一次交互才更新（观感是"切了没反应"）。 */
    set groundTint(v: d.v4f) {
      sceneParamsUniform.patch({
        groundTint: v,
      });
      wake();
    },
    set blurEnabled(v: boolean) {
      sceneParamsUniform.patch({
        blurEnabled: v ? 1 : 0,
      });
    },
    async computeOptimalQuality() {
      if (!hasTimestampQuery) {
        return 0.5;
      }

      const targetFrameTime = 5;
      const tolerance = 2.0;
      let resolutionScale = 0.3;
      let lastTimeMs = 0;

      const measurePipeline = rayMarchPipeline.withPerformanceCallback((start, end) => {
        lastTimeMs = Number(end - start) / 1e6;
      });

      for (let i = 0; i < 8; i++) {
        const testTexture = root
          .createTexture({
            size: [canvas.width * resolutionScale, canvas.height * resolutionScale],
            format: 'rgba8unorm',
          })
          .$usage('render');

        measurePipeline
          .withColorAttachment({
            view: testTexture,
          })
          .with(
            root.createBindGroup(rayMarchLayout, {
              backgroundTexture: backgroundTexture.sampled,
            }),
          )
          .draw(3);

        await root.device.queue.onSubmittedWorkDone();
        testTexture.destroy();

        if (Math.abs(lastTimeMs - targetFrameTime) < tolerance) {
          break;
        }

        const adjustment = lastTimeMs > targetFrameTime ? -0.1 : 0.1;
        resolutionScale = Math.max(0.3, Math.min(1.0, resolutionScale + adjustment));
      }

      return resolutionScale;
    },
    onCleanup() {
      cancelAnimationFrame(animationFrameHandle);
      animationFrameHandle = 0;
    },
  };
}
