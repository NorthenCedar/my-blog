import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* 404 页 2026-10-06 这一轮的契约：底纹 ∞ 换新 + 装置「裂痕 FRACTURE」。
 *
 * 站主原话（第一版）：
 *   「开始做 404  FRACTURE 裂痕　鼠标划过玻璃裂开并缓慢生长，裂纹绕开文字」
 *   「404 页背景用 <图> 这个左半边是开口的无限符号（无限两个汉字不要，你自己拿灰色填充）
 *     替代百褶无限符号，你自己抠图」
 * 站主原话（**第二版**，装置的行为模型整个反过来）：
 *   「裂纹用半透明的线，别用绿线，且我要真实的玻璃碎裂的感觉，裂纹不是跟着鼠标跑，
 *     而是本来就在上面（类似于在下面的图层），鼠标到那上面裂痕随着线有顿挫的显现了」
 * 七处拍板：
 *   · 抠图范围 **乙 · ∞ + 碎屑肌理**（丢小字标签）
 *   · 浓淡 **0.18 · 与百褶 ∞ 同档**
 *   · 小字 **全抠掉**（严格乙档）
 *   · 装置模型 **预置网络 + 沿线揭示**（不是"鼠标生成"）
 *   · 网络形态 **冲击点组：1 主爆点 + 4 次级点**（每点放射线 + 同心环）
 *   · 未揭示时 **极淡可见（约 5%）**
 *   · 揭示节奏 **从鼠标处向两端逐段跳、段间有停顿；离手后继续走完**
 * 另：右侧那束光楔 **保留**（站主拍板，见 `_probe/_404/beam-onoff.png` 对照图）。
 *
 * 这里守的是「不可退让的性质」，不是「这一版的实现形态」：
 *   ① 「裂痕」不是新造的名字 —— 它本来就在 `rl-core.ts` 头部那份**最初的十台装置命名表**里。
 *      ★ 序号只能从**源码 / git log**读，不能从 spec 推（spec 里「墨滴」连章节都没有）。
 *   ② 素材自带 alpha、四个角透明、**已把 无限 填成与环境无缝的灰**、体积可控。
 *   ③ 素材**中性灰**（不是染绿）—— 站主原话是「你自己拿灰色填充」，且源图本就是近单色。
 *      ★ 但去饱和这件事必须**有据可查**，不能悄悄做：断言里带着源图的色差实测。
 *   ④ 底纹必须挂 `.shell` 之外（`plate` 槽）；本页必须关掉百褶 ∞，否则两套母题叠着。
 *   ⑤ 颜色只从 token 读；脚本里只许留**一个字面兜底**，alpha 靠派生。
 *   ⑥ 三条分野：**离手还在继续** / **几何受 DOM 文字盒约束** / **挂文档坐标系**。
 *   ⑦ ★★ **裂纹是预置的**（固定种子、可复现），指针的职责是**揭示**而不是**生成**。
 *   ⑧ 「真实的玻璃碎裂」= 近直线放射 + 同心环（多边形）+ 小角度细 Y 型分叉。
 *   ⑨ 「顿挫的显现」= 攒够一次停顿才跳一格，且**每跳的停顿不匀**（走确定性 PRNG）。
 *   ⑩ 「绕开文字」= 建网时就绕开（逐行紧盒；受阻先偏转、全撞才截断，**绝不硬穿**）。
 *   ⑪ 形状与节奏零 `Math.random`（本站硬规矩）。
 *   ⑫ 降级：触摸 / reduced-motion ⇒ 整个装置不做（不是"装个弱的"）。
 *   ⑬ 零新增运行时依赖（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const PAGE_HTML = join(DIST, '404.html');
