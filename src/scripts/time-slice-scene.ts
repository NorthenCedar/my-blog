/* =============================================================================
 * TIME SLICE · three 场景 —— 切片链（蝶）/ 环绕玻璃柱阵 / 毛玻璃 / 尽头背光
 *
 * 站主 2026-10-03 第六轮拍板 + 2026-10-02 第七轮反复收紧（对照抖音原片 + 参考截图）：
 *   · **蝴蝶要有飞翔的动作，而且要更灵动、扇动幅度要大** —— 机制仍是「切片」：76 片里
 *     每片的蝶停在**不同的翼相**上（扑翼序列**一次性烘焙进几何**，切片 i 用第
 *     i%FLAP_N 份），镜头逐片经过时连起来才是「飞舞」。★ 全程依然**只有摄像机
 *     在动**，没有任何逐帧拍翼。翼相本身做了三件事让它不像机械摆：① 波形里
 *     叠二次/三次谐波（上下拍不对称）；② **逐档振幅调制**（每只蝶扇得幅度不同）；
 *     ③ 整只蝶沿 Y 轻微起伏（baked 的「浮」）；
 *   · ★ 站主第十轮（2026-10-02）「触角和肢体不要乱动，不要交叉」⇒ 扑翼形变加了
 *     **翅膀掩膜**门控：只有翅膀膜的顶点参与旋转，身体 / 触角 / 六条腿 w 恒为 0，
 *     完全刚性（只跟「浮」平移）。判据、实测空档与踩坑见
 *     `time-slice-core.ts` 的 `splitWings`；
 *   · **「实」只有一片，而且它是硬切的**（站主第七轮：「你看他只有一个蝴蝶是
 *     实的」）—— 落到几何上就是**镜头前方固定距离 FOCUS_DIST 处**（au 最小）的
 *     那一片（镜头骑在链轴上 ⇒ 必在画面中央）。相邻两片的 au 相差一个片距
 *     ⇒ 任一瞬刻恰好一片胜出：不会有「两片都半亮」的双影，也不会有空档；
 *   · **其余蝶的透明度 = 和切片玻璃片一模一样的那个数**（站主第七轮：「透明的
 *     蝴蝶把透明度变得和切片的玻璃片一样」）+ **同一条衰减系数** ⇒ 转动视角时
 *     看到的每一片玻璃上都停着一只很淡的蝶，一直铺到隧道尽头；
 *   · **整个场景只有摄像机在动**（站主第七轮：「蝴蝶是固定在切片上的，不要变
 *     位置」「整个场景中蝴蝶，切片等等位置都不要变幻，只有摄像机的位置在变」）
 *     ⇒ 所有坐标都在建场景时写一次，update() 里一个 position 都不写。唯一每帧
 *     写的是 holder 的 scale —— 那是**投影补偿**（屏上大小恒定），不是位移；
 *   · **摄像机后面的切片不许「出画」**（站主第六轮：「往前的时候摄像机后面的
 *     蝴蝶别动，别往下，只不过是变的半透明了」）⇒ 不再按 i<cur 直接 visible=false，
 *     过掉的片**留在原位、保持原尺度**，只把不透明度降下来；
 *   · **转动视角后**亮出**环绕玻璃柱阵**（原片参考图1）：一根根**整齐等距**的
 *     玻璃柱，每柱 = 沿轴一叠与切片同尺寸的玻璃片；中心 3×3 留空 ⇒ **不贴镜头
 *     这一列**（站主：「不要贴摄像机这列这么近」）。柱里不放蝶；
 *   · **切片玻璃要「毛玻璃」，不要灰色硬线边框**：原来的「一圈圈方框」几何
 *     整个删掉 —— 那些方框的细边就是被点名的灰线。隧道的圈圈改成**每片玻璃
 *     自己的软边**：同一圈轮廓上用「由细到粗、由亮到淡」的一串描边叠出雾带；
 *   · **链的轨迹要有变化**（站主：「轨迹也可以有点变化，看视频里的」）：每片
 *     叠一点**确定性微倾角**（侧倾/偏航/俯仰，来自 tslHash）、位置沿轴两侧
 *     做低频摆动，两端归零。★ 镜头只跟**基准轴**（tslPath），不跟这些摆动
 *     ⇒ 摆动才看得见（镜头若跟着摆，相对位移为零，等于白做）。这些摆动是
 *     常量：**不允许有逐帧的航迹摆动**（那等于让场景自己动起来）；
 *   · **滚轮任何方向都不许动视角**（站主第七轮，原话带六个感叹号：「滚轮往上
 *     滚的时候不要变视角！！！视角和滚轮往下时一模一样！！」）—— 上一轮还留着的
 *     `+0.1*se` 基础方位角已删净：镜头朝向只由拖动与指针视差决定，滚动只推轴；
 *
 * ★★ 2026-10-02 第八轮（站主 5 条 + 截图「窗口／场景」）——**其中第 4 条是
 *   「滚轮往上滚视角不要变」的第三次返工**，前两轮都只改了「参数」没改掉真因：
 *   · **朝向改成结构性保证**（第 4 条）：机位与注视点用**同一个锚**（链参数点）、
 *     只差一个半径 ⇒ 视线方向 = −(sin az cos el, sin el, cos az cos el)，只由
 *     az / el 决定，**与滚动位置无关**。删掉机位那层的二次平滑 camZ（滞后量 L
 *     会让俯仰角随滚动方向摆；向上滚时注视点甚至落到相机身后 ⇒ 画面朝后翻，
 *     实测 camera.rotation.y 漂 116°）。★ 教训：上一版探针只比 az/el（参数），
 *     所以每次都「全绿」；本轮起改比 `camera.rotation`（观测量）并全程采样，
 *     见 `_probe/_bv-look.mjs`；
 *   · **焦点推到「镜头前第三只蝶」**（第 2 条）：FOCUS_DIST 3.4 → 6.6（= 3×
 *     SLICE_GAP），SLICE_SCALE 同步 ×(6.6/3.4) → 2.15（屏上观感不变）；
 *   · **开场整体缩放**（第 1 条「里面的场景一开始小一点，随着慢慢进窗口的同时
 *     恢复原来大小」）：中央链（蝶/玻璃/读数）乘一个由 t 驱动的 grow，0.6 → 1，
 *     只写 scale、位置零改动；菱形窗基准半宽在控制器里 14% → 19%；
 *   · **蝶列玻璃放大 + 轨迹成曲线**（第 5 条）：蝶列 PANE_W 2.6 → 3.6（柱阵仍
 *     2.6，否则柱距 3.8 的缝会没）；sway 改成 x/y 相位差 π/2 的**椭圆**、峰值
 *     0.34 → ≈1.35 世界单位（蝶与它那扇玻璃共用同一个 sway ⇒ 永远停在框心）；
 *   · **转视角后滚滚轮周围切片不消失**（第 3 条）：实测复现（`_probe/_bv-look.mjs`）
 *     表明它就是第 4 条那个朝向漂移的**同一个 bug** —— 画面朝后翻 116° 时，
 *     原本在视野两侧的柱阵/切片自然「不见了」；朝向钉死后同一位置从上方来与
 *     从下方来的画面逐像素一致（gridOp 全程 0.85、panesLoud 无掉档）。
 *   · **虚实只跟滚动位置有关**（第七轮：「蝴蝶的虚实只和摄像机停在什么位置
 *     （鼠标滚轮）有关，转动视角蝴蝶的虚实不变」）⇒ 焦点判据的轴向距离取自
 *     **链锚 camZ**，不取环视之后的真实机位；
 *   · 尽头：走到链尾后镜头继续前推穿过最后一片玻璃，全屏转绿（相册页开场
 *     的深绿）—— 绿幕/切页由控制器负责，本文件只管运镜。★ 第九轮 ③ 之后
 *     收尾画面里**没有菱形环**了（出口那一扇已删），也不再等读者点按钮。
 *
 * ★★ 站主 2026-10-02 第九轮（3 条）——**本文件的几何与判据一个数都没动**，
 *   三条都落在控制器与 DOM 上，这里只留索引：
 *   · ① 剧场右下角那一格从 FRAME 读数换成 **CC-BY 署名**（`index.astro` 的
 *     `.tsl-hud`），穿过菱窗后收起 —— DOM 的事，与场景无关；
 *   · ② 拖动环视变成「一滚滚轮就归零」⇒ 柱阵的驱动量 `amb` 归零、周围切片
 *     收起（**注意**：这正好是第八轮 ③ 的另一面 —— 那一轮修的是「转开视角后
 *     滚滚轮，切片不该凭空消失」，真因是朝向漂移；现在切片是**被收起的**，
 *     不是掉了）；
 *   · ③ 收尾画面里不再有出口菱形环，绿幕一满屏由控制器直接切相册。
 *
 * ★ 蝴蝶模型（第四轮「上网找现成的」，**第六轮重新调色**）：
 *   用 Poly Pizza 的 CC-BY「Monarch Butterfly」（Paul Spooner），本地两步：
 *     ① 抽稀：gltf-transform simplify 58.8k 面 → 3.5k 面，贴图 1024→512；
 *     ② 调色（第六轮，站主参考图1）：**双色重映射** —— 贴图里的**暗部**
 *        （翅脉/翼边/花纹）→ **纯白**，**亮部**（身体/翼膜）→ **淡黄**。
 *        取色来自参考图的直方图（白 ≈ 240/240/240，淡黄 ≈ 240/240/190 一档），
 *        做法与「为什么必须从保住明暗层次的档位出发」见 §6.21。
 *   ★ 朝向由**实测**标定（模型原始姿态是斜的）：先 rotateX(90°) 让翅膀正对
 *     ±Z、body 回水平，再 rotateZ(90°) 把头翻到 +Y。归一后：**翼展沿 ±X
 *     （= 1 单位）、体轴沿 Y、头朝 +Y** —— 扑翼就是绕 Z 轴转（见 makeFlapGeos）。
 *
 * ★ 红线对策（不变）：
 *   · three 是站主 2026-09-30 为首屏 DNA 拍板的既有破例（src/vendor/ 本地化、
 *     astro.config alias），本场景由控制器**动态 import** —— 本装置零新增下载；
 *     GLTFLoader 复用 dna3d 那个 chunk；
 *   · 场景内所有颜色由控制器从 tokens.css 读出后传入（本文件零色值字面量；
 *     画布纹理的透明度用「调色板色 + 8 位 hex 的 alpha 后缀」拼出）；
 *   · 数学（时间轴/链轴/哈希）全部来自 ./time-slice-core（零随机源）。
 * -------------------------------------------------------------------------- */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Fog,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  Sprite,
  SpriteMaterial,
  Texture,
  WebGLRenderer,
} from 'three';

