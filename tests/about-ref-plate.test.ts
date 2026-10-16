import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = readFileSync('src/pages/about.astro', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const component = readFileSync('src/components/PleatedInfinity.astro', 'utf8');
const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const dist = join(process.cwd(), 'dist');
const hasDist = existsSync(join(dist, 'about/index.html'));

/** 从 tokens.css 取一个 `--pleat-*` 的数值（0.3 / .3 都认） */
const pleat = (name: string): number =>
  Number(TOKENS.match(new RegExp(`--${name}:\\s*([\\d.]+)`))?.[1] ?? NaN);

describe('关于页 · 纸白与交互百褶环', () => {
  it('只挂新环，移除月相并关闭通用底纹，纸白不依赖局部盖板', () => {
    expect(src).toContain('<Fragment slot="plate"><PleatedInfinity /></Fragment>');
    expect(src).not.toMatch(/moon-main|ref-plate|PLATE_SRCS/);
    expect(src).toMatch(/:global\(body\.about-plate\)\s*\{\s*background:\s*var\(--paper\)/);
    expect(src).toMatch(/:global\(body\.about-plate \.page-inf\)\s*\{\s*display:\s*none/);
    expect(src).not.toMatch(/\.prose::before|\.fig-block::before|\.page-paper|\.ref-paper/);
  });
  it('底纹固定视口、不拦截正文操作、静态图片走本地响应式管线', () => {
    expect(component).toMatch(/position:\s*fixed/);
    expect(component).toMatch(/pointer-events:\s*none/);
    expect(component).toMatch(/aria-hidden="true"/);
    expect(component).toMatch(/<Image[^>]*widths=\{[^>]*sizes=/);
    expect(component).not.toMatch(/cursor:\s*(pointer|grab)/);
  });
  it('后备图有可见薄片和透明背景，体积适合作为底纹', async () => {
    const path = 'src/assets/about/plates/pleated-infinity.webp';
    const sharp = (await import('sharp')).default;
    const image = sharp(path);
    const meta = await image.metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBeGreaterThanOrEqual(1200);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    let visible = 0, transparent = 0;
    for (let n = 3; n < data.length; n += info.channels) {
      if (data[n] > 200) visible++;
      if (data[n] === 0) transparent++;
    }
    expect(visible).toBeGreaterThan(20000);
    expect(transparent).toBeGreaterThan(20000);
    expect(statSync(path).size).toBeLessThan(200 * 1024);
  });

  it('★★ 浓淡只由 --pleat-opacity 决定，且波纹永远不弱于底纹', () => {
    /* 站主 2026-10-15 要把底纹从 0.3 提到满档（"到参考图那个浓度"）。
       底纹一旦是 1.0，alpha 就没有上升空间了，`--pleat-wave-opacity` 也跟着到顶 ——
       此时如果有人把它**调回比底纹低**，波纹就会从"点击时更明显"变成"更淡"，
       那是一条**只有交互才看得见**的回归（截图看不出来、断言也常常漏）。
       ⇒ 卡住"波纹 ≥ 底纹"这个关系。★ 但这条**只管关系不管深浅**，深浅由下一条守。 */
    const base = pleat('pleat-opacity');
    const wave = pleat('pleat-wave-opacity');
    expect(Number.isFinite(base), 'tokens.css 里读不到 --pleat-opacity').toBe(true);
    expect(Number.isFinite(wave), 'tokens.css 里读不到 --pleat-wave-opacity').toBe(true);
    expect(wave, `波纹不透明度 ${wave} 弱于底纹 ${base} ⇒ 点击时反而变淡`).toBeGreaterThanOrEqual(base);
    expect(base, `--pleat-opacity=${base} 不是 0..1 之间的数`).toBeLessThanOrEqual(1);
    expect(wave, '--pleat-wave-opacity 越界').toBeLessThanOrEqual(1);
  });

  it('★★★ 底纹的**渲染浓度**必须有下限（这一条才是防"退回太淡"的那条）', async () => {
    /* ★★★ 为什么不能只断言 `--pleat-opacity` 这个数：
       第一版门闩只钉了"波纹 ≥ 底纹"与取值范围，变异把 `--pleat-opacity` 从 1 改回 0.3
       时它**照样全绿** —— 而 0.3 正是 2026-10-15 这轮要修的那个状态。
       ⇒ 钉住**渲染色**（AGENTS §5「α 不是可移植的量，渲染浓度才是」）：
         把后备图按 token 合成到纸白 #fafaf7 上，量最深的那道褶比纸白低几级。

       读数对照（本站纸白亮度 249.7）：
         alpha 0.30 → 最深 45 级   ← 这一轮之前的值，太淡
         alpha 0.60 → 最深 91 级
         alpha 0.75 → 最深 113 级  ← 最后一个正文仍过 WCAG AA 的档
         alpha 1.00 → 最深 151 级  ← 站主要的就是这一档

       下限取 100：站主说「再到参考图那个浓度」，低于这一档就又回到"线上太淡"；
       往上调仍然自由（要更浓就改 token，断言不拦）。 */
    const sharp = (await import('sharp')).default;
    const alpha = pleat('pleat-opacity');
    expect(Number.isFinite(alpha), '读不到 --pleat-opacity').toBe(true);

    const { data, info } = await sharp('src/assets/about/plates/pleated-infinity.webp')
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const PAPER = [250, 250, 247];
    const paperLum = 0.299 * PAPER[0] + 0.587 * PAPER[1] + 0.114 * PAPER[2];
    let deepest = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const sa = (data[i * info.channels + 3] / 255) * alpha;
      if (sa <= 0.02) continue;
      const [r, g, b] = [0, 1, 2].map((k) =>
        Math.round(data[i * info.channels + k] * sa + PAPER[k] * (1 - sa)));
      const drop = paperLum - (0.299 * r + 0.587 * g + 0.114 * b);
      if (drop > deepest) deepest = drop;
    }
    expect(
      deepest,
      `--pleat-opacity=${alpha} 下最深的一道褶只比纸白低 ${deepest.toFixed(0)} 级`
      + ' ⇒ 已经退回"线上太淡"那个状态（站主 2026-10-15 报的就是它）',
    ).toBeGreaterThanOrEqual(100);
  });

  it('★★ canvas 与静态后备图共用同一个浓淡来源（不许各调各的）', () => {
    /* 这轮踩过：一度怀疑"本机走兜底图、线上走 canvas，所以深浅不同"。
       实测两边的**着色公式逐字相同**（renderer.ts:36 ↔ gen-pleated-fallback.mjs:20），
       唯一的浓淡来源就是 `--pleat-opacity` 一个 ⇒ 结构上不可能分裂。
       这条把"兜底图用 CSS opacity、canvas 用 uniform、两者都读同一个 token"
       三件事钉住，免得哪天有人在其中一侧又加一个独立的浓淡旋钮。 */
    expect(component, '兜底图没走 --pleat-opacity').toMatch(
      /\.pleated-infinity :global\(img\)\s*\{\s*opacity:\s*var\(--pleat-opacity\)/,
    );
    const script = readFileSync('src/scripts/pleated-infinity.ts', 'utf8');
    expect(script, 'canvas 侧没读 --pleat-opacity').toMatch(
      /opacity:\s*parseFloat\(styles\.getPropertyValue\('--pleat-opacity'\)\)/,
    );
    const renderer = readFileSync('src/scripts/pleated-renderer.ts', 'utf8');
    expect(renderer, '着色器没有把 uOpacity 接到片元 alpha 上').toMatch(
      /gl_FragColor\s*=\s*vec4\(color,\s*mix\(uOpacity,\s*uWaveOpacity,\s*vWave\)\)/,
    );
    const gen = readFileSync('scripts/gen-pleated-fallback.mjs', 'utf8');
    /* 后备图的**几何**必须复用同一份核心，否则兜底与动态会画成两个形状 */
    expect(gen, '后备图生成器没有复用 pleated-core').toMatch(/pleated-core/);
    expect(gen, '后备图生成器没有复用同一个镜头投影').toMatch(/projectPleatPoint/);
  });
});

describe.skipIf(!hasDist)('关于页 · 构建结果', () => {
  const html = hasDist ? readFileSync(join(dist, 'about/index.html'), 'utf8') : '';
  const cssFile = hasDist && readdirSync(join(dist, '_astro')).find(f => /^about\..*\.css$/.test(f));
  const css = cssFile ? readFileSync(join(dist, '_astro', cssFile), 'utf8') : '';
  it('新环在 shell 之外，页面过渡不改变 fixed 包含块', () => {
    const plate = html.indexOf('data-pleated-infinity');
    expect(plate).toBeGreaterThan(-1);
    expect(plate).toBeLessThan(html.indexOf('class="shell"'));
    expect(html.match(/data-pleated-infinity/g)).toHaveLength(1);
    expect(html).not.toMatch(/moon-main|class="ref-plate"/);
    expect(html).toMatch(/<img(?=[^>]*class="pleat-fallback")(?=[^>]*srcset=)[^>]*>/);
  });
  it('产物保持纸白且关闭通用底纹', () => {
    expect(html).toMatch(/<body[^>]*class="[^\"]*\babout-plate\b/);
    expect(css).toMatch(/body\.about-plate\s*\{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/body\.about-plate\s+\.page-inf\s*\{[^}]*display:\s*none/);
  });
  it('页头跨组件 grid 规则仍能匹配真实 h1', () => {
    const rules = css.match(/\.pagehead\s*>\s*h1[^{}]*\{[^{}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const selector = rule.split(',').find(s => /\.pagehead\s*>\s*h1/.test(s))!;
      expect(selector).not.toMatch(/data-astro-cid/);
    }
  });
});