const hasDist = existsSync(PAGE_HTML);

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** 剥注释（块 + 行），**并跳过字符串/模板串字面量**。
 *
 * ★ 为什么要自己扫一遍、而不是两条正则：正则版会栽在**字面量里的假注释起点**上。
 *   本页 frontmatter 有一个 glob，路径是 `…/404/plates/` 再加一个星号通配 ——
 *   那个「斜杠 + 星号」会被块注释的正则当成注释开头，于是一路吃到下一个收尾符，
 *   把 `<Base>`、`<Fragment slot="plate">` 整段**吃掉**。测试随即报"bodyClass 没挂"，
 *   而源码里明明挂着（第一版就是这么栽的）。
 *   顺带这一个函数也统一了 Astro 里两类块注释与 TS 里的行注释。
 *
 * 只用于**负向断言**与结构切片 —— 正向断言里凡是要查注释文字的，一律用未剥的原文。 */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    const c2 = s[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c;
      i++;
      while (i < n && s[i] !== q) {
        if (s[i] === '\\') {
          out += s[i] + (s[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += s[i++];
      }
      if (i < n) out += s[i++]; // 收尾引号
      continue;
    }
    if (c === '/' && c2 === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      out += ' ';
      continue;
    }
    if (c === '/' && c2 === '/') {
      const end = s.indexOf('\n', i);
      i = end < 0 ? n : end;
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const TS_RAW = read('src/scripts/fracture.ts');
const TS = stripComments(TS_RAW);
const PAGE_RAW = read('src/pages/404.astro');
const PAGE = stripComments(PAGE_RAW);
const TOKENS = read('src/styles/tokens.css');
const RL_CORE = read('src/scripts/rl-core.ts');

const PLATE_DIR = join(ROOT, 'src/assets/404/plates');
/* ★ 素材断言的目标路径可被 `BV_PLATE` 覆写 —— 这是为了让**变异验证**能喂一张坏素材进来
   （`_probe/_mutate-404.mjs` 就是这么干的）。本机对**已存在的二进制文件**覆写不稳
   （WorkBuddy 的 fs 代理报 UNKNOWN/EBUSY），所以改素材不能原地覆盖 ——
   变异脚本改为把坏素材写到 `_probe/` 下的新文件，再用这个变量把测试指过去。
   日常/CI 不设该变量 ⇒ 目标就是站内那一张，行为与普通测试完全一致。 */
const PLATE = process.env.BV_PLATE ?? join(PLATE_DIR, 'inf-frac.webp');

const HTML = hasDist ? readFileSync(PAGE_HTML, 'utf8') : '';

/* ⚠ 取段落一律用**代码里真实存在的锚**，不要用注释里的小标题 ——
   `TS` 是**剥过注释**的版本，`TS.indexOf('/* ---------- 起停')` 恒为 -1，
   切出来的会是空串，而空串能让一批 `not.toMatch` 静默通过（假绿）。 */
const at = (marker: string) => {
  const i = TS.indexOf(marker);
  if (i < 0) throw new Error(`fracture.ts 里找不到锚「${marker}」—— 测试锚要跟着源码走`);
  return i;
};
/** 输入段：从 pointermove 起、到起停段（fit();）之前 */
const INPUT = TS.slice(at("'pointermove'"), at('fit();'));
/** 起停段 */
const BOOT = TS.slice(at('fit();'));
/** 构建产物：pushCrack / ray / ring / impact / build 四段 */
const PUSH = TS.slice(at('function pushCrack('), at('function ray('));
const RAY = TS.slice(at('function ray('), at('function ring('));
const RING = TS.slice(at('function ring('), at('function impact('));
const IMPACT = TS.slice(at('function impact('), at('function build('));
const BUILD = TS.slice(at('function build('), at('function distSeg('));
/** 揭示段（点到线段距离 + revealAt） */
const REVEAL = TS.slice(at('function distSeg('), at('function advance('));
/** 顿挫推进 */
const ADV = TS.slice(at('function advance('), at('function draw('));
const DRAW = TS.slice(at('function draw('), at("'pointermove'"));
/** ⚠ 锚必须是 `startLoop((` —— 裸 `startLoop` 会先命中 **import 那一行**，
 *  于是切片从文件头开始，`advance(dt)` 的函数定义排到了调用点之前（第一版就报了这个）。 */
const LOOP = TS.slice(at('startLoop(('));

describe('404 · 装置「裂痕 FRACTURE」的身份（第十台）', () => {
  it('★ 名字来自最初的十台命名表，不是本轮新造的', () => {
    /* 序号只能从源码读。spec 里「墨滴」连章节都没有 —— 光读文档会把第十台数成第八台
       （准星那轮就栽过一次）。 */
    expect(RL_CORE, 'rl-core 的命名表里没有「裂痕」⇒ 装置谱系对不上').toContain('裂痕');
    expect(read('src/pages/log.astro'), 'log.astro 的命名表里没有「裂痕」').toContain('裂痕');
    expect(RL_CORE, '命名表被改过 —— 装置谱系是契约，动了要回头对').toMatch(/十台装置/);
    expect(TS_RAW, '文件头没写清它是第十台').toContain('第十台');
  });

  it('★ 三条分野都写在文件头（"别台做不到"，不是"别台也做了"）', () => {
    for (const k of ['离开', '文字盒', '文档坐标系']) {
      expect(TS_RAW, `文件头没交代分野「${k}」—— 这是本台存在的理由`).toContain(k);
    }
  });

  it('★ 三条"不做"也写在文件头（克制要有理由）', () => {
    expect(TS_RAW, '没写明"不做点击砸碎"（站主说的是"划过"）').toContain('不做点击砸碎');
    expect(TS_RAW, '没写明"不做愈合式淡出"').toContain('不做愈合式淡出');
    expect(TS_RAW, '没写明"不引入不可复现的随机"（本站硬规矩）').toContain('不做');
  });

  it('★★ 文件头留了第二版的三条指令原话（模型 / 碎裂感 / 别用绿线）', () => {
    /* 这三条是站主 2026-10-06 第二版的原话。把它们钉在文件头，是为了让后来改这个文件的人
       知道**为什么**是"预置网络"而不是"鼠标生成"、**为什么**是中性灰而不是站上那族绿。 */
    expect(TS_RAW, '文件头没写明模型换成了「预置网络 + 沿线揭示」').toContain('预置网络');
    expect(TS_RAW, '文件头没留站主「本来就在上面」这句原话').toContain('本来就在上面');
    expect(TS_RAW, '文件头没交代"别用绿线"（中性灰的理由）').toContain('别用绿线');
    expect(TS_RAW, '文件头没写「顿挫」是什么（它是这一版的观感核心）').toContain('顿挫');
  });
});

describe('404 · 底纹 ∞ 素材契约', () => {
  it('素材已进仓、在 plates 子目录、体积可控', () => {
    expect(existsSync(PLATE), '缺 src/assets/404/plates/inf-frac.webp').toBe(true);
    const webps = readdirSync(PLATE_DIR).filter((f) => f.endsWith('.webp'));
    expect(webps.length, `plates 目录下只该有一张底纹，实际 ${webps.join(',')}`).toBe(1);
    const kb = statSync(PLATE).size / 1024;
    expect(kb, `底纹 ${kb.toFixed(0)} KB 太大`).toBeLessThan(200);
    expect(PLATE.replace(/\\/g, '/'), '素材必须放在 plates 子目录里').toContain('/404/plates/');
    /* 中间产物（三档候选 PNG）不许落在 src/ 里 —— 页面 glob 会多匹配、测试也会挂 */
    const strays = readdirSync(PLATE_DIR).filter((f) => f.endsWith('.png'));
    expect(strays, `src 里混进了中间产物 ${strays.join(',')} —— 应放 _probe/_404/`).toEqual([]);
  });

  it('★ 素材自带 alpha、四角透明（纸白抠干净了）', async () => {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(PLATE).metadata();
    expect(meta.hasAlpha, '素材没有 alpha ⇒ 0.18 会在纸白上压出一块可见矩形').toBe(true);
    expect(meta.width, '宽度应与原生一致').toBe(1080);
    expect(meta.height, '高度应与原生一致').toBe(410);

    const { data, info } = await sharp(PLATE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const at = (x: number, y: number) => data[(y * info.width + x) * ch + 3];
    for (const [x, y, where] of [
      [0, 0, '左上'],
      [info.width - 1, 0, '右上'],
      [0, info.height - 1, '左下'],
      [info.width - 1, info.height - 1, '右下'],
    ] as const) {
      expect(at(x, y), `${where}角不透明 ⇒ 纸白没抠干净`).toBeLessThanOrEqual(8);
    }
    /* ★ 这一条是**修 bug 之后**才加上的：源图最左/最右各有一整列全透明像素，而它们的
       RGB 是 (0,0,0) —— 只按灰度判内容的掩码会把它们当成"极黑内容"，
       产物于是左右各多出一根**整列不透明纯黑**。这一断言就是防它回来。 */
    let colBlack = 0;
    for (let y = 0; y < info.height; y++) {
      for (const x of [0, info.width - 1]) {
        if (at(x, y) > 64) colBlack++;
      }
    }
    expect(colBlack, `左右两列共 ${colBlack} 个不透明像素 ⇒ 透明列被当成内容了`).toBe(0);
  });

  it('★★ 无限 两字已被填成与环境无缝的灰（负向对照：源图同一区域有 4 千个近黑像素）', async () => {
    /* 这是「灰色填充真的做到了」的机器证明。
       源图在该区域有 **4117** 个近黑像素、最大 4-连通块 **1601**px（就是两个汉字的笔画）；
       产物 **0 个、最大块 0** —— 一个不剩。
       ★ 上一轮这里写的是「只剩 273 / 79，那块在左下角是紧邻内容探进来的一点」。
         那句话**已经不成立**了：改完抠图（ROI 局部对比 + 精确 fillHoles）之后是干净的 0。
         ⇒ 断言随之收紧到 `toBe(0)`。别再把旧的 273/79 当"当前实测"抄进任何文档。
       ★ 判据为什么保留「最大连通块」而不只看像素数：一条真笔画是几百 px 的长条，
         一刀就能和噪点切开（汉字单笔实测 ≥325px；被误杀的那两个碎片是 325/127）。 */
    const R = { x0: 459, y0: 141, x1: 644, y1: 274 }; // 填补区域实测 bbox
    const sharp = (await import('sharp')).default;
    const run = async (file: string) => {
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      const w = R.x1 - R.x0 + 1;
      const h = R.y1 - R.y0 + 1;
      const dark = (x: number, y: number) => {
        const i = (y * info.width + x) * ch;
        if (data[i + 3] <= 64) return false;
        return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] < 95;
      };
      const seen = new Uint8Array(w * h);
      let n = 0;
      let best = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (dark(x + R.x0, y + R.y0)) n++;
          const s = y * w + x;
          if (seen[s] || !dark(x + R.x0, y + R.y0)) continue;
          let cnt = 0;
          const st = [s];
          seen[s] = 1;
          while (st.length) {
            const c = st.pop()!;
            cnt++;
            const cx = c % w;
            const cy = (c - cx) / w;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const ns = ny * w + nx;
              if (seen[ns] || !dark(nx + R.x0, ny + R.y0)) continue;
              seen[ns] = 1;
              st.push(ns);
            }
          }
          if (cnt > best) best = cnt;
        }
      }
      return { n, best };
    };

    const src = await run('D:/传图/pic_20261005000502_0.jpg');
    const out = await run(PLATE);
    expect(src.n, '源图该区域应有大量近黑笔画 —— 数据变了，这条负向对照要重做').toBeGreaterThan(2000);
    /* ★ 收紧到 0：抠图已从「按面积分类」换成「局部对比种子 + 精确孔洞填充」，
       该区域被整块重算，残下任何近黑像素都说明种子判据漏了。
       （旧值 `src.n * 0.15` / `< 150` 是面积分类时代的宽松界，别退回去。） */
    expect(out.n, `产物还剩 ${out.n} 个近黑像素 ⇒ 灰填充没吃干净`).toBe(0);
    expect(out.best, `最大近黑块 ${out.best}px ⇒ 还留着一截笔画（汉字单笔实测 ≥325px）`).toBe(0);
  });

  it('★★ 五处西文小字**全已抠掉**（站主拍板「全抠掉（严格按乙档）」）', async () => {
    /* 站主这一轮的原话是「全抠掉（严格按乙档）」—— 抠图范围从"只动 ∞"扩大到
       「∞ + 碎屑肌理，且小字标签一个不留」。这条就是那句话的机器证明。
       ⚠ ROI 表与 `_probe/_404-plate.mjs` 的 `TEXT_ROIS` **是同一张表**（两处常量）。
         改一边必须改另一边；不这么做就没法在测试里独立取证（测试不该 import 探针）。
       ★ 判据沿用审计那把刀（`luma<95` 的最大 4-连通块），因为**面积对"印在中灰上的字"无效**
         —— 中灰底 (170) 不算 near-black，字的笔画一抠掉，"面积"就塌到 0；
         而真笔画是几百 px 的长条。实测（`_probe/_404-roiblob.mjs`）：

           ROI                               源 n/best      产物 n/best
           微字堆叠+IT REFERENCE 2017         607 / 85         3 / 1
           INFINITY                           641 / 137        0 / 0
           左上角 01                           54 / 37         0 / 0
           Patience                            98 / 14         0 / 0
           右下角说明行                         105 / 5         3 / 3
           ─────────────────────────────────────────────────────
           合计                               1505            6
           最大连通块                          137            3

         ⇒ 门闩取 `≤ 8`：**夹在产物 3 与最小真实笔画 14 之间**。
           注意这不许写成"必须是 0" —— 产物那 6px 是调和插值在掩码边界上的残值，
           是设计的必然，不是漏抠。 */
    const ROIS = [
      [346, 134, 478, 210, '微字堆叠 + IT REFERENCE 2017'],
      [402, 246, 506, 276, 'INFINITY'],
      [4, 0, 34, 16, '左上角 01'],
      [86, 360, 132, 384, 'Patience'],
      [795, 382, 1078, 409, '右下角说明行'],
    ] as const;
    const sharp = (await import('sharp')).default;
    const measure = async (file: string) => {
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      const W = info.width;
      const rows = [];
      for (const [x0, y0, x1, y1, name] of ROIS) {
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        const dark = (x: number, y: number) => {
          const i = (y * W + x) * ch;
          if (data[i + 3] <= 64) return false;
          return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] < 95;
        };
        const seen = new Uint8Array(w * h);
        let n = 0;
        let best = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (dark(x + x0, y + y0)) n++;
            const s = y * w + x;
            if (seen[s] || !dark(x + x0, y + y0)) continue;
            let cnt = 0;
            const st = [s];
            seen[s] = 1;
            while (st.length) {
              const c = st.pop()!;
              cnt++;
              const cx = c % w;
              const cy = (c - cx) / w;
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ns = ny * w + nx;
                if (seen[ns] || !dark(nx + x0, ny + y0)) continue;
                seen[ns] = 1;
                st.push(ns);
              }
            }
            if (cnt > best) best = cnt;
          }
        }
        rows.push({ name, n, best });
      }
      return rows;
    };

    const src = await measure('D:/传图/pic_20261005000502_0.jpg');
    const out = await measure(PLATE);
    const sum = (r: typeof src) => r.reduce((a, b) => a + b.n, 0);
    expect(sum(src), '源图这五处应共有上千个近黑笔画像素 —— 数据变了，这张 ROI 表要重做').toBeGreaterThan(1000);
    for (const r of out) {
      expect(r.best, `${r.name} 还剩最大 ${r.best}px 的近黑块 ⇒ 这处小字没抠干净`).toBeLessThanOrEqual(8);
    }
    expect(sum(out), `五处合计还剩 ${sum(out)} 个近黑像素（源 ${sum(src)}）⇒ 有处没抠干净`).toBeLessThanOrEqual(30);
  });

  it('★ 素材是**中性灰**（站主原话「拿灰色填充」），不是染绿 —— 且去饱和有实测依据', async () => {
    /* 与标签页那个 ∞ **相反**：那个站主拍板"染墨绿"，这个站主拍板"拿灰色填充"，
       而且源图本身就是近单色。⇒ 这里断言的是**中性**，不是绿。
       ⚠ 去饱和属于"改动了原始素材"，必须留下依据，不能悄悄做：
         源图 441980 个不透明像素里，色差 >12 的只有 **1044** 个（0.24%）、>60 的 **131** 个、
         **没有任何一个 >100** —— 那是高对比边缘的色度振铃 + 一处 4×3 的偏紫小片
         （x1040–1043, y35–37），不是真彩内容。⇒ 显式去饱和是安全的。 */
    const sharp = (await import('sharp')).default;
    const stats = async (file: string) => {
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      let n = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let chroma = 0;
      let over60 = 0;
      let over100 = 0;
      for (let i = 0; i < data.length; i += ch) {
        if (data[i + 3] < 128) continue;
        n++;
        sumR += data[i];
        sumG += data[i + 1];
        sumB += data[i + 2];
        const c = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
        if (c > chroma) chroma = c;
        if (c > 60) over60++;
        if (c > 100) over100++;
      }
      return { n, avg: [sumR / n, sumG / n, sumB / n] as const, chroma, over60, over100 };
    };

    const src = await stats('D:/传图/pic_20261005000502_0.jpg');
    expect(src.chroma, '源图出现了强色内容 ⇒ "源图近单色所以可去饱和"这个前提不成立了').toBeLessThanOrEqual(100);
    expect(src.over100, '源图有色差 >100 的像素 ⇒ 那是真彩内容，去饱和会丢东西').toBe(0);

    const out = await stats(PLATE);
    expect(out.chroma, `产物最大色差 ${out.chroma} ⇒ 没有中性化（这一页要的是灰）`).toBe(0);
    for (const v of out.avg) {
      expect(v, `平均色 rgb(${out.avg.map((x) => x.toFixed(0)).join(',')}) 不是中性灰`).toBeCloseTo(out.avg[0], 1);
    }
    /* 亮度分布也要留住：中灰构图 ⇒ 这条才是"有没有被压扁"的判据 */
    expect(out.avg[0], '平均灰度应在中灰档（源图主体 130–200）').toBeGreaterThan(120);
    expect(out.avg[0], '平均灰度不该被提亮成纸白').toBeLessThan(215);
  });

  it('★ 构图**出血**：内容触到右/上/下三边（左边只 8px，近乎不算）', async () => {
    /* 与标签页那条"不许出血"**相反**：这张图的构图本来就是出画的。
       ⚠ 上一轮 `audit()` 报 l=550 是**假出血** —— 掩码把源图的透明列当成了内容。
         修好后实测 l/r/t/b = 8/316/1243/1460，内容 bbox (1,0)-(1078,409)。
       ⚠ 再前一版记的是 `8/304/1239/970`：那是**去小字之前**的数。抠掉五处小字后
         （右下角那行说明占了 r/t/b 三边的边料）右、上、下三边都涨了。
         ⇒ 出血数变了不代表构图坏了，是"内容集合变了"。 */
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(PLATE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const W = info.width;
    const H = info.height;
    const count = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (data[(y * W + x) * ch + 3] > 64) n++;
      return n;
    };
    const r = count(W - 3, 0, W - 1, H - 1);
    const t = count(0, 0, W - 1, 2);
    const b = count(0, H - 3, W - 1, H - 1);
    expect(r, `右边只 ${r} 个内容像素 ⇒ 光锥没出血，构图被裁坏了`).toBeGreaterThan(100);
    expect(t, `上边只 ${t} 个内容像素 ⇒ 上楔形没出血`).toBeGreaterThan(500);
    expect(b, `下边只 ${b} 个内容像素 ⇒ 下楔形没出血`).toBeGreaterThan(500);
  });

  it('★ 不许放大超过 2×（原生只有 1080px 宽），且 CSS 的 aspect-ratio 与素材一致', () => {
    const rule = PAGE.match(/\.frac-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, '没读到 .frac-inf 的样式块').toBeTruthy();
    const pxCaps = [...rule.matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(pxCaps.length, '取宽里一个 px 上界都没有？').toBeGreaterThan(0);
    for (const v of pxCaps) {
      expect(v, `取宽上界 ${v}px > 2160（原生 1080 × 2）⇒ 靠插值放大，会糊`).toBeLessThanOrEqual(2160);
    }
    expect(rule, '必须带 vh 上界 —— fixed 元素超出视口的量会计入文档滚动尺寸（会多一根纵向滚动条）').toMatch(
      /[\d.]+vh/,
    );
    /* Image 组件也给了上限：不给的话 Astro 会按 2× 插值出一版（构建日志里 before==after） */
    expect(PAGE, 'Image 的 widths 里出现了 2160（= 原生 2×，纯插值）').not.toMatch(/widths=\{\[[^\]]*2160/);
  });
});

