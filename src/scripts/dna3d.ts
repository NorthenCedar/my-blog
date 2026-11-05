
import { onPage } from './page-lifecycle';
onPage(({document, window, addEventListener, matchMedia, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, IntersectionObserver, MutationObserver}) => {
// 真 3D DNA 双螺旋（2026-09-30，站主拍板「用 three.js，接受破例」）
//
// 几何与自转移植自视觉原型 nc-rhine-v7 v10.3 —— 原型那版是在无头 Chrome 里
// 跑真 WebGL 逐项量测调出来的（_probe/ 下有 geom-pca / geom-axis / axisangle / orderfix
// / tilt-lab 五份取证脚本），这些结论直接搬过来。2026-10-19 另加亮暗主题配色。
//
// ---------------------------------------------------------------------------
// 加载策略（本站在原型之上多出来的唯一一处改动）
//
//   原型是整页 <script type="module"> 直接静态 import three。
//   本站有 JS 预算守护（tests/build-output.test.ts：首页内联 ≤ 7168 B），
//   所以拆成两层：
//     · 本文件（小）→ 被首页 <script> 静态引用，Astro 打成 /_astro/dna3d.*.js；
//     · three + GLTFLoader（大）→ 走**动态 import**，
//       只在「容器在 + 非 reduced-motion + WebGL 可用 + 首屏在视口」时才真正下载。
//  于是：减弱动效的用户、不支持 WebGL 的设备、直接滚过首屏的访问，都不付这份流量。
//
//  ★ 第二层为什么是 `./dna-scene` 而不是直接 `import('three')`：
//    直接动态 import 拿到的是**整个命名空间对象**，打包器判断不出哪些导出最终没被使用
//    ⇒ 整包 657 KB 只能全部保留。改经 dna-scene.ts 的**具名静态 re-export** 之后，
//    打包器就能摇掉用不到的部分。详见该文件头部注释。
//
// ---------------------------------------------------------------------------
// ★★★ 缩放与平移的施加顺序（v10.3 的根本坑，别改）★★★
//
//   站主原话：「这个DNA要绕着他自己的中心转啊，你这样感觉他左右移来移去的」
//
//   真根因不是旋转轴选错（PCA 实测主轴与 Y 轴夹角 0.01°，「绕 Y 自转」是对的），
//   而是 three.js 的 `object.position` 在**父空间**里平移、**不受自身 scale 影响**：
//     旧写法「先 position = -bboxCenter，再 scale = k(≈3.2)」
//       → 平移量还是按原尺度算的 0.245，而模型本体已被缩到 1/3
//       → 那点平移相对模型胀大了 3.2 倍
//       → 螺旋轴被推到离旋转中心 0.245 的地方，整根螺旋绕一条**离自己很远的平行轴**公转
//   正解：**先 scale.setScalar(k)，再 position.set(-c.x*k, -c.y*k, -c.z*k)** —— 平移量乘 k。
//   真机对照：旧（先平移后缩放）中心 X 漂移 292.7px；新（先缩放后平移）**0.3px**。
//
// ★★★ 不要再拿「倾斜后的包围盒」回推位置（第二坑）★★★
//   柱体被 tilt 旋转 26° 后，轴对齐包围盒会胀成大方块（宽 500+ 而本体只有 113），
//   用它的中心去补偿 = 把柱子推出光轴。真机对照：
//     加 bbox 补偿 → 漂移 23.9px、宽度虚胀 500~554
//     不加补偿     → 漂移 **0.39px**、宽度稳定 112~114  ✓
//
// 转速：0.26 rad/s ≈ 50s 一圈（站主「转速调慢一点」，从 0.55 调下来的）。

const host = document.getElementById('dnaStack');

/** 没容器 / 用户要求减弱动效 → 一行都不往下走（three 也就不会被下载）。 */
if (host && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  boot(host);
}

async function boot(host: HTMLElement) {
  // ---- 先探 WebGL：不支持就退回纯深墨绿场，一个字节的 three 都不拉 ----
  const probe = document.createElement('canvas');
  const ok = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  if (!ok) return;

  // ---- 首屏在视口里才启动（直接锚点到 #s2 进来的访问不用付这份流量）----
  const inView = await onceVisible(host);

  // ---- 到这里才真正下载 three + GLTFLoader（独立 chunk）----
  //      走 ./dna-scene 而不是裸 'three'：只有具名导出才能让打包器摇掉用不到的部分（见文件头）。
  const [THREE, loaderMod] = await Promise.all([
    import('./dna-scene'),
    import('../vendor/GLTFLoader.js'),
  ]);
  if (!inView || !host.isConnected) return; // 下载期间滚走了：别白烧 GPU

  let renderer: import('three').WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return;
  }
  if (!renderer.getContext()) return;

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0); // 透明：让 .hero 的深墨绿透上来
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  /* 窄焦段 → 透视压缩更强，螺旋端头缩得明显，更像 PPT slide1 的镜头 */
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  cam.position.set(0, 0, 8);
  cam.lookAt(0, 0, 0);

  /* 灯色与双链材质跟随首页主题；亮色保留原 GLB 材质。 */
  const sky = new THREE.HemisphereLight(0xd8ece0, 0x1a2b23, 1.2);
  scene.add(sky);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1.1, 1.5, 1.3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8d4bc, 0.85);
  fill.position.set(-1.4, 0.3, 0.8);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(-0.5, 1.1, -1.5);
  scene.add(rim);

  let spin: import('three').Group | null = null;
  let raf = 0;
  let live = false;
  let t0 = performance.now();

  const renderOnce = () => {
    if (spin) renderer.render(scene, cam);
  };

  const surfaces: { material: import('three').MeshStandardMaterial;
    original: import('three').MeshStandardMaterial; chain: number }[] = [];
  const paintTheme = () => {
    const cs = getComputedStyle(host);
    const color = (name: string) => cs.getPropertyValue(name).trim();
    sky.color.set(color('--dna-sky'));
    sky.groundColor.set(color('--dna-ground'));
    key.color.set(color('--dna-key'));
    fill.color.set(color('--dna-fill'));
    rim.color.set(color('--dna-rim'));
    const dark = document.documentElement.classList.contains('dark');
    for (const { material, original, chain } of surfaces) {
      if (dark) {
        material.color.set(color(chain % 2 ? '--dna-body-graphite' : '--dna-body-copper'));
        material.metalness = 0.35;
        material.roughness = 0.48;
      } else {
        material.color.copy(original.color);
        material.metalness = original.metalness;
        material.roughness = original.roughness;
      }
    }
    renderOnce();
  };
  paintTheme();
  const themeObserver = new MutationObserver(paintTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  addEventListener('pagehide', () => {
    live = false; themeObserver.disconnect(); renderer.dispose();
    scene.traverse(object => { const mesh=object as import('three').Mesh; if(mesh.isMesh){mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();} });
  }, { once: true });

  const fit = () => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    cam.aspect = r.width / r.height;
    cam.updateProjectionMatrix();
    renderOnce();
  };

  new loaderMod.GLTFLoader().load(
    '/dna-slim.glb',
    (gltf: { scene: import('three').Object3D }) => {
      const src = gltf.scene;
      if (!host.isConnected) { src.traverse(object=>{const mesh=object as import('three').Mesh;if(mesh.isMesh){mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();}});return; }

      // GLB 两条链共用同一材质；逐链克隆后才能分别设铜色与石墨色。
      let chain = 0;
      src.traverse((object) => {
        const mesh = object as import('three').Mesh;
        if (!mesh.isMesh) return;
        const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const materials = originals.map((source) => {
          const original = source as import('three').MeshStandardMaterial;
          const material = original.clone();
          surfaces.push({ material, original, chain });
          return material;
        });
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
        chain++;
      });
      paintTheme();

      // 1) 量原始 bbox（此刻未做任何变换）
      const box0 = new THREE.Box3().setFromObject(src);
      const bboxC = box0.getCenter(new THREE.Vector3());
      const size0 = box0.getSize(new THREE.Vector3());

      // 2) 按「高度贴合视野」定缩放系数（留 8% 余量，整根螺旋完整入画）
      const halfH = Math.tan(((cam.fov * Math.PI) / 180) / 2) * cam.position.z;
      const k = (halfH * 2 * 0.92) / size0.y;

      // 3) ★先缩放、平移量乘 k —— 螺旋轴这才真正落到容器原点
      src.scale.setScalar(k);
      src.position.set(-bboxC.x * k, -bboxC.y * k, -bboxC.z * k);

      // 4) 层级：tilt（固定倾角）在外，spin（绕 Y 自转）在内。
      //    螺旋轴已压在 spin 的原点上 ⇒ 内层绕 Y 转 = 绕螺旋自己的中心轴原地转。
      const tilt = new THREE.Group();
      tilt.rotation.set(0.1, 0.3, 0.46); // 照 slide1 的 3D 模型朝向
      const spinGroup = new THREE.Group();
      spinGroup.add(src);
      tilt.add(spinGroup);
      scene.add(tilt);
      spin = spinGroup;

      renderer.domElement.classList.add('is-ready');
      renderOnce();
      if (!raf && live) raf = requestAnimationFrame(tick);
    },
    undefined,
    () => {
      /* 加载失败：静默，保持纯深场 */
    },
  );

  const tick = (now: number) => {
    raf = 0;
    if (!live) return;
    const t = (now - t0) / 1000;
    // 绕模型自身长轴匀速自转：0.26 rad/s ≈ 50s 一圈（站主要求调慢）
    if (spin) spin.rotation.y = t * 0.26;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(tick);
  };

  fit();
  addEventListener('resize', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(host);

  /* 出视口停帧（首屏滚走就别烧 GPU）。 */
  live = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) {
            live = true;
            t0 = performance.now();
            if (!raf && spin) raf = requestAnimationFrame(tick);
          } else {
            live = false;
            if (raf) {
              cancelAnimationFrame(raf);
              raf = 0;
            }
          }
        }
      },
      { threshold: 0 },
    ).observe(host);
  }
  if (!raf && spin) raf = requestAnimationFrame(tick);
}

/** 等元素进入视口一次；不支持 IntersectionObserver 就当作已在视口。 */
function onceVisible(el: HTMLElement): Promise<boolean> {
  if (!('IntersectionObserver' in window)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) {
            io.disconnect();
            resolve(true);
          }
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
  });
}

},"#dnaStack");
