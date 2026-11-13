/**
 * 主题预览（拖动软条中间态）的单元门闩。
 *
 * 这一层守的是**三个洞**，每一个都曾让"拖动时底纹不动、松手才跳"：
 *   ① 暗色 token 写在 body 上（`html.dark body.chrome-console { --paper: … }`）⇒
 *      只读 documentElement 根本读不到，必须按变量实际生效的层写回；
 *   ② 数值型 token（`--water-strength: 0.17 → 0.20`）不是颜色 ⇒ 要线性插成**数字**，
 *      不能写 `calc()`（消费方一半是 parseFloat）；
 *   ③ 非颜色通道要有一个全局权重 `--theme-w`，样式才能用 calc() 把滤镜/浓度连续化。
 *
 * ⚠ 判据守关系不守字面量（AGENTS §4）：这里断言的是"写回哪一层 / 值是数字 /
 *   端点能对上"，不锁具体色值。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Pair = { light: string; dark: string };
type Decls = Record<string, Pair>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** 一个最小的元素：只要 classList + 可读写的 inline style。 */
function mkEl() {
  const inline = new Map<string, string>();
  const classes = new Set<string>();
  return {
    inline,
    classes,
    classList: {
      contains: (v: string) => classes.has(v),
      add: (v: string) => classes.add(v),
      remove: (v: string) => classes.delete(v),
      toggle: (v: string, on: boolean) => (on ? classes.add(v) : classes.delete(v)),
    },
    style: {
      getPropertyValue: (n: string) => inline.get(n) ?? '',
      getPropertyPriority: () => '',
      setProperty: (n: string, v: string) => { inline.set(n, v); },
      removeProperty: (n: string) => { inline.delete(n); },
    },
  };
}

/**
 * 挂一个假文档。
 *
 * `rootDecl` 声明在 `html` 上，`bodyDecl` 声明在 `body` 上（覆盖 root）；body 上没声明的
 * 变量按继承取 root 的值 —— 这就是浏览器里 `getComputedStyle(body)` 的样子，也是判定
 * "这个变量归哪一层"的唯一可观测证据。
 */
function mount(rootDecl: Decls, bodyDecl: Decls = {}) {
  const html = mkEl();
  const body = mkEl();
  const events: any[] = [];
  vi.stubGlobal('document', {
    documentElement: html,
    body,
    dispatchEvent: (e: any) => { events.push(e); return true; },
  });
  vi.stubGlobal('getComputedStyle', (el: any) => {
    const dark = html.classes.has('dark');
    const own = el === body ? bodyDecl : {};
    const names = Array.from(new Set([...Object.keys(rootDecl), ...Object.keys(own)]));
    const getPropertyValue = (n: string): string => {
      if (el.inline.has(n)) return el.inline.get(n)!;
      const decl = own[n] ?? rootDecl[n];
      if (!decl) return '';
      return dark ? decl.dark : decl.light;
    };
    return Object.assign(names, { getPropertyValue });
  });
  return { html, body, events };
}

async function preview(rootDecl: Decls, bodyDecl: Decls = {}) {
  const dom = mount(rootDecl, bodyDecl);
  const mod = await import('../src/scripts/theme-preview');
  return { ...dom, mod, api: mod.createThemePreview() };
}

describe('主题预览 · 按变量真实生效的层写回', () => {
  it('body 上有暗色覆盖的变量写 body，只在 root 声明的写 root', async () => {
    const { api, html, body } = await preview(
      { '--paper': { light: '#fafaf7', dark: '#0b0b0c' }, '--ink': { light: '#1a1a1a', dark: '#f2f4f1' } },
      { '--paper': { light: '#ffffff', dark: '#100d0b' }, '--accent': { light: '#2d7d46', dark: '#ff7b00' } },
    );
    api.update(0.5);
    /* ① 两档都声明在 body、且与 root 不同 ⇒ 必须写 body（写 root 会被 body 那条规则压掉） */
    expect(body.inline.get('--paper')).toContain('color-mix');
    expect(body.inline.get('--paper')).toContain('#ffffff');
    expect(body.inline.get('--paper')).toContain('#100d0b');
    expect(html.inline.has('--paper')).toBe(false);
    /* ② 只在 body 上有 ⇒ 同样写 body */
    expect(body.inline.get('--accent')).toContain('color-mix');
    /* ③ 只在 root 上有 ⇒ 写 root，别把 body 也盖上一层 */
    expect(html.inline.get('--ink')).toContain('color-mix');
    expect(body.inline.has('--ink')).toBe(false);
  });

  it('两档取值相同的变量不写 inline（写了纯属噪声）', async () => {
    const { api, html, body } = await preview({ '--hair': { light: '#e6e3dc', dark: '#e6e3dc' } });
    api.update(0.4);
    expect(html.inline.has('--hair')).toBe(false);
    expect(body.inline.has('--hair')).toBe(false);
    /* 只应剩下权重那两个 */
    expect(Array.from(html.inline.keys()).sort()).toEqual(['--theme-preview-weight', '--theme-w']);
  });

  it('只在暗档声明的变量被跳过（亮档读不到 ⇒ calc 会整条失效，属于要暴露的 bug）', async () => {
    const { api, html } = await preview({ '--only-dark': { light: '', dark: '#2d7d46' } });
    api.update(0.7);
    expect(html.inline.has('--only-dark')).toBe(false);
  });
});