import { splitWings, tslHash, tslPath, TSL_FRAMES, TSL_SECONDS } from './time-slice-core';

/** 蝴蝶模型（public/，与 dna-slim.glb 同一种放法 —— 不打进 JS） */
const MODEL_URL = '/butterfly.glb';

/** 烘焙的翼相档数：切片 i 用第 i%FLAP_N 份几何（76 片 = 4.75 个完整拍翅循环） */
const FLAP_N = 16;
/** 翼相振幅（弧度）：站主第七轮「翅膀扇动幅度大一点」⇒ 0.62 → 0.85（≈49° 上抬）；
 *  下压仍取一半（见 makeFlapGeos 的 phi）。
 *  ★ 旋转轴选「背轴（Z，指向镜头）」而不是「体轴（Y）」—— 这是试出来的：
 *    绕体轴转，翼面只会在正投影里**横向收窄**（60° 时只剩一半），整只蝶会折成
 *    一个楔形（把 16 档翼相并排渲出来看的，`_probe/_bvm-flap-zoom.png`），
 *    完全不像在飞；绕背轴转则是**翼尖在画面里抬落**、两翼张成一个 V 字，
 *    一眼就是扑扇。峰值的横向展幅 cos(49°)=0.66 ⇒ 仍是一只张着翅的蝶，
 *    不会收成一条（这是「幅度能加到多大」的上限依据）。
 *  ★ 逐档振幅还会有 ×(0.78~1.08) 的调制 ⇒ 最大档实际到 ≈53°。 */
const FLAP_AMP = 0.85;
/** 顺带绕体轴后掠一点点（同相位）：翼面不贴着正投影，少了「纸片感」 */
const FLAP_BACK = 0.3;
/** 波形里的二次/三次谐波系数（站主第六轮：「动作再灵动一点」）。
 *  ★ 纯正弦的扑扇看起来是「机械摆」：上拍与下拍等长、每一下一模一样。真蝶的
 *   上拍快、下拍带一点回弹，所以叠一个二次谐波（让波形偏斜）再减一点三次
 *   谐波（把峰压圆）；两翼仍反号 ⇒ 依然是「张 V 字」的读法。 */
const FLAP_H2 = 0.22;
const FLAP_H3 = 0.12;
/** 逐档振幅调制：第 p 档的振幅 = FLAP_AMP × (BASE + SPAN·sin(…))。
 *  16 档不再等幅 ⇒ 沿链走过去看到的是「有时扇得大、有时扇得小」，接近活物。 */
const FLAP_AMP_BASE = 0.78;
const FLAP_AMP_SPAN = 0.3;
/** 整只蝶沿 Y 的轻微起伏（烘进几何的「浮」，单位：归一后蝶宽的倍数） */
const FLAP_BOB = 0.04;

/* 场景色板：控制器从 tokens.css 取好后整包传入（本文件不出现色值字面量）。
   ★ three 的 Color 不认 8 位 hex —— 带 alpha 的 token（--dglass-line）由控制器
     拆成「6 位色 + 独立 alpha」传进来（lineA），场景里用 opacity 承载。 */
export interface TslPalette {
  entryColor: string;
  entryAlpha: number;
  entryGlow: number;
  entryFrame: string;
  deep: string;
  mid: string;
  lift: string;
  glow: string;
  white: string;
  paper: string;
  line: string;
  lineA: number;
}

/* ------------------------------------------------------------------ 几何工具 */

/** 把若干 BufferGeometry 拼成一份（手工拼接，不引 BufferGeometryUtils）。
 *  ★ 只取 position / uv：全站装置一律 MeshBasicMaterial（无光照）⇒ 法线用不到。
 *  ★ 必须走 getX/getY/getZ 逐顶点读，**不能**直接 set(attribute.array)：
 *  glTF 的几何常用**交错缓冲**（InterleavedBufferAttribute），此时 .array 是
 *  整条交错缓冲、比本属性长得多 ⇒ 直接 set 会 RangeError: offset out of bounds
 *  （实测踩过：整个场景初始化崩在这一行）。 */
function mergeGeoms(list: BufferGeometry[]): BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    const p = g.attributes.position as BufferAttribute;
    vCount += p.count;
    iCount += (g.index as BufferAttribute | null)?.count ?? p.count;
  }
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.attributes.position as BufferAttribute;
    const u = g.attributes.uv as BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      if (u) {
        uv[(vo + i) * 2] = u.getX(i);
        uv[(vo + i) * 2 + 1] = u.getY(i);
      }
    }
    const gi = g.index;
    if (gi) {
      for (let i = 0; i < gi.count; i++) idx[io + i] = gi.getX(i) + vo;
      io += gi.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = i + vo;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.setIndex(new BufferAttribute(idx, 1));
  return out;
}

/* ------------------------------------------------------------------ 纹理 */

/** 光点精灵纹理（径向渐变，尽头背光用） */
function makeDotTexture(p: TslPalette): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, p.white);
  g.addColorStop(0.3, p.white);
  g.addColorStop(1, p.glow);
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const fade = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = fade;
  c.fillRect(0, 0, 128, 128);
  return new CanvasTexture(cv);
}

