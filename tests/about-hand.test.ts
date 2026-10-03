import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 关于页「亲笔签名切片」（HAND SIGN）的几条不可退让的性质。
 *
 * 机制（与显影板、索引卷尺都不同，见 docs/rhinelab-spec.md §6.26）：
 *   · 签名是站主手迹**原件的照片**（已抠白底转墨绿），位图没有路径
 *     ⇒ 落笔是**横向揭幕**（clip-path inset 100%→0），不是逐笔描红。
 *   · 匀速推进，吃**真实 dt**；★ **不用弹簧**（笔迹要匀速，过冲会像"甩笔"）。
 *   · 首屏已看得见的切片**不揭幕**、直接最终态（否则读者第一眼是空深底板）。
 *
 * 与前两台同源的既有契约：
 *   ① 无 JS 可用 —— 图服务端渲染完整，只是"不揭幕"，不是"看不见"。
 *   ② 零随机 —— 位置是 t 的确定函数，无 Math.random。
 *   ③ 帧率无关 —— 吃真实 dt，禁「每帧固定系数」。
 *   ④ reduced-motion 降级 —— 落最终态，不跑 rAF。
 *   ⑤ 手机 ≤767px 留**极简版**（口径 #9），不是不渲染。
 *   ⑥ 素材与文案都在内容层，不写死在 src/。
 */
const SCRIPT = readFileSync('src/scripts/hand-sign.ts', 'utf8');
const CODE = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
const ASTRO = readFileSync('src/pages/about.astro', 'utf8');
const ACSS = ASTRO.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const MD = readFileSync('content/pages/about.md', 'utf8');

const DIST = 'dist';
const hasDist = existsSync(DIST);
const ABOUT = hasDist ? readFileSync(join(DIST, 'about', 'index.html'), 'utf8') : '';