describe('主题预览 · 数值型 token 直接插值，不写 calc()', () => {
  it('--water-strength 0.17 → 0.20 在中点写成数字 0.185', async () => {
    const { api, html } = await preview({ '--water-strength': { light: '0.17', dark: '0.2' } });
    api.update(0.5);
    const value = html.inline.get('--water-strength');
    expect(value).toBe('0.185');
    /* ⚠ 消费方是 parseFloat（canvas 着色器参数）⇒ 拿到 calc() 会变 NaN，必须纯数字 */
    expect(value).not.toContain('calc');
    api.update(1);
    expect(html.inline.get('--water-strength')).toBe('0.2');
  });

  it('带单位的数值不插值（单位不同不能相加，宁可不写）', async () => {
    const { api, html } = await preview({ '--plate-inset': { light: '12px', dark: '20px' } });
    api.update(0.5);
    expect(html.inline.has('--plate-inset')).toBe(false);
  });

  it('渐变 / color-mix / 滤镜表达式一律跳过，交给 --theme-w 在样式里算', async () => {
    const { api, html } = await preview({
      '--bath': { light: 'linear-gradient(#fff, #eee)', dark: 'linear-gradient(#000, #111)' },
      '--trail': { light: 'color-mix(in srgb, #729e7f 60%, #000)', dark: 'color-mix(in srgb, #2d7d46 60%, #fff)' },
    });
    api.update(0.5);
    expect(html.inline.has('--bath')).toBe(false);
    expect(html.inline.has('--trail')).toBe(false);
  });
});

describe('主题预览 · 全局权重 --theme-w', () => {
  it('每次更新都写 0–1 的数字，并挂上 theme-previewing', async () => {
    const { api, html } = await preview({ '--paper': { light: '#fafaf7', dark: '#0b0b0c' } });
    api.update(0.35);
    expect(html.inline.get('--theme-w')).toBe('0.35');
    expect(html.inline.get('--theme-preview-weight')).toBe('35%');
    expect(html.classes.has('theme-previewing')).toBe(true);
    api.update(1);
    expect(html.inline.get('--theme-w')).toBe('1');
    api.update(-3); // 越界夹紧
    expect(html.inline.get('--theme-w')).toBe('0');
  });

  it('clear() 还原 inline、摘掉标记、并把中间色清空', async () => {
    const { api, html, events } = await preview({ '--paper': { light: '#fafaf7', dark: '#0b0b0c' } });
    api.update(0.6);
    api.clear();
    expect(html.inline.size).toBe(0);
    expect(html.classes.has('theme-previewing')).toBe(false);
    const last = events.at(-1);
    expect(last.type).toBe('themepreview');
    expect(last.detail).toBeNull();
  });

  it('两轮预览之间不留残余（上一轮写过的值不能被当成端点）', async () => {
    const { api, html } = await preview({ '--paper': { light: '#fafaf7', dark: '#0b0b0c' } });
    api.update(0.5);
    api.clear();
    api.update(0.5);
    const value = html.inline.get('--paper')!;
    /* 端点仍是两端字面量，不是上一轮那条 color-mix 字符串 */
    expect(value).toContain('#fafaf7');
    expect(value).toContain('#0b0b0c');
    expect(value).toContain('var(--theme-preview-weight)');
    expect(value.match(/color-mix/g)).toHaveLength(1);
  });
});

describe('主题预览 · 给 canvas 层的中间色', () => {
  it('themepreview 的 detail.mixed 是纯 hex，与 color-mix 同一条公式', async () => {
    const { api, events } = await preview({
      '--ink': { light: '#000000', dark: '#ffffff' },
      '--paper': { light: '#fafaf7', dark: '#1a1a1a' },
    });
    api.update(0.5);
    const detail = events.at(-1).detail;
    expect(detail.progress).toBe(0.5);
    expect(detail.mixed['--ink']).toBe('#808080');
    /* 两端不变色 ⇒ 中间也是它本身（纯 hex，不带 var()/calc） */
    expect(detail.mixed['--paper']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('带 alpha 的端点连 alpha 一起插，出 8 位 hex', async () => {
    const { api, events } = await preview({ '--veil': { light: '#00000000', dark: '#ffffffff' } });
    api.update(0.5);
    expect(events.at(-1).detail.mixed['--veil']).toBe('#80808080');
  });

  it('previewColor / previewProgress 只在预览期有值，松手即退回 undefined', async () => {
    const { api, mod } = await preview({ '--ink': { light: '#000000', dark: '#ffffff' } });
    expect(mod.previewProgress()).toBeNull();
    api.update(0.25);
    expect(mod.previewProgress()).toBe(0.25);
    expect(mod.previewColor('--ink')).toBe('#404040');
    expect(mod.previewColor('--not-a-token')).toBeUndefined();
    api.clear();
    expect(mod.previewProgress()).toBeNull();
    expect(mod.previewColor('--ink')).toBeUndefined();
  });
});
