import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 友链页「星座 CONSTELLATION」+ 墨笔 ∞ 底纹（2026-10-05）的契约。
 *
 * 站主拍板（两轮）：
 *   ① 底纹：把本页的百褶 ∞ 换成他手绘的墨笔 ∞，并**自己把黑色∞ 扣下来**（抠成 alpha 通道）。
 *   ② 底纹配色：给「甲（保持纯黑）/ 乙（染成墨绿）」二选一 ⇒ 站主选 **乙**。
 *   ③ 装置：母题「星座」，机制「靠近的节点连出细线，停留越久连得越多」。
 *
 * 这里守的是「不可退让的性质」，不是「当前这一版的实现形态」：
 *   ① 两层装饰都必须挂 `.shell` **之外** —— `.shell` 在页面过渡里会被 transform，
 *      而被 transform 的祖先会成为 `position: fixed` 的包含块（关于页实测跳 91px）。
 *   ② 本页必须**关掉**共用的百褶 ∞（`.page-inf`）—— 不关就是两套母题叠在一起。
 *   ③ 素材**自带 alpha**（抠图那步把纸白反相成了不透明度）⇒ CSS 不得再叠底色。
 *   ④ 颜色只从 token 读；canvas 侧 alpha 以 8 位 hex 承载（不写 rgba()）。
 *   ⑤ 零随机 —— 星的位置是整数哈希，不是随机源（否则截图不可复现、没法验收）。
 *   ⑥ 机制与其余五台**都不同**：吃"指针此刻离谁近"，而不是"指针走过的路径"（显影板）。
 *   ⑦ 「停留越久连得越多」⇒ 线的进度**只增不减**（离开若回落，"越久"就不成立）。
 *   ⑧ 但必须有**上限**：单次推进封顶 + 总线数封顶 ⇒ 否则长时间停留连成蜘蛛网。
 *   ⑨ 四态降级 —— reduced-motion 静态星图 / 无 JS 画布空 / ≤767 减量 / 视口外·切标签停帧。
 *   ⑩ **不用 `hidden` 属性**做显隐 —— 它把元素钉成 display:none，
 *      而 fit() 量的是 clientWidth（恒为 0）⇒ 装置量不到尺寸、画不出第一帧。
 *  ⑪ 零新增运行时依赖（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'links', 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/scripts/constellation.ts'), 'utf8');
/* 剥注释**只用于负向断言**（如「不含 Math.random / rgba(」）。
   ⚠ 正向断言一律用未剥注释的原文：注释里写了常量名时，朴素正则会误吞
   （同 talks-float / about-ref-plate 的教训）。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');

const ASTRO = readFileSync(join(ROOT, 'src/pages/links.astro'), 'utf8');
/* 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style>里的 CSS 块注释。
   顺序有讲究：先剥 JSX 那种—— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。 */
