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
    /* ★ 波纹的**上界是相对的**，不是绝对值。
       ★ 第一版写的是 `wave <= 0.8`（绝对值）—— 那个数是从"底纹 0.75 时正文 4.97:1"
         推出来的，换了底纹档位它立刻变成死锁：底纹 0.89 ⇒ wave 既要 ≥ 0.89 又要 ≤ 0.8，
         **恒红**（门闩把自己锁死了，而它自己不会发现）。
         ⇒ 真正要守的是**"波纹不得比底纹深太多"**这个关系：
           波纹是**点击时**才出现的，深一档等于"点一下把整片刷深一次"，
           而读者在那一刻没有挑浓淡的机会。实测（底纹 0.89 一档）：
             wave = base     → 正文 3.72:1（与静止时相同）
             wave = base+0.05 → 正文 3.58:1
             wave = 1.0       → 正文 2.91:1
           ⇒ 上界取「比底纹深 0.05」这一个台阶；反馈仍由色相 + 疏密振动承担。 */
    expect(wave - base,
      `波纹比底纹深 ${(wave - base).toFixed(2)}（${wave} vs ${base}）`
      + ' ⇒ 点击瞬间会把整片刷深一档，而那是没有挑浓淡机会的一瞬').toBeLessThanOrEqual(0.05);
  });

  it('★★★ 底纹的**渲染浓度**必须有下限（这一条才是防"退回太淡"的那条）', async () => {
    /* ★★★ 为什么不能只断言 `--pleat-opacity` 这个数：
       第一版门闩只钉了"波纹 ≥ 底纹"与取值范围，变异把 `--pleat-opacity` 从 1 改回 0.3
       时它**照样全绿** —— 而 0.3 正是 2026-10-15 这轮要修的那个状态。
       ⇒ 钉住**渲染色**（AGENTS §5「α 不是可移植的量，渲染浓度才是」）：
         把后备图按 token 合成到纸白 #fafaf7 上，量最深的那道褶比纸白低几级。

       ⚠⚠ 刻度：**WCAG 相对亮度**，不是 0.299/0.587/0.114 线性灰度。
       这一轮两套刻度混用过 —— 同一个像素在两套刻度下差 60 级，报出去的数字
       自相矛盾（"比 α 的理论上限还深"）。⇒ 全站统一到 WCAG，
       它也是无障碍那条线真正用的刻度。

       读数（本站纸白 #fafaf7；量的是**兜底图**，canvas 比它再深约 11%，见下一条）：
         alpha 0.30 → 最深  63 级   ← 太淡，站主报过的那个状态
         alpha 0.60 → 最深 127 级
         alpha 0.75 → 最深 159 级   ← 最后一个正文仍过 WCAG AA 的档
         alpha 0.89 → 最深 188 级   ← 定稿（站主要的是预览那个感觉）

       下限取 120：站主 2026-10-16 看过对比度之后定的档是 0.89（最深 188 级），
       留一档微调余地；低于 120（≈ α 0.57）就又回到"线上太淡"。
       ★ 这条下界**不是** 0.89 本身 —— 钉死具体数值的话，将来有人合理地微调半档
         就会假红（同 AGENTS §5「断言绑死产物形态」）。它守的是"别退回看不见"。
       ⚠ 反方向**不设上界**：0.89 这一档正文压在最深褶上是 3.72:1（低于 AA 4.5），
         那是站主看过数字之后明确要的取舍、不是疏忽。要退回可读性改 token 即可，
         断言不拦（免得把"站主的决定"变成"每改一次就得改门闩"）。 */
    const sharp = (await import('sharp')).default;
    const alpha = pleat('pleat-opacity');
    expect(Number.isFinite(alpha), '读不到 --pleat-opacity').toBe(true);

    const { data, info } = await sharp('src/assets/about/plates/pleated-infinity.webp')
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const PAPER = [250, 250, 247];
    const chan = (r: number, g: number, b: number) => {
      const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const paperLum = chan(...PAPER);
    let deepest = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const sa = (data[i * info.channels + 3] / 255) * alpha;
      if (sa <= 0.02) continue;
      const [r, g, b] = [0, 1, 2].map((k) =>
        Math.round(data[i * info.channels + k] * sa + PAPER[k] * (1 - sa)));
      const drop = paperLum - chan(r, g, b);
      if (drop > deepest) deepest = drop;
    }
    expect(
      deepest * 255,
      `--pleat-opacity=${alpha} 下最深的一道褶只比纸白低 ${(deepest * 255).toFixed(0)} 级`
      + ' ⇒ 已经退回"线上太淡"那个状态（站主 2026-10-15 报的就是它）',
    ).toBeGreaterThanOrEqual(120);
  });

  it('★★★ 薄片在**屏上**必须够细（这条才是防"读起来像锯齿"的那条）', () => {
    /* ★★★ 为什么浓淡的门闩拦不住这个问题：
       2026-10-16 这一轮，浓淡调了三个来回（0.3 → 1 → 0.75 → 0.89），
       而站主三次都说"还是没有预览那个感觉"。实测把三个"看着像"的原因排掉之后，
       真因是**显示尺寸**：环在宽屏上是 1400px、在站主给的预览里只有 360px ——
       **同一个旋钮放大 3.9 倍，薄的片就变成宽的楔子**。
       而浓淡与色度两边本来就几乎相同：
         墨区均低 119 级 vs 参考 121 级（差 2%）
         色度     6.8    vs 参考  6.7
       ⇒ 这条断言守的是「每道褶在屏上不超过几像素」，**不是**浓淡。
       ⚠★ 我自己前三轮的判据都栽在同一件事上：**每次比都把两张图归一到同一宽度**，
         归一恰好把尺寸这个变量消掉 ⇒ 于是每次都量出"一样"，
         而每次那个"一样"都不是问题所在。判据设计错了，不是源错了。 */
    const core = readFileSync('src/scripts/pleated-core.ts', 'utf8');
    const count = Number(core.match(/createPleats\(count\s*=\s*(\d+)\)/)?.[1] ?? NaN);
    expect(Number.isFinite(count), '读不到 createPleats 的默认片数').toBe(true);
    /* 桌面上限（px）· 取 min(94vw, Npx, 150vh) 里那个 N */
    const cap = Number(component.match(/width:\s*min\(\s*94vw,\s*(\d+)px/)?.[1] ?? NaN);
    expect(Number.isFinite(cap), '组件里读不到桌面档的 px 上限').toBe(true);
    /* 实测：1400px / 216 片 ⇒ 每片约 6~10px（读作粗锯齿）；620px ⇒ 约 2~4px（细密扇面）。
       4.5px 是"还读作细密"的上界，留一点余量但离 1400px 那档足够远。 */
    const perPleat = cap / count;
    expect(
      perPleat,
      `桌面上限 ${cap}px ÷ ${count} 片 = 每道褶 ${perPleat.toFixed(1)}px 宽`
      + ' ⇒ 读起来是粗的锯齿扇，不是站主要的那张预览里的细密扇面'
      + '（浓淡调多少次都没用：实测浓淡两边只差 2%，差的是尺寸）',
    ).toBeLessThanOrEqual(4.5);
  });

  it('★★ canvas 与静态后备图共用同一个浓淡来源（不许各调各的）', () => {
    /* 这一条把"为什么两侧天生不一样"钉住，免得哪天有人为了"对齐"去动其中一侧。
       实测（两次独立 α，都用 WCAG 刻度；canvas 由 `_probe/_cdp-canvas-ink.py` 抠出）：
         α=0.75  canvas 墨区均低 105 / 最深 177    兜底图  90 / 180
         α=0.89  canvas 墨区均低 119 / 最深 196    兜底图 110 / 199
       ⇒ **均深峰浅**：均低高约 9%，最深反而浅约 2%。
       ⚠⚠ 第一版把它写成"canvas 比兜底图深 11%"—— 那是拿**均低**的差顺手**外推**到最深，
         **方向推反了**（AGENTS §5「把一次观测顺手推广成一句结论」）。
         两个量必须分开报，不能用一个推另一个。
       真因：兜底图是 SVG 光栅化，里面 `normal[2] <= 0` **直接跳过背面**；
       canvas 不开面剔除，背面片元照画，只是着色器里 `if(!gl_FrontFacing)n=-n;`
       把法线翻了、于是按正面着色 ⇒ 背面那一片的浓淡在两侧不一样。
       ⇒ 这条断言守的是**浓淡的来源只有一个**（结构上不可能分裂），
         **不是**"两侧像素相同"—— 那是推出来的（AGENTS §5「写没量过的相同」）。 */
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
    /* 均深峰浅的来源，两侧各钉一条 */
    expect(renderer, 'canvas 侧少了背面法线翻转 ⇒ 会与兜底图分家').toMatch(
      /if\(!gl_FrontFacing\)\s*n\s*=\s*-n;/,
    );
    const gen = readFileSync('scripts/gen-pleated-fallback.mjs', 'utf8');
    expect(gen, '兜底图生成器没有跳过背面 ⇒ 与 canvas 的关系变了').toMatch(
      /if\s*\(normal\[2\]\s*<=\s*0\)\s*continue;/,
    );
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