/** 把 alpha（0~1）拼成 8 位 hex 的后两位 —— 全站「颜色自带 alpha」的约定 */
function aHex(a: number): string {
  return Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** 玻璃片纹理 = **毛玻璃**（站主第五轮 + 参考图2：要磨砂感，不要灰色硬线的边框）。
 *
 *  ★ 为什么是这个画法：
 *    · 站主点名的「灰色线的边框」是上一版那份**一圈圈方框的几何** ——
 *      那一份已经整个删掉，隧道的圈圈改由**玻璃片自己的软边**承担；
 *    · 软边 = 同一圈轮廓上叠**由细到粗、由亮到淡**的一串描边：最亮的一笔压在
 *      轮廓线上，往外一层比一层宽、比一层淡 ⇒ 边是「雾带」不是「线」，
 *      而且越往片内越化开，正是磨砂玻璃倒角的样子；
 *    · ★ 不许有任何**铺满整片**的元素：0.05 的掠光叠 76 层就是 98% 白，
 *      整条隧道会洗成白雾、蝶面跟着糊掉（实测踩过）。所以「面」上只留一圈
 *      贴边的极淡雾（radial，中心透亮），中心永远干净；
 *    · 方角改成**圆角**：原片里的方框本来就是软倒角。
 *  透明度走「调色板色 + 8 位 hex 的 alpha 后缀」，零字面量色值。 */
function makeGlassTexture(p: TslPalette): CanvasTexture {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;

  // 圆角方轮廓（路径只建一次，靠 lineWidth 一层层加粗）
  const R = 18;
  const corner = (inset: number) => {
    const a = inset;
    const b = S - inset;
    c.beginPath();
    c.moveTo(a + R, a);
    c.arcTo(b, a, b, b, R);
    c.arcTo(b, b, a, b, R);
    c.arcTo(a, b, a, a, R);
    c.arcTo(a, a, b, a, R);
    c.closePath();
  };

  const STEPS = 14;
  c.lineJoin = 'round';
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1); // 0 = 最亮最细的内沿，1 = 最淡最宽的外化
    c.lineWidth = 2.5 + t * 44;
    c.strokeStyle = p.white + aHex(0.05 * Math.pow(1 - t, 1.7));
    corner(5 + t * 3);
    c.stroke();
  }

  // 贴边的一圈极淡雾（中心透亮 —— 蝶不被糊；只有靠边一圈带磨砂）
  //   ★ 用 radial 而不是 linear：linear 扫过的是一整片，会逐层累加
  const fog = c.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.62);
  fog.addColorStop(0, p.white + '00');
  fog.addColorStop(0.7, p.white + '04');
  fog.addColorStop(1, p.white + '10');
  c.fillStyle = fog;
  c.fillRect(0, 0, S, S);

  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  return tex;
}

/** 每片切片右下角的 FRAME 读数（原片同款口径，但**只有字**）——
 *  ★ 不给底、不给描边：站主第五轮点名「不要灰色的线的边框」，读数也不该
 *  再摆一个灰线小框。 */
function makeLabelTexture(nn: number, tSec: string, p: TslPalette): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 120;
  const c = cv.getContext('2d')!;
  c.fillStyle = p.white + 'cc';
  c.font = '500 34px "IBM Plex Mono", ui-monospace, monospace';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(`FRAME ${String(nn).padStart(2, '0')} / ${TSL_FRAMES} · T+${tSec}S`, 10, 62);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ 模型 */

/**
 * 载入并归一化蝴蝶模型：
 *   · 合并模型里所有 mesh 的几何（只有一张贴图，全部共享）；
 *   · 归心 → 定向（rotateX(90°) 让翅膀正对镜头、rotateZ(90°) 把头翻到上方，
 *     朝向是**实测**出来的：模型的原始姿态是斜的）；
 *   · 归一：翼展 / 体长里的大者 = 1 单位 ⇒ 翼展沿 ±X = 1、体轴沿 Y。
 * 返回 { geo, map }：geo 是**基准翼相**，随后由 makeFlapGeos 烘出各档翼相。
 */
async function loadButterfly(): Promise<{ geo: BufferGeometry; map: Texture }> {
  const mod = (await import('../vendor/GLTFLoader.js')) as unknown as {
    GLTFLoader: new () => {
      load(
        url: string,
        onLoad: (g: { scene: Object3D }) => void,
        onProgress: undefined,
        onError: (e: unknown) => void,
      ): void;
    };
  };
  const gltf = await new Promise<{ scene: Object3D }>((res, rej) => {
    new mod.GLTFLoader().load(MODEL_URL, res, undefined, rej);
  });

  const root = gltf.scene;
  root.updateWorldMatrix(true, true);
  const parts: BufferGeometry[] = [];
  let map: Texture | null = null;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld); // 把节点自身的变换烘进顶点
    parts.push(g);
    const mat = m.material as MeshBasicMaterial;
    if (!map && mat.map) map = mat.map;
  });
  if (!parts.length || !map) throw new Error('butterfly.glb 里没有可用的网格/贴图');

  const geo = mergeGeoms(parts);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  geo.rotateX(Math.PI / 2); // 翅膀面正对 ±Z、body 回到水平
  geo.rotateZ(Math.PI / 2); // 头翻到 +Y（上方）⇒ 翼展落到 ±X、体轴落到 Y
  geo.computeBoundingBox();
  const nb = geo.boundingBox!;
  const k = 1 / Math.max(nb.max.x - nb.min.x, nb.max.y - nb.min.y);
  geo.scale(k, k, k);
  geo.computeBoundingSphere();
  return { geo, map };
}

/**
 * ★ 烘焙扑翼：把「飞」这个动作**一次性做进几何**（站主第五轮：蝴蝶要有飞翔的
 * 动作，而且一次放在切片里）。
 *   · 切片 i 取第 (i % FLAP_N) 份几何 ⇒ 沿链走下去看到的就是一串不同翼相的
 *     静止影像，镜头逐片经过时连起来才是拍翅；**运行时零逐帧动画**；
 *   · 主轴 = **背轴（Z，指向镜头）**：两翼反号绕它转 ⇒ 翼尖在画面里一起抬、
 *     一起落，两翼张成 V 字（这才是「扑扇」的读法；绕体轴转只会把蝶横向压扁
 *     成楔形，见 FLAP_AMP 的注释）。顺带绕体轴（Y）后掠一点点，翼面不贴正投影；
 *   · 上抬 / 下压**不对称**：上抬全量、下压减半 —— 蝶的翼很少压到身体以下太多；
 *   · 翼根（|x| 小）用 smoothstep 加权到 0 ⇒ 根部不动，不会把胸节撕开；
 *   · ★★ **只有翅膀膜动**（站主第十轮：「触角和肢体不要乱动，不要交叉」）：
 *     `wing` 掩膜由 splitWings() 在加载时算出，掩膜外的顶点 w 直接写 0 ⇒
 *     身体 / 触角 / 六条腿**一个字节都不形变**（只跟整只蝶的「浮」平移）。
 *     为什么不能只看 |x| —— 见 time-slice-core.ts 里 splitWings 的长注；
 *   · 只改 position：uv / index 原样复制（法线本来就不需要，全站无光照）。
 */
function makeFlapGeos(
  base: BufferGeometry,
  count: number,
  amp: number,
  wing: Uint8Array,
): BufferGeometry[] {
  const src = base.attributes.position as BufferAttribute;
  const srcUv = base.attributes.uv as BufferAttribute;
  const srcIdx = base.index as BufferAttribute;
  const out: BufferGeometry[] = [];
  const ease = (v: number) => {
    const x = v < 0 ? 0 : v > 1 ? 1 : v;
    return x * x * (3 - 2 * x);
  };
  for (let phase = 0; phase < count; phase++) {
    const th = (Math.PI * 2 * phase) / count;
    /* ① 波形：基频 + 二次谐波（上拍快、下拍带回弹）− 一点三次谐波（压圆峰） */
    let raw = Math.sin(th) + FLAP_H2 * Math.sin(2 * th + 0.7) - FLAP_H3 * Math.sin(3 * th + 2.1);
    if (raw > 1.25) raw = 1.25;
    if (raw < -1.25) raw = -1.25;
    /* ② 逐档振幅调制：每片蝶扇得幅度略有不同（活物的读法，不是等幅机械摆） */
    const ampI = amp * (FLAP_AMP_BASE + FLAP_AMP_SPAN * (0.5 + 0.5 * Math.sin(phase * 1.7 + 0.4)));
    const phi = ampI * (raw >= 0 ? raw : raw * 0.5); // 上抬全量、下压一半
    /* ③ 整只蝶的「浮」：沿 Y 轻微起伏（同一份几何里烘进去，零逐帧动画）。
         这是**均匀平移** ⇒ 翅膀与身体一起浮，不会把任何部件扯开。 */
    const bob = FLAP_BOB * Math.sin(th + 1.2);
    const pos = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      const x = src.getX(i);
      const y = src.getY(i);
      const z = src.getZ(i);
      const sgn = x < 0 ? -1 : 1;
      // 翼根不动、翼尖全量；★ 非翅膀顶点（身体 / 触角 / 肢体）恒 0 ⇒ 完全刚性
      const w = wing[i] ? ease((Math.abs(x) - 0.03) / 0.13) : 0;
      // ① 绕背轴（Z）：两翼反号 ⇒ 翼尖一起抬/落，两翼张开一个 V
      const az = phi * sgn * w;
      const cz = Math.cos(az);
      const sz = Math.sin(az);
      const x1 = x * cz - y * sz;
      const y1 = x * sz + y * cz;
      // ② 绕体轴（Y）后掠一点点：翼面略微离正投影远一点，少些「纸片感」
      const ay = phi * sgn * w * FLAP_BACK;
      const cy = Math.cos(ay);
      const sy = Math.sin(ay);
      pos[i * 3] = x1 * cy + z * sy;
      pos[i * 3 + 1] = y1 + bob;
      pos[i * 3 + 2] = -x1 * sy + z * cy;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('uv', srcUv.clone());
    g.setIndex(srcIdx.clone());
    g.computeBoundingSphere();
    out.push(g);
  }
  return out;
}

