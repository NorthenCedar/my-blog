import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* 灯箱「上一张 / 下一张」的圆形白玻璃（2026-10-15）。
 *
 * 由来：站主给了 willowxi.site 相册页的两张截图，问能不能搬过来。扒了参考站原文
 * （`_probe` 外的 `_tmp-ref-album3d.js` / `_tmp-ref-willowxi.css`）之后有三件事必须记在这里：
 *
 * ① 参考站那个玻璃**最终版不是 CSS**。它的 CSS 末尾明写
 *      「三个按钮的玻璃【只由 GL 后处理画】」，并用 `!important` 把 DOM 玻璃整个摁掉
 *      （`backdrop-filter: none !important`）—— 原因写在注释里：「按钮被做了两遍玻璃，
 *      右端出现缺口/菱形」。真效果来自 `backdrop-filter: url(#svgFilter)` + 每帧重生成的
 *      128×128 位移图。**本门闩刻意不追那条路**：站内 `SpiralPlate.astro` 开头明写
 *      不引 WebGL 的三条理由，且 `tests/build-output.test.ts` 有断言整页不许出现 three。
 *      抄"简易版"（6 行 CSS，作者自己标注了「简易版；用户说后期会换样式」）。
 *
 * ② ★ **α 不可移植，渲染浓度才可移植**。参考站是暗色主题、玻璃是 `rgba(255,255,255,.07)`；
 *      本站是纸白主题，现有的 `--glass-bg` 是 `#ffffff5c`（36%，亮色玻璃那一档）。
 *      两套**不能混用**：36% 的白玻璃压在纸白上等于隐形，压在灯箱的暗幕上又太重。
 *      ⇒ 暗底另立一组 `dark-glass-*`，与亮底的 `--glass-*` 并列。
 *
 * ③ 两套灯箱（砖墙 `.lb` / 螺旋盘 `.splb`）结构逐字相同 ⇒ **门闩必须两个都查**，
 *      只查一个等于留一半没守（站内已有同族教训：给某节点加包裹层后忘了检查
 *      所有以它为末端的组合选择器）。
 */

const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const WALL = readFileSync('src/components/PhotoWall.astro', 'utf8');
const SPIRAL = readFileSync('src/components/SpiralPlate.astro', 'utf8');

/** 取某个选择器的声明块（花括号配对，不按定长切片）。 */
function decls(src: string, selector: string): string {
  const i = src.indexOf(selector + ' {');
  if (i < 0) throw new Error(`源码里找不到 \`${selector} {\``);
  const open = src.indexOf('{', i);
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(open + 1, j); }
  }
  throw new Error('花括号没配上');
}

const TARGETS = [
  { name: '砖墙灯箱', src: WALL, stage: '.lb-stage > button' },
  { name: '螺旋盘灯箱', src: SPIRAL, stage: '.splb-stage > button' },
];

