import * as THREE from '../vendor/three.module.min.js';
import { extendChainToEdges } from '../lib/forge-geometry';
const palette = name => getComputedStyle(document.body).getPropertyValue('--forge-' + name).trim();

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// 连续的封闭金属带，两次中心交叉保留真实前后深度。
function stripPoint(t) {
  return new THREE.Vector3(3.12 * Math.cos(t), 1.19 * Math.sin(2 * t), .47 * Math.sin(t));
}
function stripFrame(t) {
  const tangent = new THREE.Vector3(-3.12 * Math.sin(t), 2.38 * Math.cos(2 * t), .47 * Math.cos(t)).normalize();
  const flat = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
  const normal = flat.applyAxisAngle(tangent, .2 * Math.sin(t + .4) + .12 * Math.sin(2 * t));
  const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
  return { normal, binormal };
}
function ribbonGeometry(segments = 320) {
  const ring = 20, positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments * Math.PI * 2, center = stripPoint(t), { normal, binormal } = stripFrame(t);
    const width = .72 + .04 * Math.cos(2 * t);
    for (let j = 0; j <= ring; j++) {
      const a = j / ring * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const u = width * .5 * Math.sign(c) * Math.pow(Math.abs(c), .3);
      const v = .068 * Math.sign(s) * Math.pow(Math.abs(s), .3);
      const p = center.clone().addScaledVector(normal, u).addScaledVector(binormal, v);
      positions.push(p.x, p.y, p.z); uvs.push(i / segments * 5, j / ring);
      if (i < segments && j < ring) {
        const a0 = i * (ring + 1) + j, b = a0 + ring + 1;
        indices.push(a0, b + 1, b, a0, a0 + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}
function edgeGeometry(side, segments) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments * Math.PI * 2, p = stripPoint(t), { normal, binormal } = stripFrame(t);
    p.addScaledVector(normal, side * (.72 + .04 * Math.cos(2 * t)) * .48).addScaledVector(binormal, .059);
    points.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), segments, .009, 4, true);
}
class LinkCurve extends THREE.Curve {
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return out.set(.138 * Math.cos(a), .073 * Math.sin(a), 0);
  }
}
function brushTexture() {
  const w = 128, h = 128, data = new Uint8Array(w * h * 4);
  let seed = 91;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < h; y++) {
    const band = 169 + rand() * 45;
    for (let x = 0; x < w; x++) {
      const index = (y * w + x) * 4, value = band + rand() * 9;
      data[index] = data[index + 1] = data[index + 2] = value; data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}
function studioEnvironment(renderer) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const wash = ctx.createLinearGradient(0, 0, 0, 512);
  wash.addColorStop(0, palette('studio-top')); wash.addColorStop(.36, palette('studio-upper')); wash.addColorStop(.64, palette('studio-lower')); wash.addColorStop(1, palette('studio-bottom'));
  ctx.fillStyle = wash; ctx.fillRect(0, 0, 1024, 512);
  ctx.filter = 'blur(12px)';
  ctx.fillStyle = palette('light-key'); ctx.fillRect(70, 80, 130, 280); ctx.fillRect(580, 70, 230, 120);
  ctx.fillStyle = palette('studio-panel'); ctx.fillRect(920, 90, 36, 330); ctx.fillRect(300, 120, 55, 230);
  ctx.filter = 'none';
  const map = new THREE.CanvasTexture(canvas); map.mapping = THREE.EquirectangularReflectionMapping; map.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromEquirectangular(map);
  map.dispose(); pmrem.dispose(); return environment;
}