describe('关于页 · 亲笔签名切片：无 JS 可用与素材契约', () => {
  it('无 JS 可用：签名图与切片在产物里服务端渲染完整（不是 hidden）', () => {
    expect(ABOUT, '先 npm run build').toContain('data-sign-card');
    expect(ABOUT).toContain('data-sign-img');
    // ★ 关键是**不能**带 hidden：降级目标只有一个「看得见图」
    const card = ABOUT.match(/<figure[^>]*data-sign-card[^>]*>/)?.[0] ?? '';
    expect(card, '签名切片被 hidden 了 —— 无 JS 时就看不见了').not.toMatch(/\bhidden\b/);
    // 图有alt（全局硬约束：图片 alt 非空）
    const img = ABOUT.match(/<img[^>]*data-sign-img[^>]*>/)?.[0]
      ?? ABOUT.match(/<img[^>]*srcset[^>]*>/)?.[0] ?? '';
    expect(img, '找不到签名 img').toMatch(/alt="[^"]+"/);
  });

  it('签名素材在 src/assets/about/（参与构建期优化），且由内容层 frontmatter 引用', () => {
    expect(existsSync('src/assets/about/sign.png'), '签名图没进仓').toBe(true);
    // 内容层字段：文字与资源引用都不该写死在 src/
    expect(MD, 'frontmatter 缺 signature 字段').toMatch(/^signature:\s*\S+/m);
    expect(MD, 'frontmatter 缺 signatureNote 字段').toMatch(/^signatureNote:\s*\S+/m);
    // 页面从 frontmatter 取，不写死文件名
    expect(ASTRO).toMatch(/signature\s*\?\s*assets\[/);
    expect(CODE, '签名图名不该硬编码在脚本里').not.toMatch(/sign\.png/);
  });

  it('切片编号存在且按顺序（FIG.01 HAND / 02 / 03 / 04）', () => {
    expect(ABOUT).toContain('FIG.01');
    expect(ABOUT).toContain('HAND');
    // 三个内容区块各有一个编号
    expect(ABOUT.match(/FIG\.0[234]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('正文排版未被动（口径 #3：正文排版不动）', () => {
    // .prose 仍在、内容仍在它里面 —— 版式升级只加在页头/列表项/卡片
    expect(ASTRO).toContain('.prose');
    expect(ABOUT).toMatch(/class="prose"/);
    // 本站没有给 .prose 加任何自定义排版规则（那才是"动了正文排版"）
    const proseRule = ACSS.match(/\.prose[^{]*\{[^}]*\}/g) ?? [];
    for (const r of proseRule) {
      expect(r, `给 .prose 加了排版规则：${r}`).not.toMatch(/font-size|line-height|letter-spacing|max-width/);
    }
  });
});

describe('关于页 · 亲笔签名切片：落笔机制', () => {
  it('横向揭幕：用 clip-path 的 inset，不用逐笔描红', () => {
    expect(CODE).toMatch(/clipPath\s*=\s*`inset\(/);
    // ★ 位图没有路径 —— 若出现 stroke-dashoffset 就说明改成矢量了，那是另一条路
    expect(CODE, '位图不该用 stroke-dashoffset（那是矢量路径的手法）').not.toContain('stroke-dashoffset');
  });

  it('匀速吃真实 dt，★ 不用弹簧（笔迹要匀速，过冲像甩笔）', () => {
    // ★ 注意别断言 `step(dt: number)` —— 那是把函数**签名**写死了，
    //   改写成箭头函数或加类型标注就假红。断言实现里的 dt 用法。
    expect(CODE).toMatch(/const step = \(dt/);
    // 速度按 dt / 1000 换算成秒 —— 若是「每帧 -= 固定量」则帧率一变速度就变
    expect(CODE).toMatch(/SIGN_SPEED\s*\*\s*dt\s*\)\s*\/\s*1000/);
    // 刻意不引 createSpring
    expect(CODE, '落笔不该用弹簧').not.toMatch(/createSpring/);
  });

  it('首屏已可见的切片不揭幕，直接最终态（否则第一眼是空深底板）', () => {
    // 判据：切片此刻与视口有实际重叠 ⇒ 直接给最终态
    expect(CODE).toMatch(/getBoundingClientRect/);
    expect(CODE).toMatch(/rect\.top\s*<\s*window\.innerHeight/);
    expect(CODE).toMatch(/inFirstScreen/);
  });

  it('零随机：揭幕进度是 dt 的确定函数，无 Math.random', () => {
    expect(CODE).not.toContain('Math.random');
  });

  it('复用rl-core：帧循环 / 视口停帧 / 降级开关', () => {
    expect(CODE).toMatch(/startLoop/);
    expect(CODE).toMatch(/createActivityGate/);
    expect(CODE).toMatch(/shouldAnimate/);
    expect(CODE).toMatch(/prefersReducedMotion/);
  });

  it('视口外/切标签停帧：onTick 不重置进度（滚回去不该重写一遍）', () => {
    // gate 的 onTick 必须是空实现 —— 重置会让签名反复重播
    expect(CODE).toMatch(/onTick:\s*\(\)\s*=>\s*\{\s*\}/);
    expect(CODE).toMatch(/gate\.onScreen\s*&&\s*gate\.visible/);
  });
});

describe('关于页 · 亲笔签名切片：降级与配色', () => {
  it('reduced-motion 降级：直接落最终态，不跑 rAF', () => {
    expect(CODE).toMatch(/if\s*\(!animate\)/);
    // 降级分支里把 cover 归零并落一次 paint
    const branch = CODE.match(/if\s*\(!animate\)\s*\{[\s\S]{0,160}?\}/)?.[0] ?? '';
    expect(branch, '降级分支里没有把进度归零').toMatch(/cover\s*=\s*0/);
    expect(branch, '降级分支里没有 paint()').toMatch(/paint\(\)/);
  });

  it('手机 ≤767px 留极简版（口径 #9），不是不渲染', () => {
    const m = ACSS.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.sign-plate\s*\{[\s\S]*?\}/);
    expect(m, '缺 ≤767px 的签名切片规则').toBeTruthy();
    // 极简= 缩小边距，不是 display:none
    expect(ACSS.match(/@media\s*\(max-width:\s*767px\)[\s\S]*?\.sign-card\s*\{[^}]*display:\s*none/))
      .toBeFalsy();
  });

  it('深底配色只用实测达标的档（accent-ink 在深底只有 2.97）', () => {
    /* ★ 判据只抓**深底切片自己的规则**（选择器以 .sign- 开头且**只有它自己**）。
       踩过的坑：一开始用 `/\.sign[\w-]*[^{}]*\{/` 匹配，结果把**共享的编号规则组**
       （`.fig-no, .sign-fig, .sign-kind, .fig-idx { color: var(--accent-ink) }`）
       一起抓了—— 那是**纸底**上的编号，accent-ink 在纸上 6.18:1 完全正当。
       ⇒ 必须要求选择器里**只有 .sign-***，且不能带逗号（带逗号就是共享组）。
       （同一条坑在 tests/tokens.test.ts 里也踩了一次，两处都改了判据。）

       ★ 另一个反向的坑：这条断言**一度写成只许 dusk-6 / accent-bright**，
       结果把 `.sign-foot` 的 --dusk-5 判成违规 —— 但那是有意的设计：
       4.26:1 差 0.24 不到 4.5，**只做 10px 标签**，已在 assert-tokens 以图形下限登记。
       判据过严与过宽一样有害：前者挡住既定设计，后者放过真问题。 */
    const deepBlocks = [...ACSS.matchAll(/(^|[},])\s*(\.sign-[a-z-]+)\s*\{([^{}]*)\}/g)]
      .map((m) => ({ sel: m[2], body: m[3] }));
    expect(deepBlocks.length, '没找到签名切片的样式块').toBeGreaterThan(0);
    for (const { sel, body } of deepBlocks) {
      expect(body, `${sel} 用了 --accent-ink（深底上仅 2.97）`).not.toMatch(/color:\s*var\(--accent-ink\)/);
      expect(body, `${sel} 用了 --muted（深底上仅 2.77）`).not.toMatch(/color:\s*var\(--muted\)/);
    }
    // 底色用 dusk-2；深底上的强调色用 accent-bright（绿，站主 2026-10-03 拍板）
    expect(ACSS).toMatch(/background:\s*var\(--dusk-2\)/);
    expect(ACSS).toMatch(/color:\s*var\(--accent-bright\)/);
    // dusk-5 若出现，只许配 10px 级字号（它是 4.26:1，承载不了正文）
    const foot = ACSS.match(/\.sign-foot\s*\{([^{}]*)\}/)?.[1] ?? '';
    if (/color:\s*var\(--dusk-5\)/.test(foot)) {
      expect(foot.match(/font-size:\s*var\((--fs-[\w-]+)\)/)?.[1]).toBe('--fs-xs');
    }
  });

  it('切片宽度用 min() 收窄（380px 写死会在 390 视口下溢出）', () => {
    const w = ACSS.match(/\.sign-card[^{]*\{[^}]*width:\s*([^;]+);/)?.[1] ?? '';
    expect(w, '没读到 .sign-card 的 width').toBeTruthy();
    expect(w, `切片宽度必须用 min() 收窄，实际是：${w}`).toContain('min(');
    expect(w).toContain('100%');
  });

  it('颜色全部来自 token，组件里不写 rgba()', () => {
    const styles = ACSS.match(/\.sign[\w-]*[^{}]*\{[^{}]*\}/g) ?? [];
    for (const s of styles) {
      expect(s, `签名切片里出现了 rgba()：${s.slice(0, 60)}`).not.toContain('rgba(');
    }
  });
});

describe('关于页 · 亲笔签名切片：零第三方与零新依赖', () => {
  it('本页不引任何外部资源（零第三方请求）', () => {
    /* ★ 判据是「不引外部**资源**」，不是「不许出现站外**链接**」——
       社交账号本来就是站外链接（站主的 GitHub / 邮箱 / 抖音），
       `tests/build-output.test.ts` 的全局零第三方断言查的是资源加载（script/link/img 的 src/href 指向别人家）。
       这里做同一件事的**页面级**复查：新加的签名切片别偷偷引了 CDN 字体或图床。 */
    // ① 不许有指向第三方域名的资源引用
    for (const m of ABOUT.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*>/gi)) {
      const tag = m[0];
      const url = tag.match(/(?:src|href)="([^"]+)"/i)?.[1] ?? '';
      if (!url || url.startsWith('/') || url.startsWith('#')) continue; // 站内资源
      expect(url, `引用了外部资源：${tag.slice(0, 80)}`).toMatch(/^(https?:)?\/\/(www\.)?northcedar\.top/);
    }
    // ② 常见的第三方 CDN / 图床 / 字体关键字一律不许出现
    for (const kw of ['cdn.jsdelivr', 'unpkg.com', 'googleapis', 'gstatic', 'imgur', 'sm.ms', 'raw.githubusercontent', 'fonts.googleapis']) {
      expect(ABOUT, `出现了第三方关键字 ${kw}`).not.toContain(kw);
    }
  });

  it('没有新增运行时依赖', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@astrojs/rss', '@astrojs/sitemap', 'astro']);
  });

  it('签名图的 alt 是人话，不是「图片」', () => {
    const alt = ABOUT.match(/data-sign-img[^>]*alt="([^"]*)"/)?.[1]
      ?? ABOUT.match(/alt="([^"]*)"[^>]*data-sign-img/)?.[1] ?? '';
    expect(alt, '找不到签名图的 alt').toBeTruthy();
    expect(alt).not.toBe('图片');
  });
});
