import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 图片加载（2026-10-08）—— 站主两句话：
 *   「@image#1 … 还是会有这个边缘残留，是网络问题吗？」→ 实测**不是加载问题**（拦图档里那片
 *     是空的），真因是螺旋盘的几何；做过的修法已按站主要求**整体撤回**，见 spec §6.61.1；
 *   「给一个点大图快速加载的方案，现在太慢了」⇒ 站主拍了 1 + 2 + 3。
 * 这个文件守后一件事的三块：
 *   ① `public/_headers`：静态资源长缓存（站上一直没有这个文件 ⇒ 用 CF 默认的
 *      `max-age=14400, must-revalidate` ⇒ **每次访问都回源验证**；实测最大那张
 *      1280 档 475 KB：TTFB 1.1–1.3 s、下载 4.1–6.1 s）；
 *   ② 灯箱换图：先用**已经在缓存里的 800 档**显形，大档后台换（`src/scripts/big-image.ts`）；
 *   ③ 时机：大档请求只许发生在**打开灯箱那一刻**，不许在页面加载时抢带宽。
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PW = read('src/components/PhotoWall.astro');
const SP = read('src/components/SpiralPlate.astro');
const BI = read('src/scripts/big-image.ts');
/** ⚠ 统一行尾：本仓在 Windows 上可能被 checkout 成 CRLF，而下面几条断言是**按行锚定**的
 *  （`^/_astro\/\*$` 这类）。不归一的话，换台机器跑就会假红（这一条是提交时
 *  git 那句 "LF will be replaced by CRLF" 提醒出来的）。 */
const HEADERS = read('public/_headers').replace(/\r\n/g, '\n');
/** 只留**规则行**（剥掉 `#` 注释）——
 *  ⚠ 那个文件的注释里正写着"会把 `.html` 一起长缓存"这类话，
 *    不剥注释的话下面两条防呆断言会恒红（本仓老坑：负向断言先剥注释）。 */
const RULES = HEADERS.split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n');

describe('静态资源缓存头（public/_headers）', () => {
  it('★ 构建产物与照片档位都拿到 immutable 长缓存', () => {
    expect(HEADERS, '缺 /_astro/* 规则（构建产物带 8 位 hash，最该长缓存）').toMatch(/^\/_astro\/\*$/m);
    expect(HEADERS, '缺 *.webp 规则（照片档位，最大一张 475 KB）').toMatch(/^\/\*\.webp$/m);
    const cc = [...HEADERS.matchAll(/^\s+Cache-Control:\s*(.+)$/gm)].map((m) => m[1].trim());
    expect(cc.length, `应恰好 2 条 Cache-Control，实际 ${cc.length}`).toBe(2);
    for (const v of cc) {
      expect(v, `没写 immutable：${v}`).toContain('immutable');
      expect(v, `max-age 太短（默认那档是 14400 = 4 小时）：${v}`).toMatch(/max-age=(\d{8,})/);
    }
  });

  it('★★ 不许给 HTML 长缓存 —— 页面地址不变、内容天天变', () => {
    /* 规则按**路径**匹配：写 `/*` 会把 `.html` 一起长缓存 ⇒ 读者一年看不到新文章。
       这条是防呆用的：本轮只按扩展名收窄，将来有人图省事写成"全站"，这里当场红。 */
    expect(RULES.length, '剥完注释没剩规则行 ⇒ 切片失效，下面两条形同虚设').toBeGreaterThan(20);
    expect(RULES, '出现了"全站"规则（`/*`）⇒ HTML 会被一起长缓存').not.toMatch(/^\/\*\s*$/m);
    expect(RULES, '规则里出现了 .html / .htm ⇒ 页面会被长缓存').not.toMatch(/\.html?/);
  });

  it('★ 前提写在文件里了：换了内容必须换文件名', () => {
    /* immutable 的代价就是这条纪律。不写下来的话，下一个人会原地覆盖 `01-800.webp`，
       然后困惑"为什么改完线上还是旧图"。 */
    expect(HEADERS, '没写明"换图必须换文件名"这条前提').toMatch(/不许原地覆盖|换文件名|另存新名/);
  });

  it('★ 产物里也要有它（Astro 只负责把 public/ 原样复制）', () => {
    const dist = join(ROOT, 'dist', '_headers');
    if (!existsSync(join(ROOT, 'dist'))) return;   // 没构建过就跳过（与其它契约同一口径）
    expect(existsSync(dist), 'dist/_headers 没了 ⇒ CF Pages 收不到这些规则').toBe(true);
    expect(readFileSync(dist, 'utf8')).toMatch(/^\/\*\.webp$/m);
  });
});

