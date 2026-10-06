import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* 404 页 2026-10-06 这一轮的契约：底纹 ∞ 换新 + 装置「裂痕 FRACTURE」。
 *
 * 站主原话：
 *   「开始做 404  FRACTURE 裂痕　鼠标划过玻璃裂开并缓慢生长，裂纹绕开文字」
 *   「404 页背景用 <图> 这个左半边是开口的无限符号（无限两个汉字不要，你自己拿灰色填充）
 *     替代百褶无限符号，你自己抠图」
 * 三处拍板：
 *   · 抠图范围 **乙 · ∞ + 碎屑肌理**（丢小字标签与右侧独立光锥）
 *   · 浓淡 **0.18 · 与百褶 ∞ 同档**
 *   · 裂痕生命周期 **甲 · 永久累积 + 总量封顶**（不愈合；超了淡出最旧那条）
 *
 * 这里守的是「不可退让的性质」，不是「这一版的实现形态」：
 *   ① 「裂痕」不是新造的名字 —— 它本来就在 `rl-core.ts` 头部那份**最初的十台装置命名表**里。
 *      ★ 序号只能从**源码 / git log**读，不能从 spec 推（spec 里「墨滴」连章节都没有）。
 *   ② 素材自带 alpha、四个角透明、**已把 无限 填成与环境无缝的灰**、体积可控。
 *   ③ 素材**中性灰**（不是染绿）—— 站主原话是「你自己拿灰色填充」，且源图本就是近单色。
 *      ★ 但去饱和这件事必须**有据可查**，不能悄悄做：断言里带着源图的色差实测。
 *   ④ 底纹必须挂 `.shell` 之外（`plate` 槽）；本页必须关掉百褶 ∞，否则两套母题叠着。
 *   ⑤ 颜色只从 token 读；脚本里只许留**一个字面兜底**（--accent），alpha 靠派生。
 *   ⑥ 三条分野：**离手还在长** / **几何受 DOM 文字盒约束** / **挂文档坐标系**。
 *   ⑦ 「缓慢生长」= 前沿速度是 px/s（吃 dt），不是"一段动画的时长"。
 *   ⑧ 「绕开文字」= 逐行紧盒（Range.getClientRects），受阻先转向、全撞才收工，**绝不硬穿**。
 *   ⑨ 形状零 `Math.random`（本站硬规矩）—— 用按种子确定的 mulberry32。
 *   ⑩ 降级：触摸 / reduced-motion ⇒ 整个装置不做（不是"装个弱的"）。
 *   ⑪ 零新增运行时依赖（红线）。
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
/** 输入段：从 pointermove 起、到起停段之前 */
const INPUT = TS.slice(at("'pointermove'"), at('fit();'));
/** 起停段 */
const BOOT = TS.slice(at('fit();'));
const GROW = TS.slice(at('function grow('), at('function draw('));
const BLOCKED = TS.slice(at('const blocked'), at('const cracks'));
const DRAW = TS.slice(at('function draw('), at("'pointermove'"));
/** ⚠ 锚必须是 `startLoop((` —— 裸 `startLoop` 会先命中 **import 那一行**，
 *  于是切片从文件头开始，`grow(dt)` 的函数定义排到了调用点之前（第一版就报了这个）。 */
const LOOP = TS.slice(at('startLoop(('));

