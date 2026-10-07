import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* 留言页底纹「墨滴 INK DROP · ∞ 环线 + 星芒」**替代**百褶 ∞（站主 2026-10-06）的契约。
 * ★ 2026-10-08 站主：「背景那个**蓝色**的无限符号改为**墨绿色**」⇒ 素材重出（色变了，契约的
 *   其余部分一条没动）。下面 ② 已按这次指令改写。
 *
 * 这一轮只做**静态底纹**（母题层）。墨滴装置（鼠标留墨痕几秒渗开 + 新留言落下墨滴扩散）
 * 是同一母题的第二层，站主明确要求"先做底纹" ⇒ 装置不在本文件范围内，
 * 下一轮做时另起 `guestbook-inkdrop.test.ts`，不要往这里塞。
 *
 * 这里守的是「不可退让的性质」，不是「上一版的实现形态」：
 *   ① 素材必须**自带 alpha** —— 不透明矩形底 + opacity 会在纸白上留下一片灰、
 *      看得见矩形边（同 talks / 关于页同源教训）。
 *   ② 素材的颜色必须**按站主的当前指令**来，且**不许被去饱和** —— 2026-10-06 立时
 *      是站主给的蓝钢笔原图色，2026-10-08 站主改口「改为**墨绿色**」⇒ 现在必须是墨绿。
 *      两个方向守的是同一条底线：**不许染成灰**（染灰等于换母题 —— about 页 ref-plate 那条）。
 *   ③ 素材必须**裁到主体框** —— 原图 1080×1351 里上方 44.5% 是纯纸白，
 *      不裁会让视觉重心掉到视口下半部，且白占下载体积。
 *   ④ 装饰层必须挂 `.shell` **之外**（走 plate 具名槽）—— `.shell` 在页面过渡里会被
 *      transform，而被 transform 的祖先会成为 `position: fixed` 的包含块（关于页实测跳 91px）。
 *   ⑤ 必须关掉本页百褶 ∞ —— 否则两套母题叠在一起。
 *   ⑥ 取宽不许 ≥100vw、透明度取站上装饰底纹定稿档 8%（同 talks 墨点档）。
 *   ⑦ 零新增运行时依赖（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'guestbook', 'index.html'));

const ASTRO = readFileSync(join(ROOT, 'src/pages/guestbook.astro'), 'utf8');
/* 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。
   顺序有讲究：先剥 JSX 那种 —— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。
   ⚠ 正向断言里凡是要"注释里的理由"的，用未剥注释的 ASTRO（同 talks-float 的教训）。 */
const ACSS = ASTRO.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const PLATE_DIR = join(ROOT, 'src/assets/guestbook/plates');
const PLATE = join(PLATE_DIR, 'inkdrop-orbit.webp');

const GUEST = hasDist ? readFileSync(join(DIST, 'guestbook', 'index.html'), 'utf8') : '';

