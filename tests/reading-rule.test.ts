import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_DEPS_ALLOWED } from './_deps';

/* 文章页「阅读尺」（READING RULE）+ 工程方格底纹 + 右栏目录（2026-10-03）的契约。
 *
 * 站主拍板六条（先出实验台 dist/_plate-lab.html，看过真渲染才定的）：
 *   ① 底纹母题 = 9 个候选里的 **#7 方格 + 页边刻度轨**；② 强度 8%；③ **铺满整页**；
 *   ④ 映射 **even**（读头必压齿）；⑤ 移动端阅读尺**完全不渲染**；⑥ 目录 → **右侧 sticky 栏**。
 *
 * 这里守的是「不可退让的性质」，不是「上一版的实现形态」：
 *   ① 无 JS 可用 —— 装置默认 hidden + aria-hidden，正文服务端渲染完整。
 *   ② 装置必须挂 `.shell` **之外** —— `.shell` 在页面过渡里会被 transform，
 *      而被 transform 的祖先会成为 `position: fixed` 的包含块（关于页实测跳 91px）。
 *   ③ even 映射**不留 linear 开关** —— 站主已拍板，两套路径只会各自腐化。
 *   ④ 零随机、无时间项 —— 读头位置是「滚动量 + 节节点」的纯函数。
 *   ⑤ 与卷尺**机制镜像** —— 不引弹簧（不 import createSpring）。
 *   ⑥ 四态降级 —— reduced-motion / 无 JS / ≤767px 不渲染 / 视口外·切标签停帧。
 *   ⑦ 正文排版一行未改（红线）—— `.prose` 在本轮只被分配栅格列。
 *   ⑧ 零新增运行时依赖（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

const SRC = readFileSync(join(ROOT, 'src/scripts/reading-rule.ts'), 'utf8');
/* 剥注释**只用于负向断言**（如「不含 Math.random」）。
   ⚠ 源文件的说明注释里出现过「开注释符」的**字面文本**，朴素正则会一路吃到下一个定界符、
   把中间的代码吞掉 ⇒ 正向断言一律用未剥注释的原文（同 about-ref-plate.test.ts 的教训）。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');

const ASTRO = readFileSync(join(ROOT, 'src/layouts/Post.astro'), 'utf8');
/* 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。
   顺序有讲究：先剥 JSX 那种 —— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。
   ⚠ 这条注释本身不许出现「开注释符」的字面文本：第一版就是那么写的，直接解析失败
   （同一个坑在 about-ref-plate.test.ts 的头部也记着）。 */
const ACSS = ASTRO.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const TOKENS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const ASSERT = readFileSync(join(ROOT, 'scripts/assert-tokens.mjs'), 'utf8');

/* ---------- dist 产物（verify = build + test，所以存在；不在时给出人话）---------- */
function walk(dir: string, filter: (n: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, filter));
    else if (filter(e)) out.push(p);
  }
  return out;
}
const DIST_CSS = existsSync(DIST)
  ? walk(DIST, (n) => n.endsWith('.css'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';

type PostInfo = { slug: string; draft: boolean };
/** 从内容层推导草稿/已发布，**不硬编码**（同 build-output.test.ts 的手法）。 */
function readPosts(): PostInfo[] {
  const dir = join(ROOT, 'content/posts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const file = join(dir, d.name, 'index.md');
      if (!existsSync(file)) return [];
      const text = readFileSync(file, 'utf8');
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!fm) return [];
      return [{ slug: d.name, draft: /^draft:\s*true\s*$/m.test(fm[1]) }];
    });
}
/** 每篇已发布的文章页产物（{ slug, html }）。断言**逐页**跑，防止只有一篇对齐。 */
const POST_PAGES = readPosts()
  .filter((p) => !p.draft)
  .map((p) => ({ slug: p.slug, file: join(DIST, 'posts', p.slug, 'index.html') }))
  .filter((p) => existsSync(p.file))
  .map((p) => ({ slug: p.slug, html: readFileSync(p.file, 'utf8') }));