describe('404 · 装置「裂痕 FRACTURE」的身份（第十台）', () => {
  it('★ 名字来自最初的十台命名表，不是本轮新造的', () => {
    /* 序号只能从源码读。spec 里「墨滴」连章节都没有 —— 光读文档会把第十台数成第八台
       （准星那轮就栽过一次）。 */
    expect(RL_CORE, 'rl-core 的命名表里没有「裂痕」⇒ 装置谱系对不上').toContain('裂痕');
    expect(read('src/pages/log.astro'), 'log.astro 的命名表里没有「裂痕」').toContain('裂痕');
    /* 十台：归档卷尺 / 关于亲笔 / 阅读尺 / 浮游 / 走时仪 / 准星 / 墨滴 / 星座 / 裂痕
       —— 列了 9 个名字而总数说 10，是因为「走时仪」在 log.astro 里已兑现、不在内页编号里 */
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
    expect(TS_RAW, '没写明"不做愈合式淡出"（站主拍板甲档）').toContain('不做愈合式淡出');
    expect(TS_RAW, '没写明"不引入不可复现的随机"（本站硬规矩）').toContain('不做');
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
         **没有任何一个 >100** —— 那是 JPEG 在高对比边缘的色度振铃 + 一处 4×3 的偏紫小片
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

  it('★ 构图**出血**：内容触到右/上/下三边（左边只 4px，近乎不算）', async () => {
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
  it('★ 两道裂纹色的 token 都在，且是 --accent 压 alpha（8 位 hex）', () => {
    for (const name of ['--deco-fracture-line', '--deco-fracture-glow']) {
      expect(TOKENS, `tokens.css 里没有 ${name}`).toContain(name);
    }
    /* ★ 这两条**必须排在**下面那条 `#2d7d46` 的正向前面 —— 否则会被它挡住：
       改成 #4caf50 时先失败的是"必须是 #2d7d46"，这一条永远轮不到，
       于是它是不是活着就无从证明（变异验证就是用来照这种死门闩的）。
       ★ 不许用 --accent-bright(#4caf50)：token 注释明写它对纸白只有 2.66:1、"只许用在深色底"，
       而 404 是纸白底。 */
    expect(TOKENS, '裂纹用了 --accent-bright 的色值 ⇒ 对纸白对比度不足').not.toMatch(/--deco-fracture-line:\s*#4caf50/);
    expect(TOKENS, '裂纹用了 --accent-bright 的色值').not.toMatch(/--deco-fracture-glow:\s*#4caf50/);
    /* 8 位 hex：6 位色 + 2 位 alpha。站上约定 alpha 由 hex 承载、不写 rgba() */
    expect(TOKENS, '主线必须是 --accent(#2d7d46) 压 alpha').toMatch(/--deco-fracture-line:\s*#2d7d46[0-9a-f]{2}/);
    expect(TOKENS, '柔光必须是 --accent(#2d7d46) 压 alpha').toMatch(/--deco-fracture-glow:\s*#2d7d46[0-9a-f]{2}/);
    /* 柔光要比主线**淡**（它是垫在主线之下的宽光）：alpha 数值必须更小 */
    const a1 = TOKENS.match(/--deco-fracture-line:\s*#2d7d46([0-9a-f]{2})/)?.[1] ?? '';
    const a2 = TOKENS.match(/--deco-fracture-glow:\s*#2d7d46([0-9a-f]{2})/)?.[1] ?? '';
    expect(parseInt(a1, 16), `主线 alpha ${a1} 应比柔光 ${a2} 浓`).toBeGreaterThan(parseInt(a2, 16));
  });

  it('★ 脚本侧只留一个字面兜底（--accent），其余全部派生', () => {
    const hexes = [...TS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hexes.length, `脚本里有 ${hexes.length} 处字面色值：${hexes.join(',')} ⇒ 颜色只许住在 tokens.css`).toBeLessThanOrEqual(1);
    if (hexes.length === 1) expect(hexes[0], '唯一那个字面兜底该是 --accent').toBe('#2d7d46');
    /* 两个 token 都要读；兜底的 alpha 后缀必须与 token 里的一致（防两处对不上） */
    expect(TS).toMatch(/getPropertyValue\('--deco-fracture-line'\)/);
    expect(TS).toMatch(/getPropertyValue\('--deco-fracture-glow'\)/);
    const a1 = TOKENS.match(/--deco-fracture-line:\s*#2d7d46([0-9a-f]{2})/)?.[1] ?? '';
    const a2 = TOKENS.match(/--deco-fracture-glow:\s*#2d7d46([0-9a-f]{2})/)?.[1] ?? '';
    expect(TS, `脚本兜底的 alpha 后缀与 token(${a1}) 不一致`).toContain(`'${a1}'`);
    expect(TS, `脚本兜底的 alpha 后缀与 token(${a2}) 不一致`).toContain(`'${a2}'`);
    /* 不写 rgba() */
    expect(TS, '脚本里不许出现 rgba()/rgb()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);
  });
});

describe('404 · 装置脚本契约（fracture.ts）', () => {
  it('★ 形状零随机 —— 用按种子确定的 mulberry32', () => {
    expect(TS, '源码含 Math.random ⇒ 形状不可复现，没法验收').not.toMatch(/Math\.random/);
    expect(TS, '没看到 mulberry32').toMatch(/mulberry32/);
    expect(TS, 'mulberry32 的魔数应留下（认出是哪个 PRNG）').toMatch(/0x6d2b79f5/);
    expect(TS, '每条前沿要带自己的 rnd（不是全局一个）').toMatch(/rnd:\s*\(\)\s*=>\s*number/);
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
    /* 其余九台都是 fixed 挂视口；这一台必须与文字盒保持相对关系，而文字随滚动走。
       裁决证据：高度取 scrollHeight 并**写回 canvas.style.height** ——
       绝对定位元素的 `height:100%` 只解析到视口高。 */
    expect(TS, '高度必须取文档高（scrollHeight）').toMatch(/scrollHeight/);
    expect(TS, '必须把文档高写回 canvas.style.height（height:100% 只到视口）').toMatch(/cv\.style\.height\s*=/);
    expect(TS, '宽度也要写回 style（与画布像素宽是两件事）').toMatch(/cv\.style\.width\s*=/);
    const rule = PAGE.match(/\.fracture\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, 'canvas 必须是 absolute（fixed 会让"绕开文字"随滚动错位）').toMatch(/position:\s*absolute/);
    expect(rule, 'canvas 不许 fixed').not.toMatch(/position:\s*fixed/);
  });

  it('★★ 分野 ②：「绕开文字」用 Range 的**逐行紧盒**，不是元素框', () => {
    /* 取元素框会把整段版心都算进去（`.prose` 有一行字也算整块）⇒ "绕开"变成"半个页面不许裂"。 */
    expect(TS, '必须走 TreeWalker 逐文本节点').toMatch(/createTreeWalker/);
    expect(TS, '必须用 Range 取框').toMatch(/createRange\(\)/);
    expect(TS, '必须用 getClientRects（逐行紧盒；getBoundingClientRect 是元素级）').toMatch(
      /getClientRects\(\)/,
    );
    expect(TS, '文字盒必须换算到文档坐标（与裂纹同一坐标系）').toMatch(/scrollX/);
    expect(TS, '文字盒必须换算到文档坐标').toMatch(/scrollY/);
    /* 空文本节点要跳过，否则一堆 0 尺寸框混进来 */
    expect(TS, '空文本节点要跳过').toMatch(/trim\(\)/);
    expect(TS, '要滤掉 0/极小的框').toMatch(/b\.width\s*<\s*\d/);
    /* 必须有上限，防病态页面把每帧拖死 */
    expect(TS, '文字盒要有上限（RECT_LIMIT）').toMatch(/RECT_LIMIT/);
  });

  it('★★ 「绕开」的三层语义都在：安全距离 / 先转向 / 全撞才收工（绝不硬穿）', () => {
    /* ① 安全距离：文字盒要外扩 */
    expect(TS_RAW, '要用 PAD 给文字盒留安全距离').toMatch(/const PAD\s*=/);
    expect(BLOCKED, 'blocked() 必须把 PAD 算进去').toMatch(/PAD/);
    /* ② 撞上先转向试探，且**两边都试** */
    expect(GROW, '生长里必须先问文字盒').toMatch(/if\s*\(segBlocked\(/);
    expect(GROW, '受阻要按 TURN 表试探角度').toMatch(/TURN/);
    expect(GROW, '受阻要两边都试（只试一边会贴着字走）').toMatch(/\[1,\s*-1\]/);
    expect(GROW, '转向后本段不推进（continue）').toMatch(/continue/);
    /* ③ 全都撞 ⇒ 这条前沿到头，而不是穿过去 */
    expect(GROW, '全都撞时必须收工（dead），不许硬穿').toMatch(/dead\s*=\s*true/);
    /* ④ ★★ 线段也要躲 —— 只测落点不够。
       两端都在盒外的一段直线仍可能从盒角**切过去**（凸区域也有这个性质）。
       实测（`_probe/_404-lab.mjs`）：只测落点时，约 2% 的墨落在"字形盒 + 9px"那条安全带里。 */
    expect(TS, '必须有一个"沿段采样"的判定，不能只测落点').toMatch(/const segBlocked\s*=/);
    const seg = TS.slice(at('const segBlocked'), at('const cracks'));
    expect(seg, 'segBlocked 内部要取若干内点（不是直接返回 blocked(x1,y1)）').toMatch(
      /\[0\.25,\s*0\.5,\s*0\.75\]|\[0\.2,\s*0\.4,\s*0\.6,\s*0\.8\]/,
    );
    expect(seg, 'segBlocked 也必须包含落点本身的判定').toMatch(/blocked\(x1,\s*y1\)/);
    /* ⑤ 起点落在文字上 ⇒ 这一下根本不裂 */
    expect(INPUT, '起点在文字上时不该生裂纹（"绕开"也包括"不在字上开缝"）').toMatch(
      /if\s*\(blocked\(x,\s*y\)\)\s*return/,
    );
    /* ⑥ 文字盒每次生成时**重取**（字号/换行/滚动都会变，缓存会绕开一个旧位置） */
    expect(INPUT, '生成时必须重取文字盒').toMatch(/rects\s*=\s*textRects\(\)/);
  });

  it('★★ 分野 ①：「缓慢生长」= 前沿速度吃 dt（px/s），不是动画时长', () => {
    const speed = Number(TS.match(/const SPEED\s*=\s*([\d.]+)/)?.[1]);
    expect(Number.isFinite(speed), '读不到 SPEED').toBe(true);
    expect(TS, '推进量必须正比于 dt（真实 dt，不是每帧固定系数）').toMatch(/SPEED\s*\*\s*dtMs\s*\/\s*1000|SPEED\s*\*\s*dt/);
    /* ★★ 光"乘了 dt"还不够 —— 落笔是按 SEG 整段落的，得先把余量攒起来。
       没有 `acc` 时 `while (remain > 0)` 在 60fps 下**每帧恰好落一段**
       （adv=2px 却走 SEG=7px）⇒ 实际速度 = SEG × 帧率 = 420px/s（144Hz 上是 1008），
       既与 SPEED 无关、也与帧率有关。`_probe/_404-lab.mjs` 实测：改前 40 帧到头。 */
    expect(TS, 'Tip 要有"未走满一段的余量" acc').toMatch(/acc:\s*number/);
    expect(TS, 'newTip 要把 acc 初始化').toMatch(/acc:\s*0/);
    expect(GROW, '生长要先攒余量（t.acc += adv）').toMatch(/t\.acc\s*\+=\s*adv/);
    expect(GROW, '落笔的门槛必须是"攒够一段"（t.acc >= SEG），不是"本帧有推进量"').toMatch(
      /while\s*\(t\.acc\s*>=\s*SEG/,
    );
    expect(GROW, '落笔后要扣掉余量').toMatch(/t\.acc\s*-=\s*SEG/);
    expect(GROW, '不许再出现"每帧走一格"的旧写法（remain）').not.toMatch(/remain/);
    /* 余量也得画出来，否则 120px/s 会变成"每 3~4 帧蹦 7px"的卡顿 */
    expect(DRAW, '还没走满一段的刀尖也要画（否则看着是卡顿的生长）').toMatch(/t\.acc\s*>\s*0/);
    /* 单条裂纹走完 MAX_TIP 的秒数 = 观感"缓慢"的机器读数 */
    const maxTip = Number(TS.match(/const MAX_TIP\s*=\s*([\d.]+)/)?.[1]);
    const secs = maxTip / speed;
    expect(secs, `单条裂纹走完要 ${secs.toFixed(2)}s ⇒ 快于 1.2s 就不叫"缓慢生长"了`).toBeGreaterThan(1.2);
    expect(secs, `单条裂纹走完要 ${secs.toFixed(2)}s ⇒ 慢于 6s 会让人以为卡住`).toBeLessThan(6);
    /* 而且指针**离开之后它还要继续长**（分野 ① 的正身）—— 指针事件里不许出现"停长" */
    expect(INPUT, '指针离开时不许把裂纹停掉（失焦只重置"划"的追踪）').not.toMatch(/dead\s*=\s*true/);
  });

  it('★ 生裂纹靠"指针累计走过 SPAWN_DIST"，不是每帧/每次移动都生', () => {
    expect(INPUT, '没有累计距离').toMatch(/acc\s*\+=/);
    expect(INPUT, '没按阈值门控（手抖也会裂、而且帧帧裂）').toMatch(/acc\s*<\s*SPAWN_DIST/);
    expect(INPUT, '生过之后要清零').toMatch(/acc\s*=\s*0/);
    /* 抖动不算"划" */
    expect(INPUT, '极小的位移要忽略').toMatch(/d\s*<\s*1/);
  });

  it('★ 甲档：永久累积 + 总量封顶，且淘汰是**淡出**不是瞬删', () => {
    expect(TS, '没有总量封顶 ⇒ 划过一屏会积成蛛网').toMatch(/const MAX_CRACKS\s*=\s*\d+/);
    /* ★ 只是"定义了常量"不算数 —— 必须真的拿去比较（否则把上限调成 999999 也能过） */
    expect(TS, 'MAX_CRACKS 必须真的用作比较，不能只是定义了常量').toMatch(
      /cracks\.length\s*>=\s*MAX_CRACKS/,
    );
    expect(TS, '封顶后要淘汰最旧那条').toMatch(/for\s*\(const c of cracks\)/);
    expect(TS, '淘汰必须是淡出：记时刻（gone），不是立即移除').toMatch(/c\.gone\s*=\s*performance\.now\(\)/);
    expect(TS, '淡出要有时长常量').toMatch(/const FADE\s*=\s*\d+/);
    /* 不愈合：不许出现"时间到了一律消失/整体衰减"的写法 */
    expect(TS, '不许有愈合式整体淡出（站主拍板甲档）').not.toMatch(/globalAlpha\s*=\s*[^\n]*\*\s*0\.9/);
    /* 同时生长的前沿也要有上限（防"一划炸开"） */
    expect(TS, '并发前沿要有上限（MAX_LIVE）').toMatch(/MAX_LIVE/);
    /* 淡出结束才真正移除 —— 这是"淡出"与"瞬删"的判据 */
    expect(DRAW, '淡出结束才 splice 掉').toMatch(/cracks\.splice\(/);
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
    expect(LOOP.indexOf('gate.'), 'gate 判断要在 grow 之前').toBeLessThan(LOOP.indexOf('grow('));
  });

  it('★ resize 要重算尺寸与文字盒，且节流', () => {
    expect(TS, '没接 resize').toMatch(/addEventListener\(\s*\n?\s*'resize'/);
    const rz = TS.slice(at("'resize'"));
    expect(rz, 'resize 要重算文字盒（换行会变）').toMatch(/rects\s*=\s*textRects\(\)/);
    expect(rz, 'resize 要重算画布尺寸').toMatch(/fit\(\)/);
    expect(rz, 'resize 要节流（防拖动窗口时每像素重算）').toMatch(/<\s*200/);
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
