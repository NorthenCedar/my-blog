/* =============================================================================
 * 交互基线的门闩：页面过渡时序 + 全站 hover 统一
 *
 * 两条都是 2026-10-03 站主直接报的问题，各配一组断言。
 * 共同点：**都是「看起来对」但极易回退**的性质，且回退后不报错、不变红，
 * 只能靠门闩钉住。
 * ============================================================================= */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'index.html'));

const TRANSITION = readFileSync(join(ROOT, 'src/styles/transition.css'), 'utf8');
const HOVER = readFileSync(join(ROOT, 'src/styles/hover.css'), 'utf8');
const TOKENS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const BASE = readFileSync(join(ROOT, 'src/layouts/Base.astro'), 'utf8');
const HOME = readFileSync(join(ROOT, 'src/pages/index.astro'), 'utf8');

/* ---------- 1. 页面过渡：内容不能比墨层早回来 ---------- */

describe('交互基线 · 页面过渡时序（2026-10-03）', () => {
  /* 站主原话：「过渡动画比页的内容晚出来」。
   * 根因是 `pt-shell`（内容）的关键帧与 `pt-ink`（墨层）**错位**：
   * 原来 0%→12% 静止、12%→40% 才渐深，而墨层到 **26%** 才盖满
   * ⇒ 约 234ms 的窗口里「墨只盖一半、内容却清清楚楚」。
   * 判据：**逐个关键帧百分比比对**，而不是肉眼看动画。 */
  /* ⚠ 提取 keyframes 正文：闭合花括号前是**空格**（不是换行），
     所以 `\n\}` 匹配不到；而用「下一个 @keyframes」作边界又会把
     media 查询里的重写段一起吞进来（第一版两个都踩了）。
     正解：从 `@keyframes X {` 之后，取到**第一个独立的 `}`**为止
     —— 内部嵌套的 `{…}` 各自紧跟内容，不会出现行首的 `}`。 */
  const keyframes = (name: string) => {
    const start = TRANSITION.indexOf(`@keyframes ${name} {`);
    if (start < 0) return '';
    const rest = TRANSITION.slice(start + `@keyframes ${name} {`.length);
    const end = rest.indexOf('\n}');
    return end < 0 ? '' : rest.slice(0, end);
  };
  /** 从一段 keyframes 正文里抽出所有 `NN%`（去重、升序） */
  const stops = (body: string) =>
    [...new Set([...body.matchAll(/(\d+)%/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

  it('★ 内容退场必须早于墨层盖满（0%~26% 之间就压到最深）', () => {
    const shellStops = stops(keyframes('pt-shell'));
    expect(shellStops.length, '没读到 pt-shell 的关键帧').toBeGreaterThan(2);
    // 最深那一帧（opacity 最低）必须落在 26% 之前
    const body = keyframes('pt-shell');
    const deepest = body.indexOf('opacity: 0.32');
    const head = body.slice(0, deepest);
    const pctMatch = head.match(/(\d+)%/);
    const deepestAt = pctMatch ? Number(pctMatch[1]) : -1;
    expect(deepestAt, '没找到 opacity:0.32 那一帧').toBeGreaterThanOrEqual(0);
    expect(deepestAt, `内容应在墨层盖满（26%）之前退到最深，实际在 ${deepestAt}%`)
      .toBeLessThanOrEqual(26);
  });

  it('★ 内容回清晰必须晚于墨层开始斜切（58%），否则又是「内容先亮」', () => {
    const body = keyframes('pt-shell');
    /* ⚠ 那个 100% 帧里**带一行注释**，注释中出现了 `}` ——
       用 `[^}]*` 会在这里被截断（第一版就栽在这）。
       ⇒ 正解：先剥掉 keyframes 正文里的注释，再找那一帧。
       另外产物里 `100%` 会被压缩成 `to`，两种写法都认。 */
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const m = clean.match(/(?:100%|to)\s*\{\s*opacity:\s*1;\s*filter:\s*none;/);
    expect(m, '没找到 pt-shell 回到 opacity:1 的关键帧').toBeTruthy();
    /* 判据不是「这一帧的百分比」，而是**它前面那个停驻点** ——
       回升是插值出来的，真正决定「什么时候开始变亮」的是它上一帧。 */
    const before = clean.slice(0, m!.index);
    const lastStop = [...before.matchAll(/(\d+)%/g)].pop();
    expect(lastStop, '没找到回升段之前的停驻帧').toBeTruthy();
    expect(Number(lastStop![1]),
      `内容应在墨层开始斜切（58%）之后才回清晰，停驻点却在 ${lastStop![1]}%`)
      .toBeGreaterThanOrEqual(58);
  });

  it('★ 起点 0% 就在压暗（原来 0%~12% 静止，那正是「内容等动画」的窗口）', () => {
    const body = keyframes('pt-shell');
    expect(body, 'pt-shell 仍是 `0%, 12%` 静止起手 —— 那是站主报的那个毛病')
      .not.toMatch(/0%,\s*\n?\s*12%/);
  });

  it('与墨层的时间点对齐（改 pt-ink 百分比要回来重对）', () => {
    const inkStops = stops(keyframes('pt-ink'));
    expect(inkStops, '没读到 pt-ink 的关键帧').toContain(26); // 盖满
    expect(inkStops, '没读到 pt-ink 的关键帧').toContain(58); // 开始斜切
    // 两条动画必须同时长，否则「对齐百分比」没有意义
    const shellAnim = TRANSITION.match(/animation:\s*pt-shell\s+var\(--pt-sweep\)/);
    const inkAnim = TRANSITION.match(/animation:\s*pt-ink\s+var\(--pt-sweep\)/);
    expect(shellAnim, 'pt-shell 没用 var(--pt-sweep)').toBeTruthy();
    expect(inkAnim, 'pt-ink 没用 var(--pt-sweep)').toBeTruthy();
  });

  it('摘类时机仍留有余量（动画 900ms ⇒ HANDOFF_MS 至少 900）', () => {
    const script = readFileSync(join(ROOT, 'src/scripts/transition.ts'), 'utf8');
    const m = script.match(/HANDOFF_MS\s*=\s*(\d+)/);
    expect(m, '没读到 HANDOFF_MS').toBeTruthy();
    const sweep = TOKENS.match(/--pt-sweep:\s*(\d+)ms/);
    expect(sweep, 'tokens.css 里没读到 --pt-sweep').toBeTruthy();
    expect(Number(m![1]), '摘类早于动画结束 ⇒ 会把最后一帧硬切掉')
      .toBeGreaterThanOrEqual(Number(sweep![1]));
  });
});

/* ---------- 2. 全站 hover 统一 ---------- */

describe('交互基线 · 全站 hover 统一（2026-10-03）', () => {
  it('★ hover.css 排在 base/prose/links 之后（只补参数、不改形态）', () => {
    const iHover = BASE.indexOf("import '../styles/hover.css'");
    expect(iHover, 'Base.astro 没引入 hover.css').toBeGreaterThan(-1);
    for (const f of ['base.css', 'prose.css', 'links.css']) {
      const i = BASE.indexOf(`import '../styles/${f}'`);
      expect(i, `Base.astro 里找不到 ${f} 的引入`).toBeGreaterThan(-1);
      expect(iHover, `hover.css 必须排在 ${f} 之后`)
        .toBeGreaterThan(i);
    }
  });

  it('★ 全部 hover 过渡都用首页那两个 token，不写裸时长/曲线', () => {
    /* 只取**真正会应用的**规则块：把注释与 @media 段落先剥掉，
       否则会把文件头那段说明文字里的 `transition: none` 也当成一条规则
       （第一版就踩了：正则跨过注释，匹到散文里的字面量）。 */
    const rulesOnly = HOVER
      .replace(/\/\*[\s\S]*?\*\//g, ' ')          // 剥块注释
      .replace(/@media[^{]*\{[\s\S]*$/, ' ');       // 去掉末尾 @media 段（1ms 线性是故意的例外）
    const blocks = [...rulesOnly.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
    /* 阈值 4：剥掉注释后hover.css 里有 4 组真规则
       （正文链接 / 按钮 / 文字型链接 / 表单控件）。别写大 ——
       写大了以后有人删掉一组规则，测试还会绿。 */
    expect(blocks.length, 'hover.css 里的 hover 规则组少于 4组（是不是被删了？）')
      .toBeGreaterThanOrEqual(4);
    for (const b of blocks) {
      expect(b, `这段 transition 没用 --dur-hover：${b.slice(0, 60)}`)
        .toContain('var(--dur-hover)');
      expect(b, `这段 transition 没用 --ease-interact：${b.slice(0, 60)}`)
        .toContain('var(--ease-interact)');
    }
  });

  it('★ 位移幅度用 token，且两个值与首页一致', () => {
    expect(TOKENS, 'tokens.css 缺 --hover-lift').toMatch(/--hover-lift:\s*-2px/);
    expect(TOKENS, 'tokens.css 缺 --hover-nudge').toMatch(/--hover-nudge:\s*6px/);
    // 首页原话：nav 上浮 2px、entry 横移 6px ⇒ token 必须与之一致
    expect(HOME, '首页 nav 的上浮值变了 ⇒ token 要跟着对')
      .toMatch(/transform:\s*translateY\(-2px\)/);
    expect(HOME, '首页 entry 的横移值变了 ⇒ token 要跟着对')
      .toMatch(/transform:\s*translateX\(6px\)/);
  });

  it('★ hover.css 不定义颜色（形态归各页，基线只给参数）', () => {
    /* 这是本文件的核心纪律，也是最容易破的一条：
       一旦基线里开始写 color/background，各页的配色就会被它抢走
       （hover.css 排在最后 ⇒ 同特异性下它赢）。 */
    const colorDecls = [...HOVER.matchAll(/^\s*(color|background(?:-color)?)\s*:/gm)]
      .map((m) => m[1]);
    expect(colorDecls, `hover.css 里不该出现颜色声明：${colorDecls.join(', ')}`)
      .toHaveLength(0);
  });

  it('★ hover 规则都配 :focus-visible（键盘用户看到同一份反馈）', () => {
    /* 只在**剥掉注释**后的源码里查 —— 否则文件头说明文字里那些
       「`.prose a:hover` 的…」会被当成真规则（第一版踩过）。
       判据：**按族**核对「有 :hover 位移 ⇒ 也有 :focus-visible 位移」。
       ⚠ 不按完整选择器串配对：按钮族写的是
       `:hover:not(:disabled)` / `:focus-visible:not(:disabled)`，
       串不长得一模一样，逐串比会误报。
       ⇒ 抽出「含 transform 的规则块」全文，两种伪类都查。 */
    const rulesOnly = HOVER.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const iMedia = rulesOnly.indexOf('@media');
    const main = iMedia > 0 ? rulesOnly.slice(0, iMedia) : rulesOnly;
    // 抽出所有「选择器里含 :hover 且声明里有 transform」的块
    const hoverMoveBlocks = [...main.matchAll(/([^{}]+:hover[^{}]*)\{([^}]*transform[^}]*)\}/g)]
      .map((m) => m[1]);
    expect(hoverMoveBlocks.length, 'hover.css 里没有任何带位移的 hover 规则').toBeGreaterThan(0);
    for (const sel of hoverMoveBlocks) {
      // 这个族里应至少有一个 :focus-visible 也带 transform
      const families = sel.split(',').map((s) => s.replace(/:hover[^{]*/, '').trim()).filter(Boolean);
      const focusMove = new RegExp(
        families.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
          .replace(/\|/g, '|') + '[^{}]*:focus-visible[^{}]*\\{[^}]*transform'
      );
      expect(focusMove.test(main),
        `这族有 :hover 位移但没有 :focus-visible 位移：${sel.trim().slice(0, 70)}`).toBe(true);
    }
    // 全站至少要有 :focus-visible 出现
    expect(main, 'hover.css 里完全没有 :focus-visible').toMatch(/:focus-visible/);
  });

  it('★ reduced-motion 撤位移、留颜色反馈（不整体 transition:none）', () => {
    const m = HOVER.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)$/);
    expect(m, 'hover.css 缺 prefers-reduced-motion 处理').toBeTruthy();
    const body = m![1];
    expect(body, 'reduced-motion 下不该整体 transition:none（那样 hover 完全没反馈）')
      .not.toMatch(/transition:\s*none/);
    expect(body, 'reduced-motion 下应保留 1ms 线性颜色过渡（反馈不能撤）')
      .toMatch(/1ms linear/);
    expect(body, 'reduced-motion 下应把位移撤掉（transform:none）')
      .toMatch(/transform:\s*none/);
  });

  it('★ hover.css 里每个类名都真实存在（防止编出选择器）', () => {
    /* 踩过一次：这份文件第一版写了 .index-list / .talk-list / .tag-list /
       .stack-list / .like-btn / .reply-btn 等**根本不存在的类名**
       （靠「看着像」写的）⇒ 那些规则一条都没生效，却看起来写得很全。
       ⇒ 门闩：把 hover.css 里出现的每个 .class 拿去源码里查。 */
    const classes = [...new Set(
      [...HOVER.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1])
    )];
    expect(classes.length, '没从 hover.css 里解析出类名').toBeGreaterThan(5);
    const missing: string[] = [];
    for (const c of classes) {
      const found = ['.astro', '.css', '.ts'].some((ext) =>
        hasFileWith(join(ROOT, 'src'), c, ext)
      );
      if (!found) missing.push(c);
    }
    expect(missing, `hover.css 里这些类名在源码里查无实据：${missing.join(', ')}`)
      .toHaveLength(0);
  });
});

/* 在 src/ 下递归找某个类名是否出现在 .astro/.css/.ts 里 */
function hasFileWith(dir: string, cls: string, ext: string): boolean {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'vendor') stack.push(p); continue; }
      if (!e.name.endsWith(ext)) continue;
      try {
        if (readFileSync(p, 'utf8').includes(cls)) return true;
      } catch { /* 读不到就跳过 */ }
    }
  }
  return false;
}

/* ---------- 3. 产物级：hover 基线真的进了 CSS ---------- */
describe.skipIf(!hasDist)('交互基线 · 产物里的 hover 与过渡', () => {
  it('产物 CSS 含 hover 基线（transition + 位移 token 都被内联进来）', () => {
    const f = readdirSync(join(DIST, '_astro')).find((x) => /^Base\..*\.css$/.test(x));
    expect(f, '没找到 Base 的产物 CSS').toBeTruthy();
    const css = readFileSync(join(DIST, '_astro', f!), 'utf8');
    /* ⚠ 不能只找第一条 `.prose a{…}`：产物里同名选择器有**三条**
       （基础态、:hover 态、hover 基线补的 transition）⇒ 只查第一条会误判。
       ⇒ 找**所有** `.prose a{…}` 块，其中至少有一条带 transition。 */
    const proseBlocks = [...css.matchAll(/\.prose a\{([^}]*)\}/g)].map((m) => m[1]);
    expect(proseBlocks.length, '产物里找不到 .prose a 规则').toBeGreaterThan(0);
    expect(proseBlocks.some((b) => b.includes('transition')), '产物里 .prose a 没有 transition')
      .toBe(true);
    /* ★ token 在 CSS 里**不会被内联成字面量** —— 它们定义在 `:root`，
       规则里用 `var()` 引用、运行时才解析（这是正确做法，站内所有 token 都如此）。
       ⇒ 断言必须查「`:root` 里有定义」+「规则里引用了」两件事。
       ⚠ 判值要接受**两种写法**：`260ms`（源码 tokens.css）与 `.26s`（构建期压缩）
         —— 产物里实测是 `--dur-hover:.26s`。只认一种会误报。 */
    const root = css.match(/:root\{([^}]*)\}/)?.[1] ?? '';
    expect(root, '产物 :root 里没有 --dur-hover（token 丢了）')
      .toMatch(/--dur-hover:\s*(?:260ms|\.26s)/);
    expect(root, '产物 :root 里没有 --ease-interact').toMatch(/--ease-interact:\s*cubic-bezier/);
    expect(root, '产物 :root 里没有 --hover-lift / --hover-nudge')
      .toMatch(/--hover-lift:\s*-2px/);
    expect(root, '产物 :root 里没有 --hover-nudge').toMatch(/--hover-nudge:\s*6px/);
    // 形态仍归各页：:hover 的颜色必须还在 hover.css 之外由 prose.css 提供
    const hoverBlock = [...css.matchAll(/\.prose a:hover\{([^}]*)\}/g)].map((m) => m[1]);
    expect(hoverBlock.some((b) => b.includes('accent-ink')),
      'prose 的 :hover 颜色丢了 —— hover.css 不该定义颜色，各页形态必须原样保留').toBe(true);
  });

  it('★ 过渡关键帧进了产物，且内容段确实带 opacity 0.32', () => {
    const f = readdirSync(join(DIST, '_astro')).find((x) => /^Base\..*\.css$/.test(x))
      ?? readdirSync(join(DIST, '_astro')).find((x) => /\.css$/.test(x));
    const css = readFileSync(join(DIST, '_astro', f!), 'utf8');
    const kf = css.match(/@keyframes pt-shell\{([\s\S]*?)\}\s*(?=@keyframes|\.pt|$)/);
    expect(kf, '产物里找不到 @keyframes pt-shell').toBeTruthy();
    expect(kf![1], '产物里 pt-shell 没有 opacity:.32 那一帧（源码改了没进产物？）')
      .toMatch(/opacity:\s*\.32/);
  });
});