describe('留言页 · 墨滴底纹（替代百褶 ∞）· 素材契约', () => {
  it('素材已进仓、在 plates 子目录、体积可控', () => {
    expect(existsSync(PLATE), '缺 src/assets/guestbook/plates/inkdrop-orbit.webp').toBe(true);
    const plates = readdirSync(PLATE_DIR).filter((f) => f.endsWith('.webp'));
    expect(plates.length, 'plates 目录下只该有一张底纹').toBe(1);
    const kb = statSync(PLATE).size / 1024;
    expect(kb, `底纹 ${kb.toFixed(0)} KB 太大了（这层是 8% 不透明度的淡纹）`).toBeLessThan(200);
    /* ⚠ 必须落在 plates/ 子目录 —— `*.webp` 若直接放在 guestbook/ 根下，
       日后新增别的 glob（比如"留言配图"）会把它一起收进去（多一份产物）。 */
    expect(PLATE.replace(/\\/g, '/'), '素材必须放在 plates 子目录里').toContain('/guestbook/plates/');
  });

  it('★ 素材自带 alpha（抠图干净，不露矩形底、不留纸纹）', async () => {
    /* 站主给的是**纸白底 JPG**（1080×1351，蓝色只占 5.11%）。
       必须构建期抠成透明底，否则 8% 不透明度会把那片纸白压成一块可见的灰矩形。 */
    const sharpMod = await import('sharp');
    const sharp = sharpMod.default;
    const meta = await sharp(PLATE).metadata();
    expect(meta.hasAlpha, '素材没有 alpha 通道 ⇒ 会在纸白上露出一块矩形底').toBe(true);

    const { data, info } = await sharp(PLATE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    /* 四角必须透明 —— 抠图若没抠干净，四角会留纸白 ⇒ 8% 下是一块脏角。
       （阈值法会漏纸纹噪点，所以必须目检轮廓；这里用四角+边缘做回归守卫。） */
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    for (const [x, y, where] of [
      [0, 0, '左上'], [info.width - 1, 0, '右上'],
      [0, info.height - 1, '左下'], [info.width - 1, info.height - 1, '右下'],
    ] as const) {
      expect(at(x, y), `${where}角不透明 ⇒ 纸白没抠干净`).toBeLessThanOrEqual(8);
    }
    let maxA = 0, opaque = 0, n = 0, sumR = 0, sumB = 0, sumG = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const a = data[i + 3];
      if (a > maxA) maxA = a;
      if (a > 200) { opaque++; n++; sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]; }
    }
    expect(maxA, '最大 alpha 为 0 ⇒ 图案被整体清掉了').toBeGreaterThanOrEqual(200);
    expect(n, '没有不透明像素 ⇒ 图案没了').toBeGreaterThan(1000);
    /* ★ 颜色：2026-10-08 站主「背景那个**蓝色**的无限符号改为**墨绿色**」。
       这条原先守的是"必须是蓝的"，现在守同一件事的**反面** —— 底线一个字没变：
       ① 必须**饱和**（染灰等于换母题，about 页 ref-plate 那条规矩）；
       ② 必须落在站主**当前指定**的色族里（现在是墨绿：G 明显高于 R 与 B）。
       ★ 判据只认"色族 + 饱和度"，**不写十六进制快照** —— 快照会在下一次改色时误报。 */
    const avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;
    const rgb3 = `${avgR.toFixed(0)},${avgG.toFixed(0)},${avgB.toFixed(0)}`;
    expect(avgG - avgR, `不透明区平均色 rgb(${rgb3}) —— 墨绿被去饱和了`).toBeGreaterThan(30);
    expect(avgG - avgB, `不透明区平均色 rgb(${rgb3}) —— 墨绿被往蓝/灰方向偏移了`).toBeGreaterThan(20);
    expect(
      Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB),
      `不透明区平均色 rgb(${rgb3}) 彩度太低（接近灰）⇒ 读成"染灰"而不是墨绿`,
    ).toBeGreaterThan(30);
  });

  it('★ 已裁到主体框（不留原图上方那 44.5% 的纸白）', async () => {
    const sharpMod = await import('sharp');
    const sharp = sharpMod.default;
    const meta = await sharp(PLATE).metadata();
    /* 原图是 1080×1351（0.80:1 竖幅）；主体框实测 923×464（1.99:1 横幅）。
       竖幅直接当底纹用会让重心掉到视口下半部，且 aspect-ratio 定不出来。 */
    expect(meta.width, '宽度应为主体框 923').toBe(923);
    expect(meta.height, '高度应为主体框 464').toBe(464);
    const ratio = meta.width! / meta.height!;
    expect(ratio, `主体框比例 ${ratio.toFixed(3)}，与 CSS 的 aspect-ratio 对不上`).toBeCloseTo(923 / 464, 2);
    /* 裁后仍要贴到左右边缘（环线左右两端被裁到了画布边上）—— 不对就说明裁过头了 */
    const { data, info } = await sharp(PLATE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = meta.width!, x1 = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels + 3] <= 64) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
    expect(x0, `内容贴不到左边缘（x0=${x0}）⇒ 裁过头了，环线左端没了`).toBeLessThanOrEqual(2);
    expect(x1, `内容贴不到右边缘（x1=${x1}）⇒ 裁过头了`).toBeGreaterThanOrEqual(meta.width! - 46);
  });
});