describe('灯箱 · 上一张/下一张的圆形白玻璃', () => {
  it('★ 两套灯箱都换成了圆形白玻璃（漏一套 = 一半页面没改）', () => {
    for (const t of TARGETS) {
      const block = decls(t.src, t.stage);
      /* 剥注释再做**负向**断言：否则注释里引用的类名会让 `not.toMatch` 恒红。 */
      const NC = t.src.replace(/\/\*[\s\S]*?\*\//g, ' ');

      expect(block, `${t.name}：按钮必须是圆的`).toMatch(/border-radius:\s*50%/);
      /* 正方形：宽高必须相等且有值。`aspect-ratio` 也要认 ——
         只写 `aspect-ratio:1` 不写 width 的写法是合法的，别把判据写死成 width。 */
      const sized =
        (/width:\s*[\d.]+px/.test(block) && /height:\s*[\d.]+px/.test(block)) ||
        /aspect-ratio:\s*1\b/.test(block);
      expect(sized, `${t.name}：圆形按钮必须有确定的尺寸（宽高相等或 aspect-ratio:1）`).toBe(true);

      /* 玻璃本体：底色、模糊、亮边三样都要在。
         ⚠ 判据落在 **token 名**上而不是具体数值上 —— 浓淡是量出来的、以后还会再调，
         门闩要守的是"它走的是暗底玻璃那一组、且不许退回亮底那组"。
         ★★ **负向排在正向之前**（站内踩过）：只写正向时，把 `--dark-glass-bg` 换成
           `--glass-bg` 会先被"底色应走暗底玻璃 token"逮住 —— 那条只说"没有 A"，
           没说"错在哪"；真正点名的负向那句根本没机会跑，报错指向不了原因。 */
      expect(block, `${t.name}：误用了亮底玻璃 token（36% 白玻璃压在暗幕上会糊成一片白）`)
        .not.toMatch(/var\(--glass-bg\)/);
      expect(block, `${t.name}：误用了亮底玻璃描边 token`).not.toMatch(/var\(--glass-line\)/);

      expect(block, `${t.name}：底色应走暗底玻璃 token`).toMatch(/var\(--dark-glass-bg\)/);
      expect(block, `${t.name}：亮边应走暗底玻璃 token`).toMatch(/var\(--dark-glass-line\)/);
      /* ⚠ 这一条最容易写成弱判据：`/backdrop-filter:[^;]*blur\(/` 会被
         **-webkit- 前缀那行**的子串命中 —— 删掉无前缀那行它照样绿。必须排除前缀。 */
      expect(block, `${t.name}：该有背景模糊（玻璃的本体），且不许只剩 -webkit- 那一份`)
        .toMatch(/(?<!-webkit-)backdrop-filter:\s*[^;]*blur\(/);
      /* 负向：不许写字面色值、不许 rgba()（AGENTS §3 第 4 条） */
      expect(block, `${t.name}：自己写了字面色值`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(block, `${t.name}：自己写了 rgba()`).not.toMatch(/\brgba?\(/);
      /* 负向：整份源码里不许有 WebGL 那条路（见文件头 ①） */
      expect(NC, `${t.name}：不许引 WebGL 玻璃（站内已定架构：螺旋盘不引）`)
        .not.toMatch(/backdrop-filter:\s*url\(/);
    }
  });

  it('★ 按下有缩放反馈（站上交互控件的统一手感）', () => {
    for (const t of TARGETS) {
      const active = new RegExp(`${t.stage.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}:active\\s*\\{([^}]*)\\}`);
      const m = active.exec(t.src);
      expect(m, `${t.name}：缺 :active 反馈`).not.toBeNull();
      expect(m![1], `${t.name}：按下没有缩放`).toMatch(/scale\(\s*0?\.9\d*\s*\)/);
    }
  });

  it('★ 焦点圈必须留着：玻璃按钮是暗底上的纯文字，去掉焦点圈键盘就看不见自己在哪', () => {
    for (const t of TARGETS) {
      const fv = new RegExp(`${t.stage.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}:focus-visible\\s*\\{([^}]*)\\}`);
      const m = fv.exec(t.src);
      expect(m, `${t.name}：缺 :focus-visible 样式`).not.toBeNull();
      expect(m![1], `${t.name}：焦点圈没有可见轮廓`).toMatch(/outline/);
    }
  });

  it('★★ 圆形玻璃这一组必须是**通用样式**（住在 tokens.css 里），不许抄成两处页面私有 CSS', () => {
    /* 站主要求「把这套玻璃当成通用样式」。若两个组件各写一份浓淡，
       以后调一次要改两处、且必然漂移 —— 这正是站内反复踩过的"两处各写一份格式"。 */
    expect(TOKENS, 'tokens.css 里没有暗底玻璃这一组').toMatch(/--dark-glass-bg:/);
    for (const name of ['--dark-glass-bg-hot', '--dark-glass-line', '--dark-glass-blur']) {
      expect(TOKENS, `tokens.css 缺 ${name}`).toContain(name);
    }
    /* ★ 8 位 hex、alpha 写全（AGENTS §3 第 4 条），不许 6 位也不许 rgba()。
       ⚠ `--dark-glass-blur` / `--dark-glass-sat` 是**长度与百分比**，不是颜色 ——
         第一版把整组都当颜色查，判据自己先红了。凡是"这组里凡是颜色都必须 8 位 hex"。 */
    const NC = TOKENS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of NC.matchAll(/(--dark-glass-[\w-]+):\s*([^;]+);/g)) {
      const [, name, value] = m;
      const v = value.trim();
      const isColor = /^#/.test(v) || /rgba?\(/i.test(v);
      expect(v, `${name} 写了 rgba()`).not.toMatch(/rgba?\(/i);
      if (isColor) expect(v, `${name} 是颜色，必须写成 8 位 hex（alpha 也要带上）`)
        .toMatch(/^#[0-9a-fA-F]{8}$/);
      else expect(v, `${name} 不是颜色，也不是长度/百分比 —— 检查一下这条声明`).toMatch(/^[\d.]+(px|%)$/);
    }
    /* 反面：亮底那组必须**还在**（留言页的玻璃控件在用），不许被这次改动顶掉 */
    expect(TOKENS, '亮底玻璃 --glass-bg 被弄没了 ⇒ 留言页玻璃控件会掉样式').toMatch(/--glass-bg:/);
  });

  it('★ 按钮不能盖住照片：暗幕上的圆形按钮要留出边距，不许贴着图', () => {
    for (const t of TARGETS) {
      const stage = decls(t.src, t.stage.replace(' > button', ''));
      expect(stage, `${t.name}：舞台没有内边距`).toMatch(/padding:/);
    }
  });
});