/* ------------------------------------------------------------------ 场景 */

export interface TslScene {
  update(s: {
    t: number;
    settle: number;
    exit: number;
    now: number;
    pmx: number;
    pmy: number;
    orbX: number;
    orbY: number;
    amb: number;
    zoom: number;
  }): void;
  resize(w: number, h: number, dpr: number): void;
  render(): void;
  dispose(): void;
}

export async function createTslScene(
  canvas: HTMLCanvasElement,
  pal: TslPalette,
  isCurrent: () => boolean,
): Promise<TslScene | null> {
  /* 调试开关：?tsl-dump=1 ⇒ 状态出口挂 window 供探针读取（放在最前，因为下面的
     翅膀掩膜自检、以及 update 里的状态出口都要用到它） */
  const dumpOn = new URLSearchParams(location.search).has('tsl-dump');

  const { geo: butGeo, map: butMap } = await loadButterfly();
  if (!isCurrent()) {
    butGeo.dispose();
    butMap.dispose();
    return null;
  }
  /* ★ 站主第十轮：「触角和肢体不要乱动，不要交叉」⇒ 先把翅膀膜认出来，
     扑翼形变只作用在掩膜内的顶点（判据与实测见 time-slice-core.ts 的 splitWings）。 */
  const wingSplit = splitWings(
    butGeo.attributes.position.array as Float32Array,
    (butGeo.index as BufferAttribute).array as Uint32Array,
  );
  const flapGeos = makeFlapGeos(butGeo, FLAP_N, FLAP_AMP, wingSplit.mask);

  /* ★ 调试（?tsl-dump=1）：掩膜与「触角/肢体确实静止」的**自检数字**，一次性算好
     （不放进每帧的 dump 里）。判据不是「看着像」，而是可量的：
       · restSpread —— 非翅膀顶点在 16 档翼相之间，位移在各分量上的**极差**。
         整只蝶的「浮」是**均匀平移** ⇒ 理论上极差恒为 0；任何一丝旋转/形变都会
         让极差冒出来。这是「触角与肢体不许乱动」的客观判据。
       · wingMove —— 翅膀顶点的最大位移，必须明显大于 0（否则翅膀没在扇）。 */
  const wingProbe = !dumpOn
    ? null
    : (() => {
        const src = butGeo.attributes.position.array as Float32Array;
        const n = src.length / 3;
        let restSpread = 0;
        let wingMove = 0;
        for (let p = 1; p < flapGeos.length; p++) {
          const q = (flapGeos[p] as BufferGeometry).attributes.position.array as Float32Array;
          const mn = [Infinity, Infinity, Infinity];
          const mx = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < n; i++) {
            const dx = q[i * 3] - src[i * 3];
            const dy = q[i * 3 + 1] - src[i * 3 + 1];
            const dz = q[i * 3 + 2] - src[i * 3 + 2];
            if (wingSplit.mask[i]) {
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d > wingMove) wingMove = d;
            } else {
              const d = [dx, dy, dz];
              for (let c = 0; c < 3; c++) {
                if (d[c] < mn[c]) mn[c] = d[c];
                if (d[c] > mx[c]) mx[c] = d[c];
              }
            }
          }
          for (let c = 0; c < 3; c++) restSpread = Math.max(restSpread, mx[c] - mn[c]);
        }
        return {
          comps: wingSplit.comps,
          wingVerts: wingSplit.wingVerts,
          minWingX: wingSplit.minWingX,
          maxOtherX: wingSplit.maxOtherX,
          restSpread,
          wingMove,
        };
      })();

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const entryColor = new Color(pal.entryColor);
  const tunnelColor = new Color(pal.deep);
  const clearColor = entryColor.clone();
  const entryFrame = new Color(pal.entryFrame);
  const tunnelFrame = new Color(pal.white);
  const frameColor = entryFrame.clone();
  renderer.setClearColor(clearColor, pal.entryAlpha);

  const scene = new Scene();
  // 入口玻璃透出所在页面；穿窗后恢复完整深色隧道，不再叠加透明页面底纹。
  // 链长 165 单位：雾只让最深处那截沉进尽头背光（近处（≈3 单位）零雾）
  scene.fog = new Fog(new Color(pal.deep), 26, 150);

  const camera = new PerspectiveCamera(55, 1, 0.1, 260);
  camera.rotation.order = 'YXZ';

  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ss = (a: number, b: number, v: number) => {
    const x = clamp01((v - a) / (b - a));
    return x * x * (3 - 2 * x);
  };

  const glassTex = makeGlassTexture(pal);
  /* ★ 第八轮 ⑤：「有蝴蝶的这一列切片玻璃可以大一点」—— 放大的只有**带蝶的
     那一列**（2.6 → 3.6）。环绕柱阵（下面的 grid）**仍用 2.6**：柱距 GSTEP
     是按「片边 < 柱距才有缝」定的，柱里的片一跟着放大，整片柱阵就连成一堵
     墙、柱与柱之间的通光缝全没了（站主第六轮要的正是「一格一格整齐等距」）。 */
  const PANE_W = 3.6; // 蝶列玻璃片边长（蝶翼展 SLICE_SCALE 的 1.67 倍 ⇒ 托得住）
  const paneGeo = new PlaneGeometry(PANE_W, PANE_W);
  const GRID_W = 2.6; // 柱阵的片边长（必须 < GSTEP，见上）
  const gridGeo = new PlaneGeometry(GRID_W, GRID_W);

  /* ---- 中央切片链（站主机制：76 片沿轴一列，每片一只**静止**蝴蝶） ----
     ★ 每片 = 一块毛玻璃 + 一只停在某一翼相上的蝶 + 右下角 FRAME 读数。
       76 片共享同一份**翼相几何**（只有 FLAP_N 份，按 i%FLAP_N 取）
       ⇒ 显存只有 FLAP_N 份模型，draw call = 片数 × 2，都是极轻的无光照材质。
     ★ 「只有正前方最近的那一片是实的」由 update() 的判据决定（见那里的长注）。 */
  const N = TSL_FRAMES;
  /* 蝶翼展 → 世界尺度。★ 这一步的来历（两轮连改，别单独动其中任何一个）：
     视张角 = SLICE_SCALE / FOCUS_DIST ⇒ **改 FOCUS_DIST 就必须同比例改这里**，
     否则实蝶在屏上会突然胀大/缩小。
       · 1.9 → 3.4（第七轮「实的蝴蝶离摄像机远一点」）：0.62 → 1.11；
       · 3.4 → 6.6（第八轮「改成摄像机前的第三只蝴蝶为实的」）：1.11 → 2.15。
     6.6 = 3 × SLICE_GAP ⇒ 焦点正好落在「从镜头往前数第三只蝶」上，屏上观感
     （实蝶占屏宽 ≈20%）与前两轮一致。 */
  const SLICE_SCALE = 2.15;
  const PANE_OP = 0.9; // 玻璃片基础不透明度（纹理峰值 alpha 只有 ~0.2 ⇒ 通体极淡）

  /* ★ 轨迹的「变化」（第六轮「轨迹也可以有点变化」→ 第八轮把它明确成
     「不要是一条直线，运动轨迹大一点，可以是一条曲线」）：
     链不再是一根死直线 —— 每片沿一个**椭圆**在横截面里绕（x 与 y 的相位差
     π/2 ⇒ 真曲线，不是现在这种「两个正弦相加」的近似直线），再叠一条次级
     谐波让它不是规整的闭合椭圆。**全部由 i 确定**（零随机源，滚动可逆）。
     ★ 两个关键约束：
       · 幅度必须**两端归零**（taper）—— 入窗那一片与出窗那一片要老实居中；
       · 蝶与它那扇玻璃用**同一个 sway** ⇒ 蝶永远停在框心，摆幅可以放胆加大。
     ★ 镜头只跟基准轴 tslPath(t)，**不跟**这些摆动：镜头若跟着摆，相对位移为零，
       摆动等于白做（这正是原来「链上有弧但看不出来」的原因）。
     ★ 幅度是「摆到看得见」与「隧道不散架」之间的折中：峰值 ≈1.35 世界单位，
       在焦点处（6.6，屏高对应 6.87 单位）≈ 20% 屏高 —— 一眼是条曲线。 */
  const TRAIL_TURN = 0.21; // 沿链的相位步长（76 片 ≈ 2.5 圈）
  const TRAIL_A = 1.05;
  const TRAIL_A2 = 0.3; // 次级谐波（让轨迹不是规整的闭合椭圆）
  const TRAIL_B = 0.6;
  const TRAIL_B2 = 0.22;
  const swayOf = (i: number) => {
    const taper = Math.sin((Math.PI * i) / (N - 1)); // 两端 0、中段 1
    const th = i * TRAIL_TURN;
    return {
      x: taper * (TRAIL_A * Math.cos(th) + TRAIL_A2 * Math.cos(th * 0.37 + 1.9)),
      y: taper * (TRAIL_B * Math.sin(th) + TRAIL_B2 * Math.sin(th * 0.53 + 0.7)),
    };
  };
  /** 每片的姿态微扰：侧倾像在压弯、偏航像在斜飞、俯仰像在起落 */
  const tiltOf = (i: number) => ({
    roll: 0.16 * Math.sin(i * 0.21) + 0.12 * (tslHash(i) - 0.5),
    yaw: 0.13 * Math.sin(i * 0.11 + 1.1) + 0.1 * (tslHash(i + 97) - 0.5),
    pitch: 0.09 * Math.sin(i * 0.07 + 2.3) + 0.06 * (tslHash(i + 211) - 0.5),
  });

  interface Slice {
    z: number;
    bx: number; // 基准轴（tslPath）上的位置 —— holder 的锚点（建场景时写一次）
    by: number;
    wx: number; // 该片自己的摆动量（蝶相对 holder 的**静态**局部偏移）
    wy: number;
    roll: number;
    yaw: number;
    pitch: number;
    holder: Group; // 锚在链轴上的容器：位置静止，只有 scale 每帧动（投影补偿）
    wing: Mesh;
    wingMat: MeshBasicMaterial;
    pane: Mesh;
    paneMat: MeshBasicMaterial;
    label: Sprite | null;
  }
  const slices: Slice[] = [];
  const labelTexs: CanvasTexture[] = [];

  for (let i = 0; i < N; i++) {
    const ti = i / (N - 1);
    const p = tslPath(ti);
    const sway = swayOf(i);
    const tilt = tiltOf(i);
    const sx = p.x + sway.x;
    const sy = p.y + sway.y;

    const wingMat = new MeshBasicMaterial({
      map: butMap,
      transparent: true,
      opacity: 1,
      side: DoubleSide, // 模型是单面的：从背后看（原片视角）必须双面
      depthWrite: false,
      fog: true,
    });
    const wing = new Mesh(flapGeos[i % FLAP_N]!, wingMat);
    wing.scale.setScalar(SLICE_SCALE);
    /* ★★ 静止件（站主第七轮：「整个场景中蝴蝶，切片等等位置都不要变幻，只有
       摄像机的位置在变」「蝴蝶是固定在切片上的，不要变位置」）：
       蝶挂在 holder 上，holder **锚在链轴上、位置一辈子不动**，蝶的局部偏移
       = 该片自己的摆动（也是常量）。update() 里只改 holder 的 scale —— 那是
       投影补偿（把屏上的大小与离轴位移锁死，见 update 里的长注），不写任何
       位置。pane / label 同理：坐标都在这一行定死，之后一个字节都不改。 */
    const holder = new Group();
    holder.position.set(p.x, p.y, p.z);
    wing.position.set(sway.x, sway.y, 0);
    wing.rotation.set(tilt.pitch, tilt.yaw, tilt.roll); // 每片自己的姿态（轨迹的变化）
    holder.add(wing);

    const paneMat = new MeshBasicMaterial({
      map: glassTex,
      transparent: true,
      opacity: PANE_OP,
      side: DoubleSide,
      depthWrite: false,
      fog: true,
    });
    const pane = new Mesh(paneGeo, paneMat);
    pane.position.set(sx, sy, p.z - 0.03);

    // 右下角 FRAME 读数（Sprite 恒面向镜头）；远处不可读 ⇒ 只在焦点附近显示
    const labelTex = makeLabelTexture(i + 1, (ti * TSL_SECONDS).toFixed(2), pal);
    labelTexs.push(labelTex);
    const label = new Sprite(
      new SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.9, depthWrite: false, fog: true }),
    );
    label.scale.set(0.78, 0.183, 1);
    label.position.set(sx + PANE_W * 0.5 - 0.42, sy - PANE_W * 0.5 + 0.14, p.z + 0.06);

    scene.add(holder, pane, label);
    slices.push({
      z: p.z,
      bx: p.x,
      by: p.y,
      wx: sway.x,
      wy: sway.y,
      roll: tilt.roll,
      yaw: tilt.yaw,
      pitch: tilt.pitch,
      holder,
      wing,
      wingMat,
      pane,
      paneMat,
      label,
    });
  }

  /* ---- 环绕玻璃柱阵（转动视角才亮出）——参考图1 的读法：
     中心那一列之外，**一格一格整齐等距**排着许多根玻璃柱；每根柱 = 沿轴一叠
     与切片同尺寸、同 z 的玻璃片。柱里**不放蝶**（站主：「可以里面没有蝴蝶」）。
     ★ 中心 3×3 留空：站主第五轮「不要贴摄像机这列这么近」—— 空掉一圈，
       最近的一根柱离轴 GSTEP，转视角时它整根进画面而不会挤在镜头边。
     ★ 用 InstancedMesh：一份平面 + 一次 draw call 承载近两千片，透明度整组由
       amb 驱动（不转视角 ⇒ opacity=0，连 draw 都省掉）。位置只由格号确定，
       零随机源。 */
  const GSTEP = 3.8; // 柱距（> 玻璃片边长 ⇒ 柱与柱之间留出通光的缝）
  const GX = 3; // ±3 列
  const GY = 2; // ±2 行
  const GINNER = 1; // 中心 3×3 留空（不贴镜头这一列）
  const cols: Array<[number, number]> = [];
  for (let gx = -GX; gx <= GX; gx++) {
    for (let gy = -GY; gy <= GY; gy++) {
      if (Math.abs(gx) <= GINNER && Math.abs(gy) <= GINNER) continue;
      cols.push([gx, gy]);
    }
  }
  const GRID_N = cols.length * N;
  const gridMat = new MeshBasicMaterial({
    map: glassTex,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    depthWrite: false,
    fog: true,
  });
  const grid = new InstancedMesh(gridGeo, gridMat, GRID_N);
  grid.frustumCulled = false; // 柱阵随镜头穿过，整体包围盒会误剔
  {
    const dummy = new Object3D();
    let k = 0;
    for (const [gx, gy] of cols) {
      for (let i = 0; i < N; i++) {
        const p = tslPath(i / (N - 1));
        dummy.position.set(gx * GSTEP, gy * GSTEP, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        grid.setMatrixAt(k++, dummy.matrix);
      }
    }
    grid.instanceMatrix.needsUpdate = true;
  }
  grid.visible = false;
  scene.add(grid);

  /* ---- 尽头背光（链的收束亮点；蝴蝶身上无光点粒子） ----
     ★ 它必须是**恒定跟在镜头前方**的点光，不能钉在链尾：
     钉在链尾时，镜头越靠近它、它在屏上越大 —— 走到链尾时它会糊满整屏
     （实测 `_bvts-g-p085`：整屏发白，什么都看不见）。真正的「隧道尽头的
     光」是点光源，屏幕尺寸恒定，所以这里把它当镜头前方 GLOW_AHEAD 处的精灵，
     逐帧跟着 camZ 走；中间那几十片玻璃再自然把它滤成一圈圈光带。
     精灵的世界尺度按「屏高占比 f」折算：f × 2·tan(fov/2) × GLOW_AHEAD。 */
  const spec = tslPath(1);
  const SPEC_Z = spec.z;
  const GLOW_AHEAD = 58;
  const screenSize = (f: number) => f * 2 * Math.tan((55 * Math.PI) / 360) * GLOW_AHEAD;
  const dotTex = makeDotTexture(pal);
  const mkSprite = (f: number, opacity: number) => {
    const sp = new Sprite(
      new SpriteMaterial({ map: dotTex, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }),
    );
    const s = screenSize(f);
    sp.scale.set(s, s, 1);
    scene.add(sp);
    return sp;
  };
  const lightBig = mkSprite(0.3, 0.2);
  const lightCore = mkSprite(0.1, 0.68);
  const endGlow = mkSprite(0.8, 0.022);

  /* ---- 逐帧更新 ---- */
  /* 调试开关 `dumpOn` 已在函数开头取好（翅膀掩膜自检与状态出口共用） */

  const CAM_BACK = 2.5; // 镜头锚在「链参数点」后方 2.5 单位（焦点片恒在其前方 FOCUS_DIST 处）
  /* ★ 注视点比机位再沿视线往前这么远（第八轮 ④ 的结构件）：机位与注视点用
     **同一个锚**（live 那一点）、只差一个半径 ⇒ 视线方向 = −(sin az cos el,
     sin el, cos az cos el)，与滚动位置、与任何弹簧滞后**完全无关**。
     1.7 是原来「注视点 = 链锚往前 1.7」那一档，保持观感不变。 */
  const LOOK_DIST = 1.7;
  /* ★ 片距（= tslPath 的 z 斜率：165 单位 / 75 段）。硬切的窗口半宽就是它的
     一半 —— 相邻两片到镜头的距离差恒为片距，所以「半个片距」的窗口里**永远
     恰好只有一片**。改 tslPath 的 165 就必须同步改这里（测试盯着）。 */
  const SLICE_GAP = 2.2;
  /* ★ 焦点（第六轮「在画面靠中间一点的是实的」→ 第七轮「实的蝴蝶离摄像机远
     一点，不要贴着摄像机」→ 第八轮「改成摄像机前的第三只蝴蝶为实的」）：
     镜头前方**固定距离** FOCUS_DIST 处的那一片是「实」的。
       · 1.9 → 3.4：1.9 时焦点片自己那扇玻璃就胀到比屏幕还大（55° 竖直 FOV
         下边长 2.6 的方框在 1.9 处占 1.37 个屏高）⇒ 实蝶等于贴在镜头上、
         画面里没有边框托它。3.4 处那扇窗占 0.76 个屏高，正好「框住」。
       · 3.4 → 6.6：站主第八轮要「远一点」，并给了可执行的锚点 ——
         「摄像机前的第三只蝴蝶」。片距恒为 SLICE_GAP=2.2 ⇒ 6.6 = 3×2.2
         就是「从镜头往前数第三只」。
     ★ 7.7（=3.5×2.2）以内仍在 fog 的 26 之前 ⇒ 无雾，实蝶干净。 */
  const FOCUS_DIST = 6.6;
  /* ★ 「唯一实」（站主：你看他只有一个蝴蝶是实的）——
     hero 判据 = 「au 最小的那一片」，au = |dist − FOCUS_DIST|，且**硬切**
     （hero ∈ {0,1}）。相邻两片的 au 相差恒为一个片距(2.2) ⇒ 任一瞬刻恰好
     一片胜出：既不会有「两片都半亮」的重影，也不会有「谁都不亮」的空档。
     硬切就是时间切片的语义 —— 一帧就是一帧；参考片本来就是频闪的
     （76 帧 / 14.03s ≈ 5.4fps）。 */
  /* ★ 其余蝴蝶的不透明度 = **和切片的玻璃片一样的那一档**（站主第七轮，说了两遍：
     「透明的蝴蝶把透明度变得和切片的玻璃片一样」）。
     玻璃贴图的峰值 alpha 只有 GLS_PEAK，乘上 PANE_OP 才是它「看上去」的不透明
     度 —— 0.18 的白落在黑底上 ≈ 46/255，与从截图里量到的玻璃框亮度（取样 40~53）
     同级，这就是「一样」。
     ★ ★ 但**单只**还得再淡 4 倍（SIDE_OP = PANE_OP·GLS_PEAK / 4 ≈ 0.045）。原因
       是几何上的不对称，不是审美：
         · 玻璃片是**薄框**，各片的框线落在不同半径上，几乎不叠；
         · 蝶是**实心剪影**，而所有残影的屏上位置都挤在链轴附近（离轴摆动只有
           ±0.34 世界单位）⇒ 十几只沿视线叠在同一小片区域里。
       实测（`_probe/_bvts-7e-p050.png` 那一版单只取 0.06）：中轴残影柱合成峰值
       **157/255**，比玻璃片（取样 55~63）亮出一大截；除以 4 后降到 ≈110/255，
       与玻璃同一档；同时单只仍有 0.045×255 ≈ 11/255，环视时落在玻璃片上是
       看得出的（实测左片那只透蝶把背景 11~22 抬到 31~71）。
     ★ 衰减系数则与玻璃**完全同一条**（K_WING = K_PANE）：站主补充要求「转动视角
       时看到的其他切片上都加一个透明蝴蝶」⇒ 有玻璃的片就必须有蝶，不能漏片。
       上一版曾把蝶的衰减单独改陡（K_WING=0.35）来压亮度，代价是环视时
       `vis=10 / panesLoud=26` —— 16 片玻璃上没有蝶。改回同一条曲线后
       vis 追平 panesLoud，亮度由「单只更淡」来控。 */
  const GLS_PEAK = 0.2; // 玻璃贴图的峰值 alpha（见 makeGlassTexture：通体极淡）
  const STACK_DAMP = 4; // 剪影沿视线互叠 ⇒ 单只再压 4 倍（见上面长注）
  const SIDE_OP = (PANE_OP * GLS_PEAK) / STACK_DAMP; // ≈ 0.045：单只蝶的不透明度
  const K_PANE = 0.1; // 可见度衰减（薄框 ⇒ 慢衰减，一路铺到隧道尽头）
  const K_WING = K_PANE; // ★ 蝶与玻璃**同一条**可见度曲线（有玻璃就有蝶，不漏片）
  const PANE_NEAR = 0.2; // 镜头正在穿过的那一片让位（免得糊满近裁剪面）
  /* 基础方位角（≈1.7°）。★ 恒为常数、**不随 t 变**（连 se 都不乘）：朝向只由
     拖动环视与指针视差决定 ⇒ 滚动（无论向上还是向下）都不可能转动视角。
     ★ 第七轮收紧（站主原话带六个感叹号）：「滚轮往上滚的时候不要变视角！！！
       视角和滚轮往下时一模一样！！」。原先这里还留着 `+ 0.1 * se` —— 那等于
       「滚一下，视角跟着转最多 5.7°」，正是被骂的东西，已删净。
     ★ 为什么必须压到接近 0：镜头一旦偏离链轴，「实/虚」的投影关系就随环视而
       变（离轴偏移在屏上的位移 ∝ 1/dist）⇒ 转视角会看出重影。 */
  const AZ_BASE = 0.03;
  /* ★ 第八轮 ①：「这个窗口大一点，里面的场景一开始小一点，随着慢慢进窗口的
     同时恢复原来大小」—— 开场给中央链一个**整体缩放** grow：窗口还小的时候
     （zoom=0）是 GROW_MIN，窗口张开到全屏（zoom=1）时正好回到 1（= 站主说的
     「原来大小」）。只写 scale，位置仍然一个字节都不动（第七轮契约）。
     ★ 为什么挂在 **zoom**（窗口张开进度）而不是 t（飞行进度）：他说的「进窗口」
       就是窗口张开那一段 = zoom；挂 t 的话恢复会推迟到飞行开始之后。zoom 在
       p∈[0, 0.30] 走完，t 从 p=0.30 才开始 ⇒ 用 zoom 时**飞行全程 grow 恒为 1**，
       飞行段的观感与已验证的那一版完全一致。
     ★ 只缩中央链（蝶 / 玻璃 / 读数）：柱阵不参与 —— 它的实例位置铺在整条链上，
       跟着缩会被甩到相机身后。柱阵本来也只在转视角后才可见。 */
  const GROW_MIN = 0.6;

  const api: TslScene = {
    update({ t, settle, exit, now, pmx, pmy, orbX, orbY, amb, zoom }) {
      const live = tslPath(t);

      /* ★ 机体：**只有镜头在动**。镜头绕「当前切片」做 orbital 运动 ——
         推进进度带来基础方位角 AZ_BASE，鼠标左键拖动再叠加自由环视。
         ★★ 第八轮 ④：这里原来还有一层 `camZ += (live.z + CAM_BACK − camZ) * …`
            的**二次平滑**（控制器里的 p 已经过弹簧了）。它的滞后量 L 直接变成
            「视线俯仰角随滚动方向摆」—— 因为注视点用的是即时的 live.z：
              向下滚 L>0 ⇒ 注视点落到相机更远处 ⇒ 视角被压平；
              向上滚 L<0 ⇒ 注视点甚至跑到相机**身后** ⇒ 画面朝后翻。
            实测（`_probe/_bv-look.mjs`，改前）：向上滚途中 camera.rotation.y
            由 28.2° 冲到 **143.2°**（漂移 116°），而 az / el 一动不动 —— 站主
            反复骂的「滚轮往上滚视角不要变！！！！」正是这个；老探针因为只比
            az / el（参数）而一直报「未变 ✓」。
            ⇒ 二次平滑删净：镜头的「轻惯性」由控制器那一层弹簧负责，一层就够。 */
      const se = settle * settle * (3 - 2 * settle);
      const grow = GROW_MIN + (1 - GROW_MIN) * ss(0, 1, zoom);
      const enter = ss(0, 1, zoom);
      clearColor.copy(entryColor).lerp(tunnelColor, enter);
      frameColor.copy(entryFrame).lerp(tunnelFrame, enter);
      renderer.setClearColor(clearColor, pal.entryAlpha + (1 - pal.entryAlpha) * enter);
      /* ★ azBase 是**常数**（不随 t、也不随 settle 变）：滚动推进不得带来任何
         朝向变化 —— 站主第七轮（六个感叹号）：「滚轮往上滚的时候不要变视角！！！
         视角和滚轮往下时一模一样！！」。
         朝向的另外两个来源（拖动环视 orbX/orbY、指针视差 pmx/pmy）都与滚动
         无关；滚动只推轴。 */
      const azBase = AZ_BASE;
      const az = (azBase + orbX) * (1 - exit * 0.6);
      const el = (0.02 + orbY) * (1 - exit * 0.6);
      const R = CAM_BACK + 0.5 * se;
      const px = live.x + R * Math.sin(az) * Math.cos(el);
      const py = live.y + R * Math.sin(el) + 0.03;
      const pz = live.z + R * Math.cos(az) * Math.cos(el) - 2.9 * exit;
      camera.position.set(px, py, pz);
      /* ★★ 朝向的**结构性**保证（第八轮 ④）：注视点与机位用同一个锚（live 那
         一点）、**在锚的两侧**（机位在后方 R、注视点在前方 R2）⇒
             视线方向 = −u，   u = (sin az · cos el, sin el, cos az · cos el)
         只由 az / el 决定，**与滚动位置、与任何弹簧滞后都无关**。这是「滚轮
         任何方向都不动视角」能成立的原因（上一版靠参数恰好抵消，抵消不掉
         滞后量 L —— 见上面那段长注）。
         ★★ 符号别写反（这里踩过，而且**探针没抓到**）：机位在链锚**后方**
            （z 更大 = +z 方向），注视点必须在**前方**（z 更小）⇒ 三项都要取
            负号。写成 `live.z + R2·cos` 的话注视点会落到**相机身后**，相机转身
            朝后看 —— 画面里只剩被甩到身后的那几片，而它们的 holder.scale 取
            下限 0.05 ⇒ 蝶缩成一个小十字、整屏发黑（`_probe/_bvts-8a-p050.png`）。
            相对判据（「前后一致」）**查不出整体朝后**，所以 `_probe/_bv-look.mjs`
            另加了一条绝对判据：朝前的 yaw 归一化后 |yaw| 必须 < 90°。
         收尾段再整体滑向标本（se 混合）。 */
      const R2 = R + LOOK_DIST;
      const tx0 = live.x - R2 * Math.sin(az) * Math.cos(el);
      const ty0 = live.y - R2 * Math.sin(el) + 0.03;
      const tz0 = live.z - R2 * Math.cos(az) * Math.cos(el) - 2.9 * exit;
      const ax = tx0 * (1 - se) + spec.x * se;
      const ay = ty0 * (1 - se) + (spec.y + 0.05) * se;
      const az2 = tz0 * (1 - se) + (SPEC_Z + 0.1) * se;
      camera.lookAt(ax, ay, az2);
      // 指针微视差（悬停即可有一点环视；拖动环视时让位）
      camera.rotation.y += pmx * (0.05 + 0.08 * se) * (1 - amb) * (1 - exit);
      camera.rotation.x += -pmy * (0.03 + 0.05 * se) * (1 - amb) * (1 - exit);

      /* ★★ 本装置最要紧的一条（站主第六轮改口 → 第七轮反复收紧）：
         「我不要求离摄像机最近的是实的，**在画面靠中间一点的是实的**，
          其他都是透明度很高的只能看见一点的」；第七轮又补：
          「蝴蝶是固定在切片上的，不要变位置」「整个场景中蝴蝶，切片等等位置都
          不要变幻，只有摄像机的位置在变」。
         几何先把话说清楚：镜头恒在链轴上向前推，第 i 片到镜头的轴向距离
         dist_i = **链锚** z − 片 z_i；把「焦点」定在镜头前方固定距离 FOCUS_DIST
         处，于是 au_i = |dist_i − FOCUS_DIST| 就是「这一片离焦点有多远」。
           · 「实」= **au 最小**的那一片，且**硬切**（hero ∈ {0,1}）⇒ 任一瞬刻
             恰好一片（相邻两片的 au 相差一个片距 2.2 ⇒ 不可能同时最小）。
             硬切 = 时间切片的语义：一帧就是一帧，不会两片都半亮。
           · 其余片的透明度 = **和玻璃片同一条曲线**（同一个 ceiling、同一个
             衰减系数）⇒ 每一片看得见的玻璃上都停着一只很淡的蝶。
           · dist_i ≤ 0 的（已被镜头甩到身后）**照样留着**，只是同一条衰减让它
             很淡 —— 站主第六轮：「摄像机后面的蝴蝶别动，别往下，只不过是变的
             半透明了」。所以这里既没有 visible=false，也不动位置。
         ★ 为什么不能用「离最近」：镜头连续推进时最近那片必然一路逼近到 0 距离，
           透视会把它放大到 100%+，正好毁掉「只有一个蝴蝶是实的」。
         ★ 为什么 dist 只认 camZ（链锚）而不认 camera.position.z：拖动环视会让
           镜头绕圈、机位 z 跟着变 ⇒ 用真实机位的话「虚实」会随转视角而变。
           站主第七轮：「蝴蝶的虚实只和摄像机停在什么位置（鼠标滚轮）有关，
           转动视角蝴蝶的虚实不变」。
         ★★ 位置一个字节都不写：所有坐标都在建场景时定死。这一版 update() 只写
           opacity / visible / 以及 holder 的 **scale**。那个 scale 是**投影补偿**：
             comp = dist / FOCUS_DIST
           一片在屏上的视张角 = (SLICE_SCALE·comp)/dist = SLICE_SCALE/FOCUS_DIST
           ⇒ 与距离无关；离轴位移同样被 comp 放大 ⇒ 屏上位置也与距离无关。
           于是实蝶在它整个任期（dist 2.3→4.5）里既不胀大也不缩回，交接处更
           不跳 —— 世界坐标里没有任何东西移动过，动的只有摄像机。
         ★ comp 有下限（身后的片 dist<0，负数会把蝶翻面）；远处的残影不补偿
           （w→0），让它们按自然透视随各自那扇玻璃一起变小 —— 与玻璃「同生
           共死」。缝合区间 au∈(1.2,3.0) 里 opacity 已掉到 0.18 以下，看不出来。 */
      /* ★★ 虚实只认**链锚**（第八轮沿用第七轮口径）：镜头名义位 = 链参数点后方
         CAM_BACK。原来这里读的是 camZ（那层被删掉的二次平滑的输出），现在直接
         由链参数点算出来 —— 语义更白：「第 i 片到镜头的轴向距离」。 */
      const eyeZ = live.z + CAM_BACK;
      let focusI = -1;
      let bestAu = Infinity;
      for (let i = 0; i < slices.length; i++) {
        const au = Math.abs(eyeZ - slices[i]!.z - FOCUS_DIST);
        if (au < bestAu) {
          bestAu = au;
          focusI = i;
        }
      }
      let maxOp = 0;
      for (let i = 0; i < slices.length; i++) {
        const s = slices[i]!;
        const dist = eyeZ - s.z; // 轴向距离（负 = 已在镜头身后）
        const au = Math.abs(dist - FOCUS_DIST); // 离「焦点」有多远
        // 镜头正在穿过的那一片让位（否则糊满近裁剪面）
        const paneNear = dist < 0 ? 1 : ss(0, PANE_NEAR, dist);
        /* 「其余蝴蝶」与玻璃片**同一条可见度曲线**（K_WING = K_PANE ⇒ 有玻璃
           就有蝶，环视不漏片），亮度差在 SIDE_OP 那个常数里（单只更淡，见长注）。 */
        const paneFade = Math.exp(-au * K_PANE) * paneNear;
        const wingFade = Math.exp(-au * K_WING) * paneNear;
        const paneOp = PANE_OP * paneFade;
        const op = i === focusI ? 1 : SIDE_OP * wingFade; // 唯一实 / 其余
        if (op > maxOp) maxOp = op;
        s.wing.visible = op > 0.004;
        if (s.wing.visible) {
          s.wingMat.opacity = op;
          /* ★★ 投影补偿：**对全链一律生效** —— 每片都按 dist/FOCUS_DIST 缩，
             使它在屏上的视张角恒等于 SLICE_SCALE/FOCUS_DIST（= 实蝶那一档）。
             ⇒ ① 实蝶在它整个任期里不胀不缩、交接不跳；
                ② 其余那些残影与实蝶**一样大**，只是很淡 —— 这正是「频闪多重
                   曝光」该有的样子（站主：「其他都是透明度很高的只能看见一点」，
                   他给的两张参考图里那些淡影也都是同尺寸的）；
                ③ ★ 关键的一条实测教训：不这么做的话，镜头**正在穿过**的那几片
                   （dist 0.2~2.0）会保持原始世界尺度 → 视张角涨到一屏以上，
                   在暗底上糊出一整屏灰（证据帧 `_probe/_bvts-7-p050.png`：
                   一只比屏幕还大的灰蝶盖住整条隧道）。
                   原来的 comp 只在「焦点附近」生效（w 权重），挡不住这一档。
             ★ 离轴摆动同一个 comp 一起缩放 ⇒ 屏上位置同样与距离无关。
             ★ 下限 0.05 而不是 0.25：0.25 会让 dist<0.85 的片重新涨大（那正是
               上面那条糊屏的来源）；负数（身后的片，已被近裁剪面裁掉）也不会
               翻面。 */
          s.holder.scale.setScalar(grow * Math.max(0.05, dist / FOCUS_DIST));
        }
        // 玻璃片：让位的那一片之外，沿轴一路铺到尽头（撑出那条隧道）
        s.pane.visible = paneOp > 0.004;
        if (s.pane.visible) {
          s.paneMat.color.copy(frameColor);
          s.paneMat.opacity = paneOp;
          s.pane.scale.setScalar(grow); // 开场整体缩放（第八轮 ①），位置不动
        }
        // FRAME 读数只挂在焦点那一两片上（远处的读不出来，白花 draw call）
        if (s.label) {
          const lab = ss(SLICE_GAP, SLICE_GAP * 0.5, au);
          s.label.visible = lab > 0.02;
          if (s.label.visible) {
            (s.label.material as SpriteMaterial).opacity = 0.9 * lab;
            s.label.scale.set(0.78 * grow, 0.183 * grow, 1); // 跟中央链同一个 grow
          }
        }
      }

      /* 环绕玻璃柱阵：只在**转动视角**后亮出（站主：不转视角看不到周围切片）；
         amb 由控制器在拖动时拉起、**滚滚轮（任何方向）即归零**（站主第九轮 ②：
         「改变视角后在滚动滚轮要回到原始视角且周围切片消失」）。
         归零是个常数目标 ⇒ 上行滚与下行滚在这里也没有区别。 */
      gridMat.opacity = 0.85 * clamp01(amb * 1.3);
      gridMat.color.copy(frameColor);
      grid.visible = gridMat.opacity > 0.004;

      /* 尽头背光：恒定跟在镜头前 GLOW_AHEAD 处（点光口径，屏幕尺寸恒定），
         再随穿窗增亮。位置逐帧写 ⇒ 中间那几十片玻璃把它滤成一圈圈光带。 */
      const gz = pz - GLOW_AHEAD; // 用真实机位 pz（含 az/exit 的偏移），不是链上名义位
      lightBig.position.set(live.x, live.y + 0.25, gz);
      lightCore.position.set(live.x, live.y + 0.25, gz - 0.5);
      endGlow.position.set(live.x, live.y + 0.2, gz - 6);
      // 亮色入口收掉白色背光雾；穿窗后恢复隧道原有光照。
      const glow = pal.entryGlow + (1 - pal.entryGlow) * enter;
      (lightBig.material as SpriteMaterial).opacity = (0.2 + 0.05 * Math.sin(now / 900) + 0.4 * exit) * glow;
      (lightCore.material as SpriteMaterial).opacity = (0.68 + 0.05 * Math.sin(now / 700) + 0.2 * exit) * glow;
      (endGlow.material as SpriteMaterial).opacity = (0.022 + 0.008 * Math.sin(now / 700) + 0.05 * exit) * glow;

      /* 调试出口（仅 ?tsl-dump=1）：实际渲染状态挂 window 供探针读取 */
      if (dumpOn) {
        let solid = 0; // 「唯一实」的片数（判据：恰好 1 片 ≥ 0.9）
        let vis = 0;
        let behind = 0; // 已在镜头身后但仍留在场景里的片数（不许是 0 —— 站主要它们留着）
        /* ★ 次亮片数：op 落在「看得清但不实」的中间带（0.35~0.9）的片数。
           站主的口径是「只有一片是实的，其他只有一点点」⇒ 静止态必须恰好 1 片
           够亮、**没有**第二片半亮。这是量测「双影」的唯一客观指标（肉眼看到的
           半透明重影就是这里的第二片）。 */
        let half = 0;
        /* ★ 玻璃侧计数（站主补充：「把转动视角时看到的其他切片上加一个透明蝴蝶」）：
           panes  = 仍在渲染的玻璃片数；
           panesLoud = 其中「看得出是块玻璃」的那一档（op > 0.05）。
           vis 应当追平 panesLoud，否则就是「有玻璃、没蝶」的漏片。 */
        let panes = 0;
        let panesLoud = 0;
        for (const s of slices) {
          if (s.pane.visible) {
            panes++;
            if (s.paneMat.opacity > 0.05) panesLoud++;
          }
          if (!s.wing.visible) continue;
          vis++;
          if (s.wingMat.opacity > 0.9) solid++;
          else if (s.wingMat.opacity > 0.35) half++;
          if (eyeZ - s.z < 0) behind++;
        }
        (window as unknown as Record<string, unknown>).__tsl = {
          live: { x: live.x, y: live.y, z: live.z },
          cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pit: camera.rotation.x },
          az,
          el,
          amb,
          exit,
          focusI,
          vis,
          panes,
          panesLoud,
          behind,
          solid,
          half,
          maxOp,
          gridOp: gridMat.opacity,
          /* ★ 第十轮：翅膀掩膜 +「触角/肢体确实静止」的自检数字（见函数开头） */
          wing: wingProbe,
        };
      }
    },
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as Mesh;
        const mat = m.material as MeshBasicMaterial | MeshBasicMaterial[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      for (const g of flapGeos) g.dispose();
      paneGeo.dispose();
      gridGeo.dispose();
      butGeo.dispose();
      butMap.dispose();
      glassTex.dispose();
      dotTex.dispose();
      for (const t of labelTexs) t.dispose();
    },
  };
  return api;
}
