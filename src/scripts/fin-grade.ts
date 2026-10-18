/**
 * 立体 ∞ 的 grade 后处理 —— 照搬 rhine-lock 的 `GradeEffect` 里**色彩那三步**。
 *
 * ★ 为什么非搬不可（2026-10-18 实测）：
 *   原版的 `renderer.toneMapping = NoToneMapping`（Stage.ts:162），它自己做
 *   「exposure → tone curve → 降饱和」；本站原先用的是 ACES。实测色差：
 *     · 装置区域最亮 5% 均值 `#F7EAC7`，**R−B 差 48.3** —— 这就是站主说的「发棕」。
 *       中性白该是 5~10，连原版的纸色 `(239,228,212)` 本身也只有 27。
 *     · 亮度中位只有 106（95 分位 228）—— **照度不足**，一半装置像素在暗部。
 *   ACES 对暖色有系统性偏黄，且不提供原版那种「高光去饱和」。
 *   而原版的 `sat = 0.7`（LOOK.sat）正是**专门为了把暖色拉回中性**：
 *   暖白本体 × 暖白 key = 暖色，靠这一步才回到「纸白」。
 *
 * 只搬这三步，**不搬**原版 grade 里的暗角 / 色差 / 撕裂 / 纸纹：
 *   那些是它应用层（整屏界面）的观感部件，本站是页面背景底纹，
 *   叠在正文下面，加暗角等于给正文蒙一层灰。
 *
 * 与原版的唯一差别：原版最后一层是手动 `g_toSrgb`（配合
 * `outputColorSpace = LinearSRGBColorSpace`），本站保留 `SRGBColorSpace` ——
 * three 末尾做的是同一条标准 sRGB 曲线，**结果等价**，且少改一处渲染状态。
 */

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Uniform } from 'three';

/** LOOK.exposure / LOOK.sat（原版 Stage.ts:21）。 */
export const FIN_GRADE = {
  exposure: 1.5,
  sat: 0.7,
} as const;

/**
 * Khronos PBR Neutral（原版 shaders.ts 的 `g_neutral`，逐字照抄）。
 * 它做两件事：柔和高光肩 + **高光区去饱和**（峰值越接近白，饱和度拉得越狠）。
 */
const GRADE_FRAGMENT = /* glsl */ `
uniform float uExposure;
uniform float uSat;

vec3 fin_neutral(vec3 color) {
    float startCompression = 0.8 - 0.04;
    float desaturation = 0.15;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;
    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb * uExposure;
    c = fin_neutral(c);
    c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSat);
    /* alpha 原样带出：装置是叠在正文下面的装饰层，边缘是半透明的，
       这里动 alpha 就等于自己把画布裁了（AGENTS 事故表那条 display:none 的教训）。 */
    outputColor = vec4(c, inputColor.a);
}
`;

export function createFinGrade(): Effect {
  return new Effect('FinGrade', GRADE_FRAGMENT, {
    blendFunction: BlendFunction.NORMAL,
    attributes: EffectAttribute.NONE,
    uniforms: new Map<string, Uniform>([
      ['uExposure', new Uniform(FIN_GRADE.exposure)],
      ['uSat', new Uniform(FIN_GRADE.sat)],
    ]),
  });
}