const ACSS = ASTRO.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('友链页 · 星座 CONSTELLATION（2026-10-05）', () => {
  describe('一、机制（与显影板/ 卷尺 / 浮游都不同）', () => {
    it('① 装置读指针位置 —— 靠"此刻离谁近"连边，不是走过的路径', () => {
      expect(CODE).toMatch(/pointermove/);
      // 连边的判据是距离，不是拖影：必须量到指针与星的欧氏距离
      expect(CODE).toMatch(/Math\.hypot/);
      // 有"进入邻域"与"成边距离"两个不同半径（否则只有擦过、没有停留）
      expect(CODE).toMatch(/R_NEAR/);
      expect(CODE).toMatch(/R_LINK/);
    });

    it('② 「停留越久连得越多」⇒ 进度按 dt 累积，不是 f(t) 的瞬时值', () => {
      // 推进量正比于 dt（真实 dt，不是每帧固定系数）
      expect(CODE).toMatch(/SPEED/);
      expect(CODE).toMatch(/dt/);
      // 线的进度存在边对象上（状态），与 FLOAT「不存状态」是相反的取舍
      expect(CODE).toMatch(/interface Edge/);
      expect(CODE).toMatch(/\bp:\s*number/);
    });

    it('③ ★「离开不回落」—— 站主口径的直接推论，否则"越久"不成立', () => {
      const onLeave = CODE.slice(CODE.indexOf('const onLeave'));
      // onLeave 只置 on=false，**不许**出现清零/回落语句
      expect(onLeave.slice(0, 400)).toMatch(/ptr\.on\s*=\s*false/);
      expect(onLeave.slice(0, 400)).not.toMatch(/\bp\s*=\s*0\b/);
      expect(onLeave.slice(0, 400)).not.toMatch(/lit\s*=\s*0/);
    });

    it('④ ★ 累积必须有上限 —— 否则长时间停留连成蜘蛛网', () => {
      // 单次推进封顶
      expect(CODE).toMatch(/LIMIT/);
      // 总线数封顶 + 最旧的退休（顺带实现"位置复用"）
      expect(CODE).toMatch(/MAX_EDGES/);
      expect(CODE).toMatch(/edges\.shift\(\)/);
    });
  });

  describe('二、零随机（形状必须可复现，否则没法验收）', () => {
    it('⑤ 源码不含 Math.random —— 星位一律整数哈希', () => {
      expect(CODE).not.toMatch(/Math\.random/);
    });

    it('⑥ 用的是确定性哈希，且同一个 i 永远同一个值', () => {
      expect(CODE).toMatch(/function hash01/);
      expect(CODE).toMatch(/4294967296/);
    });

    it('⑦ 亮星身份只由 i 决定（不靠"数量取模"）—— 否则 resize 后星会换身份', () => {
      expect(CODE).toMatch(/i\s*%\s*5\s*===\s*0/);
    });
  });

  describe('三、颜色与素材', () => {
    it('⑧ 颜色只从 token 读，alpha 以 8 位 hex 承载（不写 rgba()）', () => {
      expect(CODE).not.toMatch(/rgba\(/);
      expect(CODE).toMatch(/--accent/);
      expect(CODE).toMatch(/padStart\(2,\s*'0'\)/); // 8 位 hex 的补零
    });

    it('⑨ 素材自带 alpha ⇒ CSS 不得再叠底色（否则双重压暗）', () => {
      // .inf-ink-plate 不许有 background / background-color
      const rule = ACSS.match(/\.inf-ink-plate\s*\{[^}]*\}/)?.[0] ?? '';
      expect(rule).not.toMatch(/background(-color)?\s*:/);
      // 但必须有 opacity（分量靠它调）
      expect(rule).toMatch(/opacity\s*:/);
    });

    it('⑩ 素材文件在库里且带 alpha 通道', () => {
      const buf = readFileSync(join(ROOT, 'src/assets/links/inf-ink.png'));
      // PNG 签名 + 颜色类型 6（RGBA）
      expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(buf[25]).toBe(6);
      expect(buf.byteLength).toBeGreaterThan(10_000);
    });
  });

  describe('四、挂法（plate 槽 + 关掉共用 ∞）', () => {
    it('⑪ 两层装饰都走 Base 的 plate 具名槽，且 DOM 在 <main> 之前', () => {
      expect(ASTRO).toMatch(/<Fragment\s+slot="plate">/);
      expect(ASTRO).toMatch(/class="inf-ink-plate"/);
      expect(ASTRO).toMatch(/data-const-bg/);
    });

    it('⑫ ★ 本页显式关掉共用的百褶 ∞（不关就是两套母题叠加）', () => {
      expect(ACSS).toMatch(/:global\(body\.links-plate \.page-inf\)/);
      expect(ACSS).toMatch(/body\.links-plate \.page-inf\)\s*\{[^}]*display:\s*none/);
    });

    it('⑬ bodyClass 挂上了（否则上面那条选择器匹配不到任何东西）', () => {
      expect(ASTRO).toMatch(/bodyClass="links-plate"/);
    });

    it('⑭ ★ 不用 hidden 属性做显隐 —— 它会让 clientWidth 恒为 0', () => {
      expect(ASTRO).not.toMatch(/data-const-bg[^>]*\shidden/);
      // 改用站内既有的 opacity 门控（首页 DNA 同一套）
      expect(ACSS).toMatch(/\.const-bg\.is-ready/);
      expect(CODE).toMatch(/classList\.add\('is-ready'\)/);
    });

    it('⑮ 画布是 fixed inset:0（满屏一次对尺寸，滚动不重算）', () => {
      const rule = ACSS.match(/\.const-bg\s*\{[^}]*\}/)?.[0] ?? '';
      expect(rule).toMatch(/position:\s*fixed/);
      expect(rule).toMatch(/inset:\s*0/);
      expect(rule).toMatch(/pointer-events:\s*none/);
      expect(rule).toMatch(/z-index:\s*-1/);
    });
  });

  describe('五、四态降级', () => {
    it('⑯ reduced-motion 画一张静态星图（不跑 rAF）', () => {
      expect(CODE).toMatch(/if\s*\(!animate\)/);
      expect(CODE).toMatch(/drawStatic/);
      // ★ RM 档也必须露面，否则 opacity:0 门控让它永远不可见
      const rm = CODE.slice(CODE.indexOf('if (!animate)'));
      expect(rm.slice(0, 300)).toMatch(/is-ready/);
    });

    it('⑰ 无 JS ⇒ 画布空着（服务端不画任何东西）', () => {
      // canvas 在 markup 里没有任何内联宽高/内容
      const cv = ASTRO.match(/<canvas[^>]*data-const-bg[^>]*>/)?.[0] ?? '';
      expect(cv).not.toMatch(/width=/);
      expect(cv).not.toMatch(/style=/);
    });

    it('⑱ ≤767px 减量（不是"不渲染"—— 静态星图本身是氛围）', () => {
      expect(CODE).toMatch(/max-width:\s*767px/);
      expect(CODE).toMatch(/narrow\.matches/);
      // 页面侧也要有移动端降档
      expect(ACSS).toMatch(/@media\s*\(max-width:\s*767px\)/);
    });

    it('⑲ 视口外 / 切标签停帧（走 rl-core 的 gate）', () => {
      expect(CODE).toMatch(/createActivityGate/);
      expect(CODE).toMatch(/gate\.onScreen/);
      expect(CODE).toMatch(/gate\.visible/);
    });
  });

  describe('六、构建产物（静态证明，不靠 CDP）', () => {
    it('⑳ 产物里两层都在 <main> 之前', () => {
      if (!hasDist) return; // 没构建过就跳过（与 build-output 的口径一致）
      const html = readFileSync(join(DIST, 'links', 'index.html'), 'utf8');
      const iPlate = html.indexOf('inf-ink-plate');
      const iCanvas = html.indexOf('data-const-bg');
      const iMain = html.indexOf('<main');
      expect(iPlate).toBeGreaterThanOrEqual(0);
      expect(iCanvas).toBeGreaterThanOrEqual(0);
      expect(iMain).toBeGreaterThanOrEqual(0);
      expect(iPlate).toBeLessThan(iMain);
      expect(iCanvas).toBeLessThan(iMain);
    });

    it('㉑ 产物里 page-inf 的关闭规则真在（权重必须对齐才压得住 .page-inf）', () => {
      if (!hasDist) return;
      const html = readFileSync(join(DIST, 'links', 'index.html'), 'utf8');
      expect(html).toMatch(/body\.links-plate \.page-inf\{display:none\}/);
    });

    it('㉒ 产物里 canvas 未被钉hidden、且引用了多档 webp', () => {
      if (!hasDist) return;
      const html = readFileSync(join(DIST, 'links', 'index.html'), 'utf8');
      const cv = html.match(/<canvas[^>]*data-const-bg[^>]*>/)?.[0] ?? '';
      expect(cv).not.toMatch(/\shidden/);
      const srcs = [...html.matchAll(/\/_astro\/inf-ink[^"']*\.webp/g)].map((m) => m[0]);
      expect(srcs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('七、红线', () => {
    it('㉓ 装置脚本不引新依赖、只import rl-core', () => {
      expect(CODE).toMatch(/from '\.\/rl-core'/);
      const imports = [...CODE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      expect(imports.every((i) => i === './rl-core')).toBe(true);
    });

    it('㉔ 页面不新增外链资源（零第三方请求）', () => {
      expect(ASTRO).not.toMatch(/https?:\/\/(?!northcedar\.top)/);
    });
  });
});