describe('404 · token 契约（颜色只许住在 tokens.css）', () => {
  it('★★ 三道裂纹色都是**中性近黑**（--ink）压 alpha —— 站主明说「别用绿线」', () => {
    for (const name of ['--deco-fracture-line', '--deco-fracture-glow', '--deco-fracture-ghost']) {
      expect(TOKENS, `tokens.css 里没有 ${name}`).toContain(name);
    }
    /* ★★ 这条是**站主这一轮的指令**（原话「裂纹用半透明的线，别用绿线」）的机器证明。
       第一版是 `--accent`(#2d7d46) 压 alpha —— 全站装置都是绿的，当时顺手沿用；
       但玻璃裂纹不是绿的，它是纸面上的一道暗缝。⇒ 不许退回绿色家族。
       ⚠ 负向断言**排在正向前面**：否则改成绿色时先失败的是"必须是 #1a1a1a"，
         这条永远轮不到，于是它是不是活着就无从证明（变异验证就是照这种死门闩的）。 */
    expect(TOKENS, '裂纹用了 --accent 绿(#2d7d46) ⇒ 站主明说「别用绿线」').not.toMatch(
      /--deco-fracture-(line|glow|ghost):\s*#2d7d46/,
    );
    expect(TOKENS, '裂纹用了 --accent-bright(#4caf50) 的绿').not.toMatch(
      /--deco-fracture-(line|glow|ghost):\s*#4caf50/,
    );
    /* 8 位 hex：6 位色 + 2 位 alpha。站上约定 alpha 由 hex 承载、不写 rgba() */
    expect(TOKENS, '主线必须是 --ink(#1a1a1a) 压 alpha').toMatch(/--deco-fracture-line:\s*#1a1a1a[0-9a-f]{2}/);
    expect(TOKENS, '柔光必须是 --ink(#1a1a1a) 压 alpha').toMatch(/--deco-fracture-glow:\s*#1a1a1a[0-9a-f]{2}/);
    expect(TOKENS, '未揭示的底必须是 --ink(#1a1a1a) 压 alpha').toMatch(/--deco-fracture-ghost:\s*#1a1a1a[0-9a-f]{2}/);
    /* 浓度必须**递减**：主线 > 柔光 > 未揭示的底 */
    const a1 = TOKENS.match(/--deco-fracture-line:\s*#1a1a1a([0-9a-f]{2})/)?.[1] ?? '';
    const a2 = TOKENS.match(/--deco-fracture-glow:\s*#1a1a1a([0-9a-f]{2})/)?.[1] ?? '';
    const a3 = TOKENS.match(/--deco-fracture-ghost:\s*#1a1a1a([0-9a-f]{2})/)?.[1] ?? '';
    expect(parseInt(a1, 16), `主线 alpha ${a1} 应比柔光 ${a2} 浓`).toBeGreaterThan(parseInt(a2, 16));
    expect(parseInt(a2, 16), `柔光 alpha ${a2} 应比未揭示的底 ${a3} 浓`).toBeGreaterThan(parseInt(a3, 16));
  });

  it('★ 脚本侧只留一个字面兜底（--ink），其余全部派生', () => {
    const hexes = [...TS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hexes.length, `脚本里有 ${hexes.length} 处字面色值：${hexes.join(',')} ⇒ 颜色只许住在 tokens.css`).toBeLessThanOrEqual(1);
    if (hexes.length === 1) expect(hexes[0], '唯一那个字面兜底该是 --ink').toBe('#1a1a1a');
    /* 三个 token 都要读；兜底的 alpha 后缀必须与 token 里的一致（防两处对不上） */
    expect(TS).toMatch(/getPropertyValue\('--deco-fracture-line'\)/);
    expect(TS).toMatch(/getPropertyValue\('--deco-fracture-glow'\)/);
    expect(TS).toMatch(/getPropertyValue\('--deco-fracture-ghost'\)/);
    const a1 = TOKENS.match(/--deco-fracture-line:\s*#1a1a1a([0-9a-f]{2})/)?.[1] ?? '';
    const a2 = TOKENS.match(/--deco-fracture-glow:\s*#1a1a1a([0-9a-f]{2})/)?.[1] ?? '';
    const a3 = TOKENS.match(/--deco-fracture-ghost:\s*#1a1a1a([0-9a-f]{2})/)?.[1] ?? '';
    expect(TS, `脚本兜底的 alpha 后缀与 token(${a1}) 不一致`).toContain(`'${a1}'`);
    expect(TS, `脚本兜底的 alpha 后缀与 token(${a2}) 不一致`).toContain(`'${a2}'`);
    expect(TS, `脚本兜底的 alpha 后缀与 token(${a3}) 不一致`).toContain(`'${a3}'`);
    /* 不写 rgba() */
    expect(TS, '脚本里不许出现 rgba()/rgb()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);
  });
});

describe('404 · 装置脚本契约（fracture.ts）', () => {
  it('★★ 模型：裂痕是**预置**的 —— 指针事件里绝不许"现造几何"', () => {
    /* 这是第二版的立身之本。第一版在 `pointermove` 里 `spawn()` 出一条新裂纹；
       现在几何在建网时一次性生成，指针只做**揭示**。
       ⇒ 指针事件段里出现 ray/ring/impact/build/spawn 任何一个，就是退回了第一版。 */
    expect(TS, '没有 build()：网络不是预置的').toMatch(/function build\(/);
    expect(BUILD, 'build 必须先清空上一张网（resize 会重建）').toMatch(/cracks\.length\s*=\s*0/);
    expect(TS, '没有冲击点生成器（impact）').toMatch(/function impact\(/);
    expect(TS, '没有放射线生成器（ray）').toMatch(/function ray\(/);
    expect(TS, '没有同心环生成器（ring）').toMatch(/function ring\(/);
    expect(INPUT, '指针事件里出现了"现造一段几何"⇒ 退回第一版模型了').not.toMatch(
      /\bspawn\(|\bray\(|\bring\(|\bimpact\(|\bbuild\(/,
    );
    expect(INPUT, '指针事件里只该做一件事：揭示').toMatch(/revealAt\(/);
  });

  it('★★ 形态按真实冲击碎裂：近直线 + 放射 + 同心环 + 小角度细 Y 型分叉', () => {
    /* 站主要「真实的玻璃碎裂的感觉」。玻璃是脆性材料，形貌有定式：
       放射线近直线（沿最大拉应力直着走）、有同心环（近似垂直）、分叉是小角度。 */
    const curve = Number(TS.match(/const CURVE\s*=\s*([\d.]+)/)?.[1]);
    expect(Number.isFinite(curve), '读不到 CURVE').toBe(true);
    expect(
      curve,
      `每段曲率 ${curve} rad 太大 ⇒ 那是"撕裂/爬行"的语言，不是玻璃的脆性断裂`,
    ).toBeLessThan(0.05);
    /* 第一版是 JITTER 0.17 + SPREAD 0.45（撕裂/树枝的语言），别退回去 */
    expect(TS, '又出现了第一版那种大抖动常量（JITTER / SPREAD）').not.toMatch(/\bJITTER\b|\bSPREAD\b/);
    /* 分叉必须是小角度 */
    const bd = TS.match(/const BRANCH_DEG\s*=\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/);
    expect(bd, '没有 BRANCH_DEG（分叉角范围）').toBeTruthy();
    const dmax = Number(bd![2]);
    expect(dmax, `分叉角最大 ${dmax}° ⇒ 超过 30° 就读成"树枝"而不是"玻璃"`).toBeLessThanOrEqual(30);
    expect(Number(bd![1]), '分叉角下限不该是 0').toBeGreaterThan(0);
    /* 同心环必须是**多边形**（按弧长取顶点），不能用 canvas 的圆 */
    expect(RING, '同心环不许用 arc()/ellipse() —— 真实玻璃的环是多边形').not.toMatch(/\.arc\(|\.ellipse\(/);
    expect(RING, '环的顶点数要按弧长算（RING_SEG）').toMatch(/RING_SEG/);
    expect(RING, '环必须有半径抖动 ⇒ 不是正多边形').toMatch(/0\.9\d*\s*\+|\(0\.94/);
    /* 放射线要铺满一圈（不是一束同向的） */
    expect(IMPACT, '放射线要按射线数铺满一圈').toMatch(/rays/);
    expect(IMPACT, '放射线角度要加抖动（否则是机械的"米字"）').toMatch(/rnd\(\)/);
    /* 冲击点组：1 主 + 4 次 */
    expect(TS, '主爆点常量没了（MAIN）').toMatch(/const MAIN\s*=/);
    expect(TS, '次级冲击点没了（SUBS）').toMatch(/const SUBS\s*=/);
    const mainRays = Number(TS.match(/MAIN\s*=\s*\{[^}]*rays:\s*(\d+)/)?.[1]);
    const subsBlock = TS.slice(at('const SUBS'), at('interface Rect'));
    const subRays = [...subsBlock.matchAll(/rays:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(subRays.length, '次级冲击点应有 4 个').toBe(4);
    expect(mainRays, `主爆点的放射线（${mainRays}）应当明显多于任一次级点`).toBeGreaterThan(Math.max(...subRays));
    /* 冲击点若落在文字盒上要被挪开（否则放射线一出发就被截断） */
    expect(IMPACT, '冲击点落在文字盒上时必须先挪出去').toMatch(/blocked\(cx,\s*cy\)/);
  });

  it('★★ 字尾 ②（改后）：**建网时**就绕开文字盒（不是生长时逐段问）', () => {
    /* 网是预置的 ⇒ 绕开只发生在建网那一刻。 */
    expect(TS, '必须走 TreeWalker 逐文本节点').toMatch(/createTreeWalker/);
    expect(TS, '必须用 Range 取框').toMatch(/createRange\(\)/);
    expect(TS, '必须用 getClientRects（逐行紧盒；getBoundingClientRect 是元素级）').toMatch(
      /getClientRects\(\)/,
    );
    expect(TS, '文字盒必须换算到文档坐标（与裂纹同一坐标系）').toMatch(/scrollX/);
    expect(TS, '文字盒必须换算到文档坐标').toMatch(/scrollY/);
    expect(TS, '空文本节点要跳过').toMatch(/trim\(\)/);
    expect(TS, '要滤掉 0/极小的框').toMatch(/b\.width\s*<\s*\d/);
    expect(TS, '文字盒要有上限（RECT_LIMIT）').toMatch(/RECT_LIMIT/);
    /* ★ 顺序：先取文字盒，再生成第一个冲击点 */
    const iRects = BUILD.indexOf('rects = textRects()');
    const iImpact = BUILD.indexOf('impact(');
    expect(iRects, 'build 里没取文字盒').toBeGreaterThanOrEqual(0);
    expect(iImpact, 'build 里没生成冲击点').toBeGreaterThanOrEqual(0);
    expect(iRects, '文字盒必须在**第一个 impact 之前**取（否则第一批几何就压在字上）').toBeLessThan(iImpact);
    /* 放射线：撞上先偏转、两边都试、全不行才截断（绝不硬穿） */
    expect(RAY, '放射线必须逐段问文字盒').toMatch(/segBlocked\(/);
    expect(RAY, '撞上了要按 TURN_DEG 试探偏转').toMatch(/TURN_DEG/);
    expect(RAY, '受阻要两边都试（只试一边会贴着字走）').toMatch(/\[1,\s*-1\]/);
    expect(RAY, '转向后本段不推进（continue）').toMatch(/continue/);
    expect(RAY, '全都不行必须截断（break），不许硬穿').toMatch(/break/);
    /* 环：撞上就断开成多段（真玻璃的环遇到障碍是断的，不是绕过去） */
    expect(RING, '环撞上文字盒要断开').toMatch(/blocked\(/);
    /* ★★ 环也必须检查**线段** —— 只测顶点的话，两个盒外的顶点连成的段照样从盒子边擦过去。
       实测证据（实验室第二版首跑）：只测顶点时「墨离字形盒最近 **4.35px**」
       （PAD=9 应当给到 ≥6px）；改成整段检查后回到阈值以上。 */
    expect(RING, '环也要整段检查（只测顶点会从盒边擦过去）').toMatch(/segBlocked\(/);
    /* ★★ 线段也要躲 —— 只测落点不够：两端都在盒外的一段直线仍可能从盒角**切过去** */
    expect(TS, '必须有 segBlocked（只测落点会从盒角切过去）').toMatch(/const segBlocked\s*=/);
    const seg = TS.slice(at('const segBlocked'), at('function pushCrack('));
    expect(seg, 'segBlocked 内部要取若干内点').toMatch(/\[0\.25,\s*0\.5,\s*0\.75\]/);
    expect(seg, 'segBlocked 也必须包含落点本身的判定').toMatch(/blocked\(x1,\s*y1\)/);
  });

  it('★★ 「顿挫的显现」= 攒够一次停顿才跳一格，且每跳的停顿**不匀**', () => {
    /* 站主那四个字全在这个函数里。它必须：
       ① 是**离散跳格**（不是连续生长）；② 每跳之间**有停顿**；③ 停顿长度**不匀**。 */
    expect(TS, '没有停顿常量（DWELL）').toMatch(/const DWELL\s*=\s*\d+/);
    expect(ADV, '推进必须吃真实 dt（帧率无关）').toMatch(/c\.acc\s*\+=\s*dtMs/);
    expect(ADV, '跳的门槛必须是"攒够一次停顿"（不是"本帧有推进量"）').toMatch(
      /while\s*\(c\.acc\s*>=\s*c\.dwell\)/,
    );
    expect(ADV, '跳完要扣掉这一次的停顿').toMatch(/c\.acc\s*-=\s*c\.dwell/);
    expect(ADV, '必须真的向两端各跳一格（左游标 --）').toMatch(/c\.i--/);
    expect(ADV, '必须真的向两端各跳一格（右游标 ++）').toMatch(/c\.j\+\+/);
    /* ★ 不匀：每一跳的停顿都在 DWELL 的某个倍数区间里重取 ⇒"啪啪啪"而不是"哒哒哒哒" */
    const dwell = ADV.match(
      /c\.dwell\s*=\s*DWELL\s*\*\s*\(\s*([\d.]+)\s*\+\s*c\.rnd\(\)\s*\*\s*([\d.]+)\s*\)/,
    );
    expect(dwell, '每跳的停顿必须重取（而且要走 c.rnd ⇒ 不匀也可复现）').toBeTruthy();
    expect(Number(dwell![2]), '不匀的幅度不该是 0').toBeGreaterThan(0.2);
    /* 未揭示的裂纹不许"自己动" */
    expect(ADV, '未被碰过的裂纹（i >= j）必须跳过，不许自己推进').toMatch(/if\s*\(c\.i\s*>=\s*c\.j\)\s*continue/);
    /* 走完就停在完成态（永久保留 —— 甲档语义） */
    expect(ADV, '走完（i=0 且 j=segs）要判掉，不再推进').toMatch(
      /c\.i\s*===\s*0\s*&&\s*c\.j\s*===\s*c\.segs/,
    );
    /* 顿挫的粒度就是"一段"（SEG），所以跳跃边界天然对齐顶点 */
    expect(TS, '段长常量 SEG 没了').toMatch(/const SEG\s*=\s*\d+/);
  });

  it('★★ 揭示：指针碰到哪一段，就从那儿向两端展开（一条同时只一个前沿）', () => {
    expect(TS, '没有 revealAt').toMatch(/function revealAt\(/);
    expect(TS, '没有"碰到"的判定半径（REVEAL_R）').toMatch(/const REVEAL_R\s*=\s*\d+/);
    expect(TS, '没有点到线段距离（revealAt 的判定）').toMatch(/function distSeg\(/);
    /* bbox 粗筛：否则每次 pointermove 都要遍历全部段 */
    expect(REVEAL, '必须先用 bbox 粗筛（每次 pointermove 都会跑这个函数）').toMatch(/c\.bx0|c\.bx1/);
    /* ★ 一条裂纹同时只有一个前沿：已在揭示中的直接跳过。
       若允许重开，指针划过时沿途多处会同时起头 ⇒ 观感从"这条裂被你唤醒、自己沿路展开"
       退化成"跟着指针亮" —— 那正是站主这一轮要摆脱的。 */
    expect(REVEAL, '已在揭示中的裂纹不许重开').toMatch(/if\s*\(c\.i\s*<\s*c\.j\)\s*continue/);
    /* 起头那一段立刻亮（"碰到了"的反馈） */
    expect(REVEAL, '起头要立刻把碰到的那一段纳入区间').toMatch(/c\.i\s*=\s*bestI/);
    expect(REVEAL, '起头要立刻把碰到的那一段纳入区间').toMatch(/c\.j\s*=\s*bestI\s*\+\s*1/);
    /* 最近的那一段（不是随便一段） */
    expect(REVEAL, '必须取**最近**的段（不是第一段命中的）').toMatch(/bestD|bestI/);
  });

  it('★★ 分野 ①：指针离开之后，已经开始揭示的那条**继续走完**', () => {
    /* 第一版是"接着长"，现在是"把已经开始的那条走完" —— 性质不变：
       指针停住 / 离开，画面还在动。其余九台指针一停就停。 */
    expect(INPUT, '指针事件里不许"把前沿掐掉"（那就不叫离手继续了）').not.toMatch(
      /c\.i\s*=\s*c\.segs|c\.j\s*=\s*0/,
    );
    /* 推进只发生在帧循环里 ⇒ 指针不动它也走 */
    expect(LOOP, '推进必须在帧循环里（离手后仍继续）').toMatch(/advance\(/);
    expect(LOOP.indexOf('advance('), 'advance 必须在 draw 之前').toBeLessThan(LOOP.indexOf('draw('));
  });

  it('★ 形状与节奏零随机 —— 固定种子的 mulberry32', () => {
    expect(TS, '源码含 Math.random ⇒ 形状不可复现，没法验收').not.toMatch(/Math\.random/);
    expect(TS, '没看到 mulberry32').toMatch(/mulberry32/);
    expect(TS, 'mulberry32 的魔数应留下（认出是哪个 PRNG）').toMatch(/0x6d2b79f5/);
    expect(TS, '没有写死的形状种子').toMatch(/const SEED\s*=\s*\d+/);
    /* ★ 每次建网都要把种子**重置** ⇒ 同一个长宽下逐点相同（resize 重建后也一样） */
    expect(BUILD, 'build 开头必须重置种子').toMatch(/seed\s*=\s*SEED/);
    expect(BUILD, 'build 开头必须重置 rnd').toMatch(/rnd\s*=\s*mulberry32\(SEED\)/);
    expect(TS, '每条裂纹要带自己的 rnd（顿挫的不匀用它）').toMatch(/rnd:\s*\(\)\s*=>\s*number/);
  });

  it('★ 走共享底盘：startLoop + 视口停帧，且**同步首帧 + is-ready**', () => {
    expect(TS).toMatch(/from '\.\/rl-core'/);
    expect(TS).toMatch(/startLoop/);
    expect(TS).toMatch(/createActivityGate/);
    expect(TS).toMatch(/gate\.onScreen/);
    expect(TS).toMatch(/gate\.visible/);
    /* 同步首帧：无头下 rAF 不推进，没有它连一帧都量不到 */
    expect(BOOT, '起停段落里要有同步首帧 draw(...)').toMatch(/draw\(/);
    expect(BOOT.indexOf('draw('), '同步首帧必须在 startLoop 之前').toBeLessThan(BOOT.indexOf('startLoop'));
    expect(BOOT, '没加 is-ready 类 ⇒ opacity:0 门控让它永远不可见').toMatch(/classList\.add\('is-ready'\)/);
    /* 装置脚本不许引别的模块 */
    const imports = [...TS.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.every((i) => i === './rl-core'), `只许 import rl-core，实际 ${imports.join(',')}`).toBe(true);
  });

  it('★★ 分野 ③：挂在**文档**坐标系（不是视口）', () => {
    /* 其余九台都是 fixed 挂视口；这一台必须与文字盒保持相对关系，而文字随滚动走。 */
    expect(TS, '高度必须取文档高（scrollHeight）').toMatch(/scrollHeight/);
    expect(TS, '必须把文档高写回 canvas.style.height（height:100% 只到视口）').toMatch(/cv\.style\.height\s*=/);
    expect(TS, '宽度也要写回 style（与画布像素宽是两件事）').toMatch(/cv\.style\.width\s*=/);
    const rule = PAGE.match(/\.fracture\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, 'canvas 必须是 absolute（fixed 会让"绕开文字"随滚动错位）').toMatch(/position:\s*absolute/);
    expect(rule, 'canvas 不许 fixed').not.toMatch(/position:\s*fixed/);
  });

  it('★ 绘制：未揭示的网走**离屏一次合成**；已揭示的先柔光后主线', () => {
    /* 站主「本来就在上面（类似于在下面的图层）」⇒ 未揭示的网也要看得见（极淡）。 */
    expect(TS, '必须读 --deco-fracture-ghost').toMatch(/getPropertyValue\('--deco-fracture-ghost'\)/);
    expect(TS, '必须有 paintGhost（把整张网画到离屏）').toMatch(/function paintGhost\(/);
    expect(BUILD, 'build 末尾要把底重画到离屏（fit 会清空它）').toMatch(/paintGhost\(\)/);
    expect(TS, 'paintGhost 里要用**实心** --ink（透明度交给整层 blit）').toMatch(/octx\.strokeStyle\s*=\s*INK/);
    /* ★★ 这条是实验室首跑抓到的**真缺陷**，不是风格要求：
       逐段直接描边时，冲击点附近 20 多条放射线共用起点，同一个像素被叠十几次
       ⇒ token 写的 5%（α13）在画面上成了峰值 **α99**（合成到纸白 = 暗 87 级）——
       "极淡的底"变成一片肉眼可见的灰团。离屏一次合成后任何重叠都只算一次。 */
    expect(DRAW, '底那一层必须是**整层 blit**（drawImage），不是逐段描边').toMatch(/drawImage/);
    expect(DRAW, 'blit 必须带 globalAlpha（浓度由 ghost token 决定）').toMatch(/globalAlpha/);
    expect(DRAW, '不许再逐段描边画底（密集处会叠成灰团）').not.toMatch(/ctx\.strokeStyle\s*=\s*GHOST/);
    /* 已揭示：先柔光后主线（玻璃的裂口是"细亮缝"，只画一根 1px 像铅笔划痕） */
    const iGlow = DRAW.indexOf('GLOW');
    const iLine = DRAW.indexOf('LINE');
    expect(iGlow, '没画柔光').toBeGreaterThanOrEqual(0);
    expect(iLine, '没画主线').toBeGreaterThanOrEqual(0);
    expect(iGlow, '先柔光、后主线（柔光垫在下面）').toBeLessThan(iLine);
    /* 画布是整个文档高 ⇒ 必须有视口裁剪（否则滚到页脚还在重画首屏） */
    expect(DRAW, '画布是文档高 ⇒ 必须有视口裁剪').toMatch(/window\.scrollY/);
  });

  it('★ 不做点击砸碎（站主说的是"划过"）', () => {
    expect(TS, "不许接 click —— 站主说的是「鼠标划过」").not.toMatch(/addEventListener\(\s*'click'/);
    expect(TS, '不许接 pointerdown —— 同上').not.toMatch(/addEventListener\(\s*'pointerdown'/);
    expect(TS, '必须接 pointermove').toMatch(/addEventListener\(\s*'pointermove'/);
  });

  it('★ 降级：触摸 / reduced-motion ⇒ 整个装置不做（不是装个弱的）', () => {
    expect(TS, '没判触摸：触屏上没有"划"这件事').toMatch(/\(hover:\s*hover\)/);
    expect(TS, '没判 reduced-motion').toMatch(/prefersReducedMotion\(\)/);
    expect(TS, '要用 rl-core 的 shouldAnimate 收口').toMatch(/shouldAnimate\(/);
    /* 这两条 return 必须在 `cv.classList.add('is-ready')` **之前** ⇒ 降级时画布永远不显形 */
    const firstReady = TS.indexOf("classList.add('is-ready')");
    expect(TS.indexOf('(hover: hover)'), '触摸判定要在显形之前').toBeLessThan(firstReady);
    expect(TS.indexOf('shouldAnimate('), 'RM 判定要在显形之前').toBeLessThan(firstReady);
    /* 页面侧也要有纯粹的 RM 兜底（除 .fracture 自己的 transition） */
    expect(PAGE, '页面侧没做 reduced-motion 降级').toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('★ 出屏 / 切标签不推进也不画（走 gate）', () => {
    expect(LOOP, 'loop 里要先问 gate 再干活').toMatch(
      /gate\.onScreen\s*&&\s*gate\.visible|!gate\.onScreen\s*\|\|\s*!gate\.visible/,
    );
    expect(LOOP.indexOf('gate.'), 'gate 判断要在 advance 之前').toBeLessThan(LOOP.indexOf('advance('));
  });

  it('★ resize 要重算尺寸并**重建整张网**（字尾 ② 的必然代价）', () => {
    expect(TS, '没接 resize').toMatch(/addEventListener\(\s*\n?\s*'resize'/);
    const rz = TS.slice(at("'resize'"));
    expect(rz, 'resize 要重算画布尺寸').toMatch(/fit\(\)/);
    /* ★ 网是预置的、绕开只发生在建网那一刻 ⇒ 文字盒一变就必须重建整张网。
       代价是丢掉已揭示状态（resize 低频，取这个取舍）—— 注释里写明了。 */
    expect(rz, 'resize 必须重建整张网（文字盒与尺寸都变了）').toMatch(/build\(\)/);
    expect(rz, 'resize 要节流（防拖动窗口时每像素重建）').toMatch(/<\s*200/);
  });
});

describe('404 · 页面契约（404.astro）', () => {
  it('★ 语义不能丢：noCanonical / 内页外壳 / 标题在正文流里 / 两段正文都在', () => {
    expect(PAGE, 'noCanonical 丢了 —— 404 会被搜索引擎收录（且删了不报错）').toMatch(/noCanonical/);
    expect(PAGE, 'chrome 必须是 page（内页外壳）').toMatch(/chrome="page"/);
    /* 'page' 外壳不渲染 band 槽 ⇒ 标题必须搬进正文流的 .pagehead，漏搬会静默消失 */
    expect(PAGE, '标题没有落在正文流的 .pagehead 里').toMatch(
      /<header class="pagehead">[\s\S]*?<PageTitle size="display">404<\/PageTitle>/,
    );
    expect(PAGE, '正文第一段丢了').toMatch(/class="prose"/);
    expect(PAGE, '回首页的链接丢了').toMatch(/href="\/"/);
    expect(PAGE, '页头版心没收成 --measure（与正文列左对齐）').toMatch(/\.pagehead\s*\{[^}]*max-width:\s*var\(--measure\)/);
  });

  it('★ 两层装饰都走 plate 具名槽（在 `.shell` 之外）', () => {
    expect(PAGE, '没用 plate 具名槽 —— 普通 slot 会落进 .shell，过渡时被 transform/blur 的包含块带走').toMatch(
      /<Fragment slot="plate">/,
    );
    const iPlate = PAGE.indexOf('slot="plate"');
    const iCanvas = PAGE.indexOf('data-fracture');
    const iHead = PAGE.indexOf('class="pagehead"');
    expect(iPlate, 'plate 槽要在页头之前').toBeLessThan(iHead);
    expect(iCanvas, 'canvas 要挂在 plate 槽里（不是普通 slot）').toBeGreaterThan(iPlate);
    /* 底纹层与 canvas 都在同一个 Fragment 里 */
    expect(PAGE, '底纹层没在 plate 槽里').toMatch(/<Fragment slot="plate">[\s\S]*?class="frac-inf"/);
    expect(PAGE, '画布没在 plate 槽里').toMatch(/<Fragment slot="plate">[\s\S]*?data-fracture/);
  });

  it('★ 本页显式关掉百褶 ∞（不关就是两套母题叠着）', () => {
    expect(PAGE, 'bodyClass 没挂 frac-plate ⇒ 下面那条选择器匹配不到任何东西').toMatch(/bodyClass="frac-plate"/);
    /* 那边写的是 `body.chrome-page .page-inf`（0,2,1）⇒ 权重必须对齐才压得住 */
    expect(PAGE, '找不到关百褶 ∞ 的那条规则（注意 :global 的右括号）').toMatch(
      /body\.frac-plate \.page-inf\)\s*\{[^}]*display:\s*none/,
    );
    expect(PAGE, '关法必须是 display:none（opacity:0 仍占一层满屏合成层）').not.toMatch(
      /body\.frac-plate \.page-inf\)\s*\{[^}]*opacity:\s*0/,
    );
  });

  it('★ 底纹 ∞ 的挂法：fixed 挂视口 / 居中 / 退到内容之下 / 不拦指针', () => {
    const rule = PAGE.match(/\.frac-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const decl of ['position: fixed', 'left: 50%', 'top: 50%', 'pointer-events: none', 'z-index: -1']) {
      expect(rule, `挂法缺 ${decl}`).toContain(decl);
    }
    expect(rule, '必须居中（translate(-50%,-50%)）').toMatch(/translate\(-50%,\s*-50%\)/);
    expect(rule, 'aspect-ratio 必须与素材 1080×410 一致（否则 contain 会在四周留空）').toMatch(
      /aspect-ratio:\s*1080\s*\/\s*410/,
    );
    expect(rule, '旋钮 --plate-w 要留着').toMatch(/--plate-w/);
    expect(rule, '旋钮 --plate-op 要留着').toMatch(/--plate-op/);
    /* base.css 给 img 定了 max-width:100%，这层刻意比版心宽 ⇒ 必须解除 */
    const img = PAGE.match(/\.frac-inf img\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(img, '没读到 .frac-inf img 的样式块').toBeTruthy();
    expect(img, '没解除 max-width:100% ⇒ 会缩到版心宽').toMatch(/max-width:\s*none/);
    /* 装饰层必须对读屏隐藏 */
    expect(PAGE, '底纹层缺 aria-hidden').toMatch(/class="frac-inf" aria-hidden="true"/);
    expect(PAGE, '画布缺 aria-hidden').toMatch(/data-fracture aria-hidden="true"|<canvas[^>]*aria-hidden="true"[^>]*>/);
    /* 多档 srcset 走构建期优化管线 */
    expect(PAGE, 'Image 没给 widths（会出单一的原始尺寸）').toMatch(/widths=\{\[540, 1080\]\}/);
    expect(PAGE, 'sizes 要说明它比视口宽').toMatch(/sizes="[^"]*148vw/);
  });

  it('★ 浓淡 0.18：站主拍板「与百褶 ∞ 同档」，且实测可核', () => {
    const rule = PAGE.match(/\.frac-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    const op = Number(rule.match(/--plate-op,\s*([\d.]+)\)/)?.[1]);
    expect(Number.isFinite(op), '读不到 --plate-op 的默认值').toBe(true);
    expect(op, `不透明度 ${op} 与站主拍板的 0.18 不符`).toBeCloseTo(0.18, 3);
    /* 量出来的对齐依据要留在文件里（后人别再凭感觉调） */
    expect(PAGE_RAW, '校准口径没留在注释里').toMatch(/_probe\/_404-calib\.mjs/);
    expect(PAGE_RAW, '参照层（百褶 ∞）的实测值没留下').toMatch(/15\.4/);
    expect(PAGE_RAW, '本图定稿档的实测值没留下').toMatch(/14\.2/);
  });

  it('★ 画布层的显隐门控是 opacity（不是 hidden），层级 38', () => {
    const rule = PAGE.match(/\.fracture\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, '没读到 .fracture 的样式块').toBeTruthy();
    expect(rule, '显隐必须是 opacity 门控').toMatch(/opacity:\s*0/);
    /* ★ display:none / hidden 下 canvas 的 clientWidth 恒为 0 ⇒ 装置量不到尺寸、一帧都画不出
       （友链页「星座」为此白排查过一轮）。 */
    expect(rule, '画布不许用 display:none 做显隐').not.toMatch(/display:\s*none/);
    expect(PAGE, '没写 .is-ready 的终态').toMatch(/\.fracture\.is-ready\s*\{[^}]*opacity:\s*1/);
    expect(rule, '画布不许拦指针（它盖在正文之上）').toMatch(/pointer-events:\s*none/);
    /* 38 = 正文(main 的 1) 之上、抽屉(40/41) 之下 —— 唯一站得住的位置 */
    expect(rule, '层级必须是 38').toMatch(/z-index:\s*38/);
    expect(rule, '不许与准星同层（44 —— 准星是跟随指针的反馈，要压过抽屉）').not.toMatch(/z-index:\s*44/);
    /* 且必须真的夹在正文与过渡蒙版之间 —— 阶梯变了要回头对 */
    const ptZ = Number(read('src/styles/transition.css').match(/html\.pt-on\s+\.pt\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
    expect(ptZ, '过渡蒙版的 z-index 变了 ⇒ 阶梯契约要重对').toBeGreaterThan(38);
  });

  it('★ 窄屏另给一档（源图只有 1080 宽，不能靠放大撑场面）', () => {
    const rm = PAGE.slice(PAGE.indexOf('@media (max-width: 767px)'));
    expect(PAGE, '没有窄屏档').toMatch(/@media\s*\(max-width:\s*767px\)/);
    expect(rm, '窄屏档里没有 .frac-inf 的取宽').toMatch(/\.frac-inf\s*\{[\s\S]*?width:/);
    expect(rm, '窄屏档也要带 vh 上界').toMatch(/vh/);
  });

  it('★ 页面挂上装置脚本', () => {
    expect(PAGE, '没 import 装置脚本 ⇒ 画布永远空白').toMatch(/import\s+'\.\.\/scripts\/fracture'/);
  });
});

describe('404 · 构建产物', () => {
  it('★ 两层装饰 + body 类 + 语义都在产物里', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect(HTML, '缺底纹层').toMatch(/class="frac-inf"/);
    expect(HTML, '底纹必须走构建期优化管线（srcset）').toMatch(/<img[^>]*srcset="[^"]*"/);
    expect(HTML, '缺装置画布').toMatch(/data-fracture/);
    expect(HTML, 'body 上没有 frac-plate ⇒ 百褶 ∞ 没被关掉').toMatch(/<body[^>]*class="[^"]*frac-plate/);
    expect(HTML, '标题没在正文流里').toMatch(/<header class="pagehead"[^>]*><h1[^>]*>404<\/h1>/);
    expect(HTML, '正文第一段没渲染').toMatch(/class="prose"/);
    expect(HTML, '回首页的链接没了').toMatch(/href="\/"/);
    /* ★ 核心诉求：404 不该有 canonical */
    expect(HTML, '产物里出现了 canonical ⇒ noCanonical 没生效').not.toMatch(/rel="canonical"/);
  });

  it('★ 画布未被钉 hidden、关百褶 ∞ 的规则真在产物里', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    const cv = HTML.match(/<canvas[^>]*data-fracture[^>]*>/)?.[0] ?? '';
    expect(cv, '产物里找不到装置画布').toBeTruthy();
    expect(cv, 'canvas 被钉了 hidden ⇒ clientWidth 恒为 0，装置一帧都画不出').not.toMatch(/\shidden/);
    expect(HTML, '关百褶 ∞ 的规则没进产物（权重必须对齐才压得住 .page-inf）').toMatch(
      /body\.frac-plate \.page-inf\{display:none\}/,
    );
  });

  it('★ 两层装饰都在 <main> 之前（模型：plate 槽在 .shell 之外）', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    const iInf = HTML.indexOf('frac-inf');
    const iCv = HTML.indexOf('data-fracture');
    const iMain = HTML.indexOf('<main');
    expect(iInf, '底纹层不在产物里').toBeGreaterThanOrEqual(0);
    expect(iCv, '画布不在产物里').toBeGreaterThanOrEqual(0);
    expect(iMain, '找不到 <main>').toBeGreaterThanOrEqual(0);
    expect(iInf, '底纹层必须在 <main> 之前（plate 槽）').toBeLessThan(iMain);
    expect(iCv, '画布必须在 <main> 之前（plate 槽）').toBeLessThan(iMain);
  });

  it('★ 正对照：其它页没被这一轮碰坏', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    /* 百褶 ∞ 只在 404 关掉；别的内页必须照旧留着（否则全站少一层纸白语言） */
    const about = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');
    expect(about, 'about 页的百褶 ∞ 被误关了').not.toMatch(/frac-plate/);
    /* 归档页的筛选契约（别的轮次依赖它） */
    const archive = readFileSync(join(DIST, 'archive', 'index.html'), 'utf8');
    expect(archive, '归档页的 .index 列表被动过').toContain('class="index"');
    expect(archive, '归档行的 data-* 被动过').toMatch(/<li\s+data-date="[^"]+"\s+data-year="\d{4}"/);
  });

  it('零新增运行时依赖（红线）', () => {
    const deps = JSON.parse(read('package.json')).dependencies ?? {};
    expect(Object.keys(deps).length, `dependencies 应恰好 3 个，实际 ${Object.keys(deps).length}`).toBe(3);
    expect(Object.keys(deps)).toEqual(expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']));
  });

  it('页面不新增外链资源（零第三方请求）', () => {
    expect(PAGE, '404 页面里出现了外链').not.toMatch(/https?:\/\/(?!northcedar\.top)/);
  });
});
