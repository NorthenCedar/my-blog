/**
 * 亮暗过渡的**连续性**契约（站主 2026-11-13）。
 *
 * 站主原话：
 *   「做好每一页的亮暗色过渡…拖动的时候会慢慢变化…特别是底纹，
 *     从亮色到暗色颜色变化要丝滑均匀一点，不要突变」
 *
 * 这条需求真正会坏的地方，全是**拖动中看不见、松手才暴露**的那一类：
 *   ① 底层靠 `html.dark` 整条替换 —— 拖动时那个类根本不成立，中间态一直停在亮档；
 *   ② 图片底纹（两套图）靠 `display:none/block` 互换 —— 混合/显示是离散量，插不了值；
 *   ③ 滤镜链或 `calc()` 在权重 0 时不等于恒等 —— 拖动一开始底纹就变了样子；
 *   ④ 渐变两档的色标数不一样 —— 中途会因为少一层而"啪"地跳。
 *
 * 这里守的是**关系**（端点、同名、加权），不是某一版的字面色值（AGENTS §4）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥 CSS / JS 注释 —— 注释里提到 `html.dark` 是说明，不是规则。 */
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const TOKENS = read('src/styles/tokens.css');

/* ------------------------------------------------------------ ① 底纹层按权重连续 */

/**
 * 挂着「亮暗两档要看的见差别」的层。每一处都必须出现 `--theme-w`：
 * 它要么在 `calc()` 里加权浓度，要么在交叉淡入里当不透明度，要么在滤镜链里当参数。
 */
const CONTINUOUS_LAYERS: Array<[string, string]> = [
  ['src/components/Topbar.astro', '归档页百褶 ∞（.page-inf）'],
  ['src/components/GalleryInf.astro', '相册区墨迹 ∞'],
  ['src/components/MechanicalRing.astro', '留言页机械环（日夜两图交叉）'],
  ['src/pages/links.astro', '友链页墨迹 ∞'],
  ['src/pages/talks.astro', '说说页墨迹 ∞'],
  ['src/pages/log.astro', '日志页墨迹 ∞'],
  ['src/pages/index.astro', '首屏雾 / 网格 / 玻璃舱窗'],
  ['src/styles/forge.css', '造物台颗粒底纹与项目双图'],
];

describe('亮暗过渡 · 底纹层按 --theme-w 连续化', () => {
  for (const [file, what] of CONTINUOUS_LAYERS) {
    it(`${what} 跟着权重走，而不是只认 html.dark`, () => {
      const src = strip(read(file));
      expect(src, `${file} 里找不到 --theme-w ⇒ 拖动时这一层不会变`).toContain('--theme-w');
    });
  }

  /* 这些文件原来是「整条 html.dark 替换重镇」，现在必须一个规则都不剩。 */
  for (const file of CONTINUOUS_LAYERS.map(([f]) => f)) {
    it(`${file} 不再有 html.dark 整条替换`, () => {
      expect(strip(read(file)), `又出现按 html.dark 整条替换的规则 ⇒ 拖动时这一层会突变`).not.toContain('html.dark');
    });
  }

  /* 标签页飘带是**纯颜色**通道（不含滤镜/图片），所以它不需要 --theme-w；
     但它必须把两端声明在**根元素**上 —— 预览模块只采样 root / body，
     声明在 `.tag-flow` 这种深层元素上它读不到（这一条就是当时的 bug 本体）。 */
  it('标签页飘带底色声明在根元素上，两档各一条', () => {
    const src = strip(read('src/components/TagFlowMenu.astro'));
    expect(src).toMatch(/:global\(html\)\s*\{[^}]*--tag-flow-band:/);
    expect(src).toMatch(/:global\(html\.dark\)\s*\{[^}]*--tag-flow-band:/);
    expect(src, '`--tag-flow-band` 不能声明在 .tag-flow 上（预览读不到）')
      .not.toMatch(/\.tag-flow\s*\{[^}]*--tag-flow-band:/);
  });

  it('拖动期间的过渡由 tokens.css 一处统一摘掉（软条是逐帧改值的，过渡会永远慢半拍）', () => {
    expect(TOKENS).toMatch(/html\.theme-previewing/);
    expect(TOKENS).toMatch(/html\.theme-previewing\s*\*/);
    expect(TOKENS).toMatch(/transition:\s*none\s*!important/);
  });

  it('`theme-previewing` 这个开关只由预览脚本挂/摘（别处挂了就是绕过契约）', () => {
    const owners = CONTINUOUS_LAYERS.map(([f]) => f).filter((f) => strip(read(f)).includes('theme-previewing'));
    expect(owners, `这些文件自己挂了 theme-previewing：${owners.join(', ')}`).toEqual([]);
    expect(read('src/scripts/theme-preview.ts')).toContain("classList.add('theme-previewing')");
  });
});