export function createForgeScene(canvas, onFrame) {
  const mobile = matchMedia('(max-width:760px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearAlpha(0); renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene(), environment = studioEnvironment(renderer); scene.environment = environment.texture;
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 80); camera.position.set(0, 0, 20); camera.lookAt(0, 0, 0);
  const key = new THREE.DirectionalLight(palette('light-key'), 3.2); key.position.set(-4, 7, 9); scene.add(key);
  const fill = new THREE.DirectionalLight(palette('light-fill'), 2.4); fill.position.set(7, -2, 5); scene.add(fill);
  const rim = new THREE.DirectionalLight(palette('rim'), 2.1); rim.position.set(-3, -3, 6); scene.add(rim);
  scene.add(new THREE.AmbientLight(palette('light-key'), .35));
  const root = new THREE.Group(); scene.add(root);
  const ribbonGroup = new THREE.Group(); root.add(ribbonGroup);
  const brush = brushTexture();
  const metal = new THREE.MeshPhysicalMaterial({ color: palette('metal'), metalness: .96, roughness: .41, roughnessMap: brush, bumpMap: brush, bumpScale: .003, clearcoat: .25, clearcoatRoughness: .19, envMapIntensity: 1.35 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: palette('metal-edge'), metalness: 1, roughness: .18, envMapIntensity: 1.4 });
  const ribbon = new THREE.Mesh(ribbonGeometry(mobile ? 192 : 320), metal); ribbonGroup.add(ribbon);
  ribbonGroup.add(new THREE.Mesh(edgeGeometry(1, mobile ? 192 : 320), edgeMaterial), new THREE.Mesh(edgeGeometry(-1, mobile ? 192 : 320), edgeMaterial));
  const chainMaterial = new THREE.MeshStandardMaterial({ color: palette('chain'), metalness: .97, roughness: .24, envMapIntensity: 1.3 });
  const linkGeometry = new THREE.TubeGeometry(new LinkCurve(), mobile ? 14 : 20, .021, mobile ? 5 : 8, true);
  const paths = [
    [[-9, 3.1, -.8], [-5.3, 2.2, -.6], [-3.5, 1.45, -.4], [-2.55, .25, .86], [-1.5, -.42, .94], [-.05, -.1, 1.02], [1.6, .35, .92], [2.55, -.05, -.84], [4.4, -1.5, -.7], [9, -3.2, -.6]],
    [[-9, -3, -.3], [-5.1, -1.8, .32], [-3.5, -1.2, .4], [-2.2, -.14, -.91], [-1.05, .45, -.85], [.4, .2, -.92], [1.5, -.32, -.65], [2.5, .09, .98], [4.5, 1.6, .55], [9, 3, .1]],
  ];
  // 中段跟随雕塑变换，左右端点则在摄像机坐标中延伸到屏幕外。
  const curves = paths.map(() => new THREE.CatmullRomCurve3([], false, 'centripetal'));
  const chains = curves.map(() => {
    const mesh = new THREE.InstancedMesh(linkGeometry, chainMaterial, 1024);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh); return mesh;
  });
  const temp = new THREE.Object3D(), xAxis = new THREE.Vector3(1, 0, 0), axisQ = new THREE.Quaternion(), zero = new THREE.Vector3(0, 0, 0);
  let target = 0, current = 0, pointerX = 0, pointerY = 0, currentX = 0, currentY = 0;
  let dark = false, reduced = false, active = true, disposed = false, contextLost = false, raf = 0, last = 0, viewHeight = 8, viewWidth = 16, smallScreen = mobile;
  const events = new AbortController();

  function drawChains(progress) {
    const build = smooth(.07, .59, progress);
    root.updateMatrixWorld(true);
    for (let n = 0; n < chains.length; n++) {
      const inner = paths[n].map(p => new THREE.Vector3(...p).applyMatrix4(root.matrixWorld).toArray());
      const mesh = chains[n], curve = curves[n];
      curve.points = extendChainToEdges(inner, viewWidth / 2).map(p => new THREE.Vector3(...p));
      curve.updateArcLengths();
      const count = Math.min(1024, Math.ceil(curve.getLength() / .205) + 1);
      mesh.count = count;
      for (let i = 0; i < count; i++) {
        const entry = i / (count - 1) - (1 - build) * 1.03;
        if (entry < 0) { temp.position.copy(zero); temp.scale.setScalar(0); }
        else {
          const u = clamp(n === 1 ? 1 - entry : entry), point = curve.getPointAt(u), tangent = curve.getTangentAt(u);
          const tension = Math.sin(progress * Math.PI) * .07 * Math.sin(u * Math.PI * 2 + n);
          point.y += tension;
          temp.position.copy(point); temp.quaternion.setFromUnitVectors(xAxis, tangent);
          axisQ.setFromAxisAngle(xAxis, (i % 2) * Math.PI * .5 + .17); temp.quaternion.multiply(axisQ);
          temp.scale.setScalar(smooth(0, .018, entry));
        }
        temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  function renderFrame(time) {
    raf = 0;
    if (disposed || contextLost || !active || document.hidden) { last = 0; return; }
    const dt = last ? Math.min((time - last) / 1000, .06) : 1 / 60; last = time;
    const blend = reduced ? 1 : 1 - Math.exp(-8.5 * dt);
    current += (target - current) * blend;
    currentX += (pointerX - currentX) * blend; currentY += (pointerY - currentY) * blend;
    const settled = Math.abs(target - current) < .00012 && Math.abs(pointerX - currentX) < .0002 && Math.abs(pointerY - currentY) < .0002;
    if (settled) { current = target; currentX = pointerX; currentY = pointerY; }
    const p = reduced ? .62 : current, finish = smooth(.64, 1, p);
    root.rotation.set(-.1 + p * .17 + currentY * .025, -.12 + p * .22 + currentX * .03, .105 - p * .055);
    root.position.y = -viewHeight * (smallScreen ? .058 : .065) + finish * viewHeight * (smallScreen ? .015 : .08);
    root.scale.setScalar(1 - finish * (smallScreen ? .08 : .22));
    ribbonGroup.rotation.y = Math.sin(p * Math.PI) * .08;
    drawChains(p);
    rim.intensity = (dark ? 3.4 : 2.0) + Math.sin(p * Math.PI) * .7;
    renderer.render(scene, camera); onFrame(current);

    if (!settled) raf = requestAnimationFrame(renderFrame); else last = 0;
  }
  function wake() { if (disposed || contextLost) return; if (!raf && active && !document.hidden) raf = requestAnimationFrame(renderFrame); }
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight; if (!width || !height) return;
    smallScreen = width <= 760;
    const aspect = width / height;
    viewHeight = smallScreen ? 8.15 / aspect : 8.7;
    viewWidth = viewHeight * aspect;
    camera.left = -viewWidth / 2; camera.right = viewWidth / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); wake();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const observer = new IntersectionObserver(entries => { active = entries[0].isIntersecting; if (active) wake(); else if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); else if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } }, {signal:events.signal});
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; canvas.parentElement.dataset.ready = 'false'; }, {signal:events.signal});
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; canvas.parentElement.dataset.ready = 'true'; resize(); wake(); }, {signal:events.signal});
  resize(); canvas.parentElement.dataset.ready = 'true';
  return {
    dispose() {
      if (disposed) return; disposed = true; events.abort();
      if (raf) cancelAnimationFrame(raf); resizeObserver.disconnect(); observer.disconnect();
      const geometries = new Set(); scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      [metal,edgeMaterial,chainMaterial].forEach(material => material.dispose());
      brush.dispose(); environment.dispose(); renderer.dispose();
    },
    setProgress(v) { target = clamp(v); if(contextLost)onFrame(target); wake(); },
    setPointer(x, y) { pointerX = reduced ? 0 : x; pointerY = reduced ? 0 : y; wake(); },
    setReduced(value) { reduced = value; pointerX = pointerY = 0; wake(); },
    setTheme(value) {
      dark = value === 'dark';
      metal.color.set(palette('metal')); metal.envMapIntensity = dark ? 1.65 : 1.35;
      edgeMaterial.color.set(palette('metal-edge'));
      chainMaterial.color.set(palette('chain'));
      rim.color.set(palette('rim'));
      key.intensity = dark ? 2.0 : 3.2; fill.intensity = dark ? 1.7 : 2.4;
      renderer.toneMappingExposure = dark ? 1.15 : 1.12; wake();
    },
  };
}