describe('灯箱换图（big-image）', () => {
  it('★ 两套灯箱都走同一个模块（各抄一份必然腐化）', () => {
    const MOD = /import\s*\{[^}]*\bshowBig\b[^}]*\}\s*from\s*'\.\.\/scripts\/big-image'/;
    expect(PW, '砖墙灯箱没接 big-image').toMatch(MOD);
    expect(SP, '螺旋灯箱没接 big-image').toMatch(MOD);
    expect(PW, '砖墙灯箱没走 showBig').toMatch(/showBig\(\s*lbImg,/);
    expect(SP, '螺旋灯箱没走 showBig').toMatch(/showBig\(\s*lbImg,/);
    for (const [name, src] of [
      ['PhotoWall', PW],
      ['SpiralPlate', SP],
    ] as const) {
      /* 老写法 `lbImg.src = href`：直接上 475 KB 大档，读者盯着黑底等 4 秒。
         （`removeAttribute('src')` 是关灯箱时摘掉的，合法，不在禁止之列。） */
      expect(src, `${name} 里还留着"直接设 src"那种老写法`).not.toMatch(/lbImg\.src\s*=/);
    }
  });

  it('★ "在缓存里"的判据是**解码完成**，不是猜 URL', () => {
    expect(BI, 'thumbOf 必须看 complete 且 naturalWidth > 0').toMatch(
      /complete\s*&&\s*[^;]*naturalWidth\s*>\s*0/,
    );
    expect(BI, 'thumbOf 没取 currentSrc（将来加了 srcset，src 就不是当前那张了）').toMatch(
      /currentSrc\s*\|\|\s*\w+\.src/,
    );
    /* 两处调用都得把缩略图传进去 —— 只传大档就退化成"直接上大档"，等于没修 */
    expect(PW, '砖墙没把缩略图传进去').toMatch(
      /showBig\(lbImg,\s*a\.getAttribute\('href'\)!,\s*thumbOf\(fig\)\)/,
    );
    expect(SP, '螺旋没把缩略图传进去').toMatch(/thumbOf\(it\)/);
  });

  it('★★ 大档请求只许发生在"打开灯箱那一刻"', () => {
    /* 页面加载时就去拉 475 KB，正是这次要避免的那件事。
       ⇒ HTML 里那只 <img> 必须仍是 `loading="lazy"`（容器 display:none ⇒ 打开前不请求），
         由 showBig 在**打开那一刻**改成 eager。 */
    expect(PW, '灯箱 img 的 loading="lazy" 被拿掉了 ⇒ 页面加载时就会拉大档').toMatch(
      /<img id="lbImg"[^>]*loading="lazy"/,
    );
    expect(SP, '灯箱 img 的 loading="lazy" 被拿掉了').toMatch(/<img id="splbImg"[^>]*loading="lazy"/);
    expect(BI, 'showBig 里没把 lazy 放行（打开时仍旧 lazy ⇒ 白等一次可见性判定）').toMatch(
      /\.loading\s*=\s*'eager'/,
    );
    expect(BI, '大档没提优先级（它就是当前页面的主角）').toMatch(/fetchPriority\s*=\s*'high'/);
  });

  it('★ 换图不许闪：先 decode 再赋值，且防住快速翻页的竞态', () => {
    expect(BI, '用 onload 换图会在"字节到齐"与"可绘制"之间白一下 —— 要走 decode()').toMatch(
      /\.decode\(\)/,
    );
    expect(BI, '没了竞态防护 ⇒ 翻页快时上一张的 decode 会盖掉下一张').toMatch(
      /img\.dataset\.big === big/,
    );
    expect(BI, '同一张重设 src 会再闪一次（翻页绕回来时）⇒ 要连 src 一起判空').toMatch(
      /img\.dataset\.big === big && img\.getAttribute\('src'\)/,
    );
  });
});