/* ---------- 3. activityGate 的 onScreen 初值必须是 true ---------- */

describe('交互基线 · activityGate 不得因IO 未回调而永久停帧（2026-10-06）', () => {
  /* 症状（留言页墨滴，站主真浏览器连报三次）：
   *   「整页看不到任何墨痕」+「打开 F12 还什么都没输入就有墨痕了」
   *   +「改成小屏切各种尺寸都不行，只有开 F12 才行」。
   *   前三轮我一直在改墨痕的生成/范围逻辑，全部改错了地方。
   *
   * 机制（探针实测，_probe/_ink-gate2.mjs，真实产物）：
   *   `startLoop` 的调用方每帧开头判 `if (!gate.onScreen) return`，
   *   而 IntersectionObserver 的**首次回调是异步的**、对
   *   `position:fixed; inset:0` 的满屏画布**不保证一定来**
   *   （实测 1920×1000 视口下自建 IO 回调 **0 次**，1440×900 下 1 次）。
   *   初值 false ⇒「IO 没来」直接等价于「永久停帧」⇒ 一笔墨都画不出；
   *   而 F12 一开强制重排 ⇒ IO 重新求值⇒ 恢复 ⇒ 站主误以为 F12 激活了装置。
   *
   * ⇒ 不变式：**「IO 不回调」永远不等于「停帧」**。
   * 这条是**全站**门闩：rl-core 的 createActivityGate 被七台装置共用，
   * 任何一个调用方拿到的 onScreen 初值都必须是可用的（true）。
   */
  const RLCORE = readFileSync(join(ROOT, 'src/scripts/rl-core.ts'), 'utf8');

  it('★ onScreen 初值是 true，不是 false（IO 不回调 ≠ 停帧）', () => {
    /* ★★ 必须**剥掉块注释**再匹配 ——
       赋值语句上方那十几行注释里就写着"初值 true（不是 false）"、
       "初值 false ⇒ 永久停帧"等字样，不剥注释的话 `onScreen:` 会先匹配到注释
       里的文字，判据就变成"注释里有没有 true"这种自证循环。
       （第一版就踩了这个坑：判据转红，转红原因却是指向注释。）
     * ★★ 还必须**锚定 `const state =`** ——
       函数签名里有一处 `): { onScreen: boolean; visible: boolean; ... }`，
       那是**返回类型标注**、不是赋值。直接 `match(/onScreen:/)` 会先命中它，
       拿到 `"boolean; visible: boolean; dispose: () => void"`（第一版又踩了）。
     *⇒ 三条一起：剥注释 + 锚定 const state +只取第一个逗号前的内容。 */
    const fn = RLCORE.slice(RLCORE.indexOf('export function createActivityGate'))
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(fn, '没读到 createActivityGate').toContain('const state = {');
    const stateLine = fn.slice(fn.indexOf('const state = {'));
    const init = stateLine.match(/onScreen:\s*([^,}]+)/);
    expect(init, '没读到 onScreen 的初值赋值').toBeTruthy();
    /*★★ 判据必须区分「选项被引用」与「默认值是什么」——
     * 写成 `toMatch(/true|initialOnScreen/)` 是个陷阱：变异把默认值改成
     * `opts.initialOnScreen ?? false` 后，这个字符串**仍然含 initialOnScreen**
     * ⇒ 照样通过 ⇒ 契约抓不住本轮的真凶（变异实测：0 failed）。
     * ⇒ 改为：把整个初值表达式取出，逐个**否定**掉已知错误形态。
     *   允许的形态只有一个：`opts.initialOnScreen ?? true` / `true`。
     *   `?? false`、`!1`、`: false` 一律转红。 */
    const expr = init![1].trim();
    expect(expr, `onScreen 初值表达式是「${expr}」，含 false/!1 —— `
      + '初值 false 时「IO 不回调」= 永久停帧，装置整个不工作，'
      + '且只有强制重排（开 F12）才能恢复')
      .not.toMatch(/false|!1|!0\s*$/);
    /* 兜底：仍然要求它确实引用了 true 或选项（避免把表达式删掉也能过） */
    expect(expr, 'onScreen 初值必须显式给 true（或经 initialOnScreen 选项）')
      .toMatch(/true|initialOnScreen/);
    /* 默认值也必须是 true：`?? true` 而不是 `?? false` */
    expect(fn, 'initialOnScreen 的默认值必须是 true（?? true）').toMatch(
      /initialOnScreen\s*\?\?\s*true/,
    );
  });

  it('★ startLoop 的调用方判onScreen 时，不得让「未初始化」等价于停帧', () => {
    /* 反向核对：装置侧必须显式传 initialOnScreen 或依赖默认 true。
       若将来有人把默认改回 false，这条会先于上面那条报警。 */
    const INK = readFileSync(join(ROOT, 'src/scripts/inkdrop.ts'), 'utf8');
    expect(INK, '墨滴必须显式传 initialOnScreen: true').toMatch(
      /createActivityGate\(\s*cv\s*,\s*\{[^}]*initialOnScreen:\s*true/,
    );
  });

  it('★ 产物里 onScreen 的初值也是 true（构建没把它优化回 false）', () => {
    if (!hasDist) return;
    const files = readdirSync(join(DIST, '_astro')).filter((x) => x.endsWith('.js'));
    /* ★ 产物形态实测（rl-core.B3WVrOde.js）：
     *     {onScreen: t.initialOnScreen ?? !0, visible: ...}
     *   `true` 被压缩成 `!0`（`false` 则是 `!1`）。
     *   ⚠ 所以判据要同时吃两种形态：
     *     ① `onScreen: !0`（直接给字面量）
     *     ② `onScreen: <任意>.initialOnScreen ?? !0`（走选项，合并器可能这么编）
     *   只查①会漏掉②，变异"把默认改回 false"恰好编成① —— 那就漏判了。
     *   ⇒ 分开数：①里出现 `!1` 就转红；②里出现 `?? !1` 也转红。 */
    let found = 0;
    for (const f of files) {
      const js = readFileSync(join(DIST, '_astro', f), 'utf8');
      /* ⚠ minifier 的true/false 记法是`!0` = !false = **true**、`!1` = !true = false。
       *   所以"正确"对应数字 **0**，不是 1。（第一版这里写反了，判据自己转红。）*/
      for (const m of js.matchAll(/onScreen:\s*!([01])\b/g)) {
        found++;
        expect(m[1], `产物 ${f} 里 onScreen 初值被编译成了 !${m[1]}`
          + `${m[1] === '0' ? '（= true，正确）' : '（= false！）'}`
          + '。初值 false 会让 IO 不回调的视口永久停帧').toBe('0');
      }
      for (const m of js.matchAll(/initialOnScreen\s*\?\?\s*!([01])\b/g)) {
        found++;
        expect(m[1], `产物 ${f} 里 initialOnScreen 的默认值被编译成了 !${m[1]}`
          + `${m[1] === '0' ? '（= true，正确）' : '（= false！）'}`
          + '。调用方不传该选项时装置会永久停帧').toBe('0');
      }
    }
    expect(found, '产物里一条 onScreen 初值都没抓到 —— 契约与产物脱节了').toBeGreaterThan(0);
  });
});