describe('留言页 · 墨滴底纹 · 挂法与样式契约', () => {
  it('★ 走 plate 具名槽（不塞普通 slot，否则 fixed 定位会跳）', () => {
    expect(ASTRO).toMatch(/<Fragment slot="plate">/);
    expect(ASTRO).toMatch(/import\.meta\.glob<[^>]*ImageMetadata[^>]*>\('\/src\/assets\/guestbook\/plates\/\*\.webp'/);
    expect(ASTRO).toMatch(/class="float-plate"/);
    expect(ASTRO).toMatch(/aria-hidden="true"/);
    // 走构建期管线（<Image widths sizes>）—— 禁止在模板里写裸 <img src="/…">
    expect(ASTRO).toMatch(/<Image[\s\S]*?widths=\{\[590, 1180\]\}/);
    expect(ASTRO).toMatch(/<Image[\s\S]*?sizes="86vw"/);
  });

  it('★ 关掉本页百褶 ∞（否则两套母题叠在一起）', () => {
    expect(ASTRO).toMatch(/bodyClass="guestbook-plate"/);
    expect(ASTRO).toMatch(/body\.guestbook-plate \.page-inf/);
    /* ⚠ 正则要容忍 `:global(...)` 的右括号 —— 否则 `{` 前面隔着 `)` 永远匹配不上。 */
    expect(ACSS).toMatch(/body\.guestbook-plate \.page-inf\)\s*\{[^}]*display:\s*none/);
    /* 关法必须是 display:none 而不是 opacity:0 —— 后者仍占一层满屏合成层，很贵。 */
    expect(ACSS).not.toMatch(/body\.guestbook-plate \.page-inf\)\s*\{[^}]*opacity:\s*0/);
  });

  it('★ 挂法照抄百褶 ∞，取宽与透明度按素材差异定（可复算）', () => {
    const topbar = readFileSync(join(ROOT, 'src/components/Topbar.astro'), 'utf8');
    const inf = topbar.match(/body\.chrome-page \.page-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(inf, 'Topbar 里找不到 .page-inf 的规则 —— 百褶 ∞ 改名了，契约要回头改').toBeTruthy();
    expect(inf, '百褶 ∞ 现在不是 z-index:-1 了 ⇒ 这条契约要重新对').toMatch(/z-index:\s*-1/);

    const plate = ACSS.match(/\.float-plate\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(plate, '没读到 .float-plate 的样式块').toBeTruthy();
    for (const decl of ['position: fixed', 'left: 50%', 'top: 50%', 'pointer-events: none', 'z-index: -1']) {
      expect(plate, `挂法缺 ${decl}`).toContain(decl);
    }
    expect(plate, '与百褶 ∞ 的居中写法不一致').toMatch(/translate\(-50%,\s*-50%\)/);

    /* 比例必须与素材一致，否则 contain 会把图缩进框里、四周多出一圈空 */
    expect(plate, 'aspect-ratio 必须等于素材主体框 923/464').toMatch(/aspect-ratio:\s*923 \/ 464/);

    /* 取宽同 talks 墨点档（墨迹铺满画布，出血=切掉环线两端 ⇒ 不用 128vw 档） */
    expect(plate, '取宽必须收回画内：min(86vw, 1180px, 200vh)').toMatch(
      /--plate-w,\s*min\(86vw,\s*1180px,\s*200vh\)\)/,
    );
    expect(plate, '128vw 是百褶 ∞ 的出血档 —— 本页禁止再用（会切掉环线两端）').not.toMatch(/128vw/);
    /* ★ 站上通用的守卫，比单看某个数字耐老化：任何 ≥100vw 都意味着「图案会出画」。 */
    const vwValues = [...plate.matchAll(/([\d.]+)vw/g)].map((m) => Number(m[1]));
    expect(vwValues.length, '取宽里一个 vw 都没有？').toBeGreaterThan(0);
    for (const v of vwValues) {
      expect(v, '取宽不许 ≥100vw —— 站主 2026-10-04：不要出去了').toBeLessThan(100);
    }
    expect(plate, '挡"又宽又扁"的窗，必须有 vh 上界').toMatch(/200vh/);

    /* 透明度取站上装饰底纹定稿档 8%（--deco-plate-coarse = #2d7d4614 ≈ 7.8%） */
    expect(plate, '透明度默认值应为 8%（站上装饰底纹定稿档）').toMatch(/--plate-op,\s*0\.08\)/);
    const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(tokens, '站上装饰底纹档变了 ⇒ 8% 这个数要重新对').toMatch(/--deco-plate-coarse:\s*#2d7d4614/);
    /* 两档旋钮留着，便于只改一行就调分量 */
    expect(ACSS, '两档旋钮要留着（--plate-w / --plate-op）').toMatch(/--plate-op/);
    expect(ACSS, '两档旋钮要留着（--plate-w / --plate-op）').toMatch(/--plate-w/);

    /* 图片：contain + 解除 base.css 的 max-width（否则缩到父盒宽度、底纹跟着版心走） */
    expect(ACSS).toMatch(/\.float-plate img\s*\{[\s\S]*?object-fit:\s*contain/);
    expect(ACSS).toMatch(/\.float-plate img\s*\{[\s\S]*?max-width:\s*none/);
  });

  it('构建产物里底纹真实在位，且正文完整（无 JS 可用）', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect(GUEST, '产物里没有 .float-plate').toContain('class="float-plate"');
    /* 走 <Image> ⇒ 产物里有 srcset，且文件名是构建期产物（带 hash） */
    expect(GUEST, '底纹应走构建期优化管线（srcset）').toMatch(/<img[^>]*srcset="[^"]*"/);
    expect(GUEST, '底纹层必须 aria-hidden（纯装饰）').toMatch(/<div[^>]*class="float-plate"[^>]*aria-hidden="true"|<div[^>]*aria-hidden="true"[^>]*class="float-plate"/);
    /* 正文服务端渲染完整 —— 底纹是装饰，不许承担内容 */
    expect(GUEST, '留言页标题应服务端渲染').toContain('留言');
  });

  it('零新增运行时依赖（红线）', () => {
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    const deps = JSON.parse(pkg).dependencies ?? {};
    /* 底纹素材的处理只用构建期 sharp（astro 自带），不许进 dependencies */
    expect(Object.keys(deps), `多了运行时依赖：${Object.keys(deps).join(', ')}`).toEqual(
      expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']),
    );
    expect(Object.keys(deps).length, `dependencies 应恰好 3 个，实际 ${Object.keys(deps).length}`).toBe(3);
  });
});