/* ------------------------------------------------------------ ② 滤镜链代端点验算 */

/** 把 tokens.css 里某条 `--name: …;` 的值抠出来（允许跨行）。 */
function tokenValue(name: string, scope = TOKENS): string {
  const m = scope.match(new RegExp('--' + name.replace(/^--/, '') + '\\s*:\\s*([\\s\\S]*?);'));
  expect(m, `tokens.css 里没有 --${name}`).not.toBeNull();
  return m![1].replace(/\s+/g, ' ').trim();
}

/** 把 `name(inner)` 拆出来，支持 inner 里嵌套 calc(...) 括号。 */
function filterChain(value: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && !/[a-z-]/i.test(value[i])) i++;
    let j = i;
    while (j < value.length && /[a-z-]/i.test(value[j])) j++;
    const name = value.slice(i, j);
    if (value[j] !== '(') { i = j; continue; }
    let depth = 0, k = j;
    for (; k < value.length; k++) {
      if (value[k] === '(') depth++;
      else if (value[k] === ')' && --depth === 0) break;
    }
    out.push([name, value.slice(j + 1, k)]);
    i = k + 1;
  }
  return out;
}

/** 极简算术求值：只处理 `+ - * /`、括号与十进制数（滤镜参数就这些）。 */
function arith(src: string): number {
  const tokens = src.match(/\d*\.?\d+|[+\-*/()]/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const unary = (): number => {
    if (peek() === '-') { i++; return -unary(); }
    if (peek() === '(') { i++; const v = expr(); i++; return v; }
    return Number(tokens[i++]);
  };
  const term = (): number => {
    let v = unary();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[i++]; const r = unary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[i++]; const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  return expr();
}

/** 把权重代入参数并求值（deg 视作单一单位，直接按数字算）。 */
function argAt(inner: string, w: number): number {
  let s = inner.replace(/var\(--theme-w\)/g, String(w)).replace(/deg/g, '');
  const calc = s.match(/^calc\(([\s\S]*)\)$/);
  if (calc) s = calc[1];
  return arith(s);
}

/** 各滤镜函数在「恒等」时的参数值 —— 权重 0 必须逐个落在这些值上。 */
const IDENTITY: Record<string, number> = {
  grayscale: 0, invert: 0, sepia: 0, saturate: 1, brightness: 1,
  contrast: 1, 'hue-rotate': 0, blur: 0, opacity: 1,
};

describe('亮暗过渡 · 滤镜链代端点验算', () => {
  for (const name of ['plate-filter-ink', 'plate-filter-pleat']) {
    it(`--${name} 在权重 0 时逐项恒等`, () => {
      const chain = filterChain(tokenValue(name));
      expect(chain.length, `--${name} 不是滤镜链`).toBeGreaterThan(2);
      for (const [fn, inner] of chain) {
        expect(IDENTITY, `没为 ${fn}() 定义恒等值`).toHaveProperty(fn);
        expect(argAt(inner, 0), `w=0 时 ${fn}() 不是恒等值 ⇒ 亮档底纹一拖就变样`)
          .toBeCloseTo(IDENTITY[fn], 5);
      }
    });

    it(`--${name} 在权重 1 时等于暗档终点`, () => {
      const chain = filterChain(tokenValue(name));
      /* 这两组就是改造前 `html.dark` 里那两条滤镜的原值 —— 动它等于改暗档观感，
         必须同时改 tokens.css 的注释与 docs/rhinelab-spec。 */
      const END: Record<string, Record<string, number>> = {
        'plate-filter-ink': {
          grayscale: 1, invert: 1, brightness: 0.65, sepia: 1, saturate: 3, 'hue-rotate': -20,
        },
        'plate-filter-pleat': {
          grayscale: 1, sepia: 1, saturate: 2.2, 'hue-rotate': -18, brightness: 0.85, contrast: 1.05,
        },
      }[name]!;
      for (const [fn, inner] of chain) {
        expect(argAt(inner, 1), `w=1 时 ${fn}() 与暗档原写法对不上`)
          .toBeCloseTo(END[fn], 5);
      }
    });
  }
});

/* ------------------------------------------------------------ ③ 两档端点都要有 */

describe('亮暗过渡 · 端点 token 两档都声明', () => {
  /** 名字里的数字是"目标档位"不是"只在暗色生效"：亮档那条 calc 也要读到它。 */
  const BOTH_ENDS = [
    '--pleat-light-opacity', '--pleat-dark-opacity',
    '--links-plate-dark-opacity', '--links-plate-dark-mobile-opacity',
    '--talks-plate-dark-opacity', '--gallery-inf-dark-opacity', '--log-inf-dark-opacity',
    '--ring-plate-light-opacity', '--ring-plate-dark-opacity',
    '--paper-fade',
  ];

  for (const name of BOTH_ENDS) {
    it(`${name} 在 :root 里声明过（否则亮档那条 calc 整条失效）`, () => {
      const rootBlock = TOKENS.slice(0, TOKENS.indexOf('html.dark {'));
      expect(rootBlock, `${name} 只写在 html.dark 里 ⇒ calc() 读不到，底纹会变成不透明`)
        .toContain(name + ':');
    });
  }

  /* ★ 2026-11-13 事故：--paper-fade 从 home-dark.css 挪进 tokens.css 时只落了亮档，
     暗档整条 .paper-wrap 覆盖被删没补 ⇒ 暗色下 fixed 渐变两端还是纸白，
     首页滚到中部上下各出现一条白光带。现有「:root 里声明过」守不住这一半。
     判据守关系：两档都在、都是 8 位 hex、暗档显著更暗（带余量，不写死色值）。 */
  it('--paper-fade 亮暗两档各一条，且都是 8 位 hex', () => {
    const css = strip(TOKENS);
    const hits = [...css.matchAll(/--paper-fade\s*:\s*(#[0-9a-f]{3,8})\s*;/gi)].map((m) => m[1].toLowerCase());
    expect(hits.length, `只找到 ${hits.length} 条 --paper-fade ⇒ 有一档漏写`).toBeGreaterThanOrEqual(2);
    for (const h of hits) expect(h, `${h} 不是 8 位 hex（alpha 必须用 8 位）`).toMatch(/^#[0-9a-f]{8}$/);
  });

  it('--paper-fade 暗档明显暗于亮档（暗色收边不许是纸白）', () => {
    const css = strip(TOKENS);
    const hits = [...css.matchAll(/--paper-fade\s*:\s*(#[0-9a-f]{8})\s*;/gi)].map((m) => m[1].toLowerCase());
    const luminance = (hex: string) => {
      const c = (i: number) => parseInt(hex.slice(1 + i, 3 + i), 16);
      return 0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4);
    };
    const [light, dark] = hits;
    expect(luminance(light)).toBeGreaterThan(200);
    expect(luminance(dark), '暗档收边亮度必须够低，否则暗色下就是白光带').toBeLessThan(60);
    expect(luminance(dark)).toBeLessThan(luminance(light) * 0.4);
  });

  it('首页纸面渐变两端读 --paper-fade，不写字面色值', () => {
    const src = strip(read('src/pages/index.astro'));
    const start = src.search(/\.paper-wrap\s*\{/);
    expect(start, '找不到 .paper-wrap 规则').toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('}', start) + 1);
    expect((block.match(/var\(--paper-fade\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(block, '两端写死色值就会绕过亮暗连续插值').not.toMatch(/#fafaf7eb|#100d0bf5/i);
  });

  it('渐变底纹两档色标同名同序（少一层就会在中途跳）', () => {
    for (const family of [`--bath`, `--entry`]) {
      const stops = family === '--bath' ? ['1', '2', '3', '4'] : ['1', '2', '3', '4'];
      for (const n of stops) {
        const hits = (TOKENS.match(new RegExp(`\\${family}-${n}\\s*:`, 'g')) ?? []).length;
        expect(hits, `${family}-${n} 只在单档里有 ⇒ 渐变中途会跳`).toBeGreaterThanOrEqual(2);
      }
      expect(TOKENS).toContain(`${family}-halo:`);
      const halos = (TOKENS.match(new RegExp(`\\${family}-halo\\s*:`, 'g')) ?? []).length;
      expect(halos, `${family}-halo 只在单档里有`).toBeGreaterThanOrEqual(2);
    }
  });
});

/* ------------------------------------------------------------ ④ 两套图不再互换 */

describe('亮暗过渡 · 图片底纹改交叉淡入', () => {
  it('机械环的 day / night 两图同时在场，各自按权重淡入淡出', () => {
    const src = strip(read('src/components/MechanicalRing.astro'));
    expect(src).not.toMatch(/html\.dark/);
    expect(src).not.toMatch(/\.ring-night\s*\{\s*display:\s*block/);
    expect(src, '白天的环没有按 (1 - w) 淡出').toMatch(/\.ring-day[\s\S]{0,240}?--theme-w/);
    expect(src, '夜晚的环没有按 w 淡入').toMatch(/\.ring-night[\s\S]{0,240}?--theme-w/);
  });

  it('造物台的项目图/画廊图不再用 display 互换', () => {
    const src = strip(read('src/styles/forge.css'));
    expect(src).toMatch(/\.project-photo\.has-dark\s*\{[^}]*calc\(1 - var\(--theme-w\)\)/);
    expect(src).toMatch(/\.gallery-image-dark\s*\{[^}]*var\(--theme-w\)/);
    expect(src, '两个 image-dark 类不应再有 display 切换').not.toMatch(/(has-dark|image-dark|photo-dark)\s*\{\s*display:/);
  });
});