describe('文章页阅读尺 · 装置契约', () => {
  it('无 JS 可用：装置默认 hidden + aria-hidden，正文服务端渲染完整', () => {
    expect(POST_PAGES.length, '先 npm run build（dist 下没有已发布文章页）').toBeGreaterThan(0);
    for (const { slug, html } of POST_PAGES) {
      expect(html, slug).toMatch(/<aside class="rule"[^>]*\bhidden\b/);
      expect(html, slug).toMatch(/<aside class="rule"[^>]*aria-hidden="true"/);
      // 正文本体不受装置影响：.prose 与它的内容都在服务端渲染出来了
      const at = html.indexOf('class="prose"');
      expect(at, slug).toBeGreaterThan(-1);
      const body = html.slice(at);
      expect(body, `${slug}: .prose 里没有服务端渲染的段落`).toContain('<p>');
      expect(body, slug).toContain('</p>');
    }
  });

  it('★ 装置与底纹都挂在 .shell 之外（页面过渡的 transform 会成为 fixed 包含块）', () => {
    for (const { slug, html } of POST_PAGES) {
      const iPlate = html.indexOf('class="plate-grid"');
      const iRule = html.indexOf('class="rule"');
      const iMain = html.indexOf('<main');
      const iShell = html.indexOf('<div class="shell"');
      expect(iPlate, slug).toBeGreaterThan(-1);
      expect(iRule, slug).toBeGreaterThan(-1);
      expect(iShell, slug).toBeGreaterThan(-1);
      expect(iPlate, `${slug}: 底纹层必须在 .shell 之外`).toBeLessThan(iShell);
      expect(iRule, `${slug}: 阅读尺必须在 .shell 之外`).toBeLessThan(iShell);
      // 两者都在 <main> 之前 ⇒ 与 Topbar 的 .page-inf 同一层级
      expect(iPlate, slug).toBeLessThan(iMain);
      expect(iRule, slug).toBeLessThan(iMain);
    }
    // 源码侧：确实是走 plate 槽（而不是被塞进普通 slot）
    expect(ASTRO).toMatch(/<Fragment slot="plate">/);
  });

  it('刻度与读数结构齐备（条 / 纸带 / 读头 / 读数 / 型号）', () => {
    // 齿从**正文自己的标题**推导（不是写死的目录），h2 长齿 / h3 短齿
    expect(SRC).toMatch(/querySelectorAll<HTMLElement>\('h2, h3'\)/);
    for (const { slug, html } of POST_PAGES) {
      for (const need of ['data-rule-bar', 'data-rule-tape', 'data-rule-sec', 'data-rule-total', 'data-rule-pct']) {
        expect(html, `${slug} 缺 ${need}`).toContain(need);
      }
      expect(html, slug).toContain('class="readhead"');
      expect(html, slug).toContain('READING RULE');
    }
  });

  it('★ even 映射：节齿等距 + 读头分段线性插值，且**没有** linear 开关', () => {
    // 节齿等距：t = (i+1)/(m+1)
    expect(CODE).toMatch(/\(idx \+ 1\) \/ \(heads\.length \+ 1\)/);
    // 分段线性插值（甚至/反解两条路都要有）
    expect(CODE).toMatch(/a\.t \+ \(b\.t - a\.t\) \* k/);
    expect(CODE).toMatch(/function scrollForT/);
    // 站主已拍板 even ⇒ linear 那条路径必须真的删掉，不留开关
    expect(CODE).not.toMatch(/linear/i);
    expect(CODE).not.toMatch(/mapMode/);
    // 单调性兜底（末屏标题会被钳到同一个 o ⇒ t 可能回退）
    expect(CODE).toMatch(/nodes\[i\]\.t < nodes\[i - 1\]\.t/);
  });

  it('★ 机制镜像：不引弹簧（与归档卷尺的「二阶过冲」相反）', () => {
    expect(SRC).toMatch(/from '\.\/rl-core'/);
    expect(SRC).not.toMatch(/createSpring/);
    expect(SRC).not.toMatch(/startLoop/);
    const imports = [...CODE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.length, '至少要从 rl-core 取降级开关与停帧').toBeGreaterThan(0);
    expect(imports.every((p) => p === './rl-core'), `只许引 rl-core，实际：${imports.join(', ')}`).toBe(true);
  });

  it('零随机：读头位置是「滚动量 + 节节点」的纯函数', () => {
    expect(CODE).not.toMatch(/Math\.random/);
    expect(CODE).not.toMatch(/Date\.now|performance\.now/);
  });

  it('降级①reduced-motion：尺常驻 + 去掉出入过渡', () => {
    expect(SRC).toMatch(/prefersReducedMotion\(\)/);
    expect(SRC).toMatch(/shouldAnimate\(/);
    expect(SRC).toMatch(/is-instant/);
    expect(ACSS).toMatch(/\.rule\.is-instant\s*\{\s*transition:\s*none/);
  });

  it('降级②无 JS：`.rule[hidden]` 显式 display:none（不靠上游兜底）', () => {
    expect(ACSS).toMatch(/\.rule\[hidden\]\s*\{\s*display:\s*none/);
  });

  it('降级③移动端 ≤767px：阅读尺**完全不渲染**（display:none），脚本也不干活', () => {
    expect(ACSS).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.rule\s*\{\s*display:\s*none/);
    expect(DIST_CSS, '产物 CSS 里没有窄屏隐藏规则').toMatch(
      /@media \(max-width:767px\)\{\.rule\[[^\]]+\]\{display:none\}\}/,
    );
    expect(SRC).toMatch(/narrow\.matches/);
    // ★ 底纹层不在降级之列（它是背景不是装置）—— 窄屏隐藏规则里不许出现 .plate-grid
    const narrowBlock = ACSS.slice(ACSS.indexOf('@media (max-width: 767px)'));
    expect(narrowBlock).not.toMatch(/plate-grid/);
  });

  it('降级④停帧：gate 观察的是**正文**，不是 .rule 自己（否则一收回就醒不过来）', () => {
    expect(SRC).toMatch(/createActivityGate\(prose/);
    expect(CODE).toMatch(/if \(!gate\.onScreen\) return;/);
  });

  it('★ 底纹：母题 #7 = 四族方格线 + 左右视口刻度轨，铺满整页（无 mask）', () => {
    const lines = ACSS.match(
      /linear-gradient\(to (?:right|bottom), var\(--deco-plate-(?:fine|coarse)\) 1px, transparent 1px\)/g,
    );
    expect(lines?.length, '方格线应为 4 族（细格 ×2 + 粗格 ×2）').toBe(4);
    // 粗格 = 细格 × 6（配方的一部分）
    expect(ACSS).toMatch(/calc\(var\(--deco-plate-u\) \* 6\) calc\(var\(--deco-plate-u\) \* 6\)/);
    // 刻度轨：左右两条伪元素，小齿 2u / 大齿 10u
    expect(ACSS).toMatch(/\.plate-grid::before,\s*\n?\s*\.plate-grid::after/);
    expect(ACSS).toMatch(/var\(--deco-plate-u\) \* 10/);
    expect(ACSS).toMatch(/\.plate-grid::before\s*\{\s*left:\s*0/);
    expect(ACSS).toMatch(/\.plate-grid::after\s*\{\s*right:\s*0/);
    // ★ 站主拍板「铺满整页」⇒ 不许给底纹加 mask（文字区留白那条已被否掉）
    expect(ACSS).not.toMatch(/mask-image/);
    // 挂法逐条照抄百褶 ∞ / 关于页 ref-plate
    const grid = ACSS.match(/\.plate-grid\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const decl of ['position: fixed', 'inset: 0', 'pointer-events: none', 'z-index: -1']) {
      expect(grid, `底纹挂法缺 ${decl}`).toContain(decl);
    }
  });

  it('★ 底纹强度照抄定稿值（站主选的 8% 档），且只用 8 位 hex 承载 alpha', () => {
    const alpha = (name: string) => {
      const m = TOKENS.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6})([0-9a-f]{2});`, 'i'));
      expect(m, `tokens.css 里没找到带 alpha 的 --${name}`).toBeTruthy();
      return parseInt(m![2], 16);
    };
    // 粗格 + 刻度轨 = 20/255 ≈ 7.8%（站主回答的「8%」档）
    expect(alpha('deco-plate-coarse')).toBe(20);
    // 细格 = 15/255 ≈ 5.9%（实验台强度滑杆 = 1.00 时的原值，照抄不"优化"）
    expect(alpha('deco-plate-fine')).toBe(15);
    // 母题基色必须是站内 accent 绿（#2d7d46），不是另起一个绿
    expect(TOKENS).toMatch(/--deco-plate-fine:\s*#2d7d46/i);
    expect(TOKENS).toMatch(/--deco-plate-coarse:\s*#2d7d46/i);
    expect(TOKENS).toMatch(/--deco-plate-u:\s*8px/);
    // 纯装饰不进对比度断言表（进表的都是承载文字的色）
    expect(ASSERT).not.toMatch(/deco-plate/);
  });

  it('★ 关掉本页的百褶 ∞（两套母题叠着必脏），且权重压得住 Topbar 那条', () => {
    expect(ASTRO).toMatch(/:global\(body\.post-plate \.page-inf\)/);
    // Topbar 写的是 body.chrome-page .page-inf（0,2,1）⇒ 本页必须同为 (0,2,1) 且后加载
    const topbar = readFileSync(join(ROOT, 'src/components/Topbar.astro'), 'utf8');
    expect(topbar, 'Topbar 那条规则改名了？契约要跟着看').toMatch(/body\.chrome-page \.page-inf/);
    expect(DIST_CSS).toMatch(/body\.post-plate \.page-inf\{display:none\}/);
    expect(ASTRO).toMatch(/bodyClass="post-plate"/);
  });

  it('★ 文末让位：给页脚留出尺高（否则 reduced-motion 档尺常驻 ⇒ 页脚统计被**永久**压住）', () => {
    /* 实测（iframe 1440×900，RM 档，滚到文档末尾 5000/5000）：
       尺顶 y=848（= 视口底 − 52）。留位前 `.stats-wrap` = 845.0 ~ 867.8
       ⇒ 有 19.8px 落在尺下，整条「本站已运行…」几乎读不到；
       留位后 `.stats-wrap` = 793.0 ~ 815.8 ⇒ 让开尺顶 32.2px。 */
    expect(ASTRO).toMatch(
      /:global\(body\.post-plate \.foot\)\s*\{\s*padding-bottom:\s*calc\(var\(--sp-6\) \+ 52px\)/,
    );
    // 留位高度必须与尺的实际高度同源：一处改了另一处没改，末尾就会重新露出来
    expect(ACSS).toMatch(/\.rule\s*\{[\s\S]*?height:\s*52px/);
    expect(DIST_CSS).toMatch(
      /body\.post-plate \.foot\{padding-bottom:calc\(var\(--sp-6\)\s*\+\s*52px\)\}/,
    );
    // ★ 必须**两档都留**：不许写成只在 reduce 里 —— 那会造出「只在某一档才有的布局」
    /* ⚠ 这两条是**负向断言**，必须用剥过注释的 ACSS：本文件那段说明注释里就写着
       `@media (prefers-reduced-motion: reduce)` 的字面文本，用原文会把注释自己扫进来
       （第一版就是这么挂的，同 CODE 头部记的那个坑）。 */
    const at = ACSS.indexOf('body.post-plate .foot');
    expect((ACSS.match(/body\.post-plate \.foot/g) ?? []).length, '只该有一处').toBe(1);
    expect(ACSS.slice(Math.max(0, at - 400), at)).not.toContain('@media');
    // 页脚组件自己的定稿值一行未改（只在本页外面补 padding，不进 SiteFooter）
    const footer = readFileSync(join(ROOT, 'src/components/SiteFooter.astro'), 'utf8');
    expect(footer, 'SiteFooter 的定稿间距被改了？').toMatch(/padding:\s*var\(--sp-5\) 0 var\(--sp-6\)/);
    expect(footer).not.toContain('post-plate');
  });
});

describe('文章页右栏目录 · 版式契约', () => {
  it('容纳不下双栏时优先单栏阅读；≥1120px 才排正文与定宽侧栏', () => {
    const mqAt = ACSS.indexOf('@media (min-width: 1120px)');
    const gridAt = ACSS.indexOf('display: grid');
    expect(mqAt, '没找到 1120px 断点').toBeGreaterThan(-1);
    expect(gridAt, 'display:grid 必须在媒体查询之内（窄屏不得排两栏）').toBeGreaterThan(mqAt);
    expect(ACSS).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, var\(--post-rail-width\)\)/);
    expect(ACSS).toContain('max-width: calc(var(--post-measure) + var(--post-rail-width) + var(--post-rail-gap))');
  });

  it('目录栏 sticky 且排在第二列；DOM 顺序仍是目录在前（无 JS/窄屏都可读）', () => {
    expect(ACSS).toMatch(/\.post-rail\s*\{[\s\S]*?position:\s*sticky/);
    expect(ACSS).toMatch(/\.post-rail\s*\{[\s\S]*?grid-column:\s*2/);
    expect(ACSS).toMatch(/\.post-rail\s*\{[\s\S]*?align-self:\s*start/);
    expect(DIST_CSS, '产物里 .post-rail 没有 sticky').toMatch(
      /\.post-rail\[[^\]]+\]\{[^}]*position:sticky/,
    );
    for (const { slug, html } of POST_PAGES) {
      const iRail = html.indexOf('class="post-rail"');
      const iProse = html.indexOf('class="prose"');
      expect(iRail, slug).toBeGreaterThan(-1);
      expect(iRail, `${slug}: 目录仍在正文之前（DOM 顺序不变）`).toBeLessThan(iProse);
    }
  });

  it('目录进右栏要压掉 Toc 那套「通栏横向索引条」的规则（≥1440 四列 / 隐藏标题）', () => {
    // 那边 ≥1440 会 .label{display:none} + ol{columns:4} —— 在 256px 的栏里会散架
    const toc = readFileSync(join(ROOT, 'src/components/Toc.astro'), 'utf8');
    expect(toc, 'Toc 的 1440 规则改名了？契约要跟着看').toMatch(/min-width: 1440px/);
    expect(ACSS).toMatch(/\.post-rail :global\(\.toc \.label\)\s*\{\s*display:\s*block/);
    expect(ACSS).toMatch(/\.post-rail :global\(\.toc ol\)\s*\{\s*columns:\s*auto/);
    // 压得住的实测证据：编译后的选择器权重必须是 (0,3,0) 级别
    expect(DIST_CSS).toMatch(/\.post-rail\[[^\]]+\] \.toc \.label\{display:block\}/);
    expect(DIST_CSS).toMatch(/\.post-rail\[[^\]]+\] \.toc ol\{[^}]*columns:auto(?:;|\})/);
  });

  it('正文保留字体、行高、段落与代码排版，只通过父级分配列宽', () => {
    const block = ACSS.match(/\.post-body > \.prose\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block, '没找到给 .prose 分配列的规则').not.toBe('');
    for (const banned of ['font-size', 'line-height', 'max-width', 'margin', 'padding', 'letter-spacing']) {
      expect(block, `.prose 里不该出现 ${banned}`).not.toContain(banned);
    }
    // 也不许在别处重新定义 .prose 的排版
    expect(ACSS).not.toMatch(/\.prose\s+(?:p|h2|h3|ul|ol|blockquote|code|a)\s*\{/);
  });
});

describe('文章页 · 红线与依赖', () => {
  it('运行时依赖只许住在白名单里（tests/_deps.ts）', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(RUNTIME_DEPS_ALLOWED);
  });

  it('零外部资源：本页新增的样式里不许出现任何外链', () => {
    expect(ACSS).not.toMatch(/https?:\/\//);
    expect(ACSS).not.toMatch(/@import/);
    // 字体自托管：尺上的数字用站内已自托管的 IBM Plex Mono（回退栈里不许出现 CDN）
    expect(ACSS).toMatch(/'IBM Plex Mono', Consolas, 'Courier New', monospace/);
  });
});
