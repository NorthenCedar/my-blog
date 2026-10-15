import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 图片加载 —— 站主两句话：
 *   「@image#1 … 还是会有这个边缘残留，是网络问题吗？」→ 实测**不是加载问题**（拦图档里那片
 *     是空的），真因是螺旋盘的几何；做过的修法已按站主要求**整体撤回**，见 spec §6.61.1；
 *   「给一个点大图快速加载的方案，现在太慢了」⇒ 站主拍了 1 + 2 + 3；
 *   「把他换成和大图尺寸一样」（2026-10-15）⇒ **把 2 撤回**：灯箱不再拿 800 档占位，
 *     打开就是那张大档本身。下面 `灯箱换图` 那组守的就是改完之后的新契约，
 *     1（长缓存）与 3（打开那一刻才请求）两条原样保留。
 * 这个文件守的三块：
 *   ① `public/_headers`：静态资源长缓存（站上以前没有这个文件 ⇒ 用 CF 默认的
 *      `max-age=14400, must-revalidate` ⇒ **每次访问都回源验证**；实测最大那张
 *      1280 档 475 KB：TTFB 1.1–1.3 s、下载 4.1–6.1 s）；
 *   ② 灯箱换图：打开即大档，没有"先小后大"（`src/scripts/big-image.ts`）；
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
  /** ★ 负向断言一律在**剥掉注释**的文本上做（本仓老坑，见 AGENTS §6）。
   *  下面每条禁令的字面量（占位、两段式换图）我都要在文件头的说明里写一遍 ——
   *  不剥注释的话，那些说明本身就是命中点，断言会恒红成"永远红"或"永远绿"。 */
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ');

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
      /* 老写法 `lbImg.src = href`：绕过了 showBig，于是拿不到 lazy→eager 的放行与
         优先级提升。（`removeAttribute('src')` 是关灯箱时摘掉的，合法，不在禁止之列。） */
      expect(code(src), `${name} 里还留着"直接设 src"那种老写法`).not.toMatch(/lbImg\.src\s*=/);
    }
  });

  it('★★ 灯箱直接上大档：不再拿缩略图占位（2026-10-15 站主「换成和大图尺寸一样」）', () => {
    /* 站主要的是"点开看到的就是那张图本身"。
       旧行为是先用已在缓存里的 800 档显形、再在后台换 1280 ——
       代价是有一段"看着是糊的"时间，正是这次要去掉的。
       实测（本站 82 帧）：1280 档 中位 92.1 KB / 均值 115.7 KB / 最大 475.1 KB，
       800 档 中位 53.2 KB —— 绝大多数帧差不到一倍，直接上大档通常更快见效。 */
    for (const [name, src] of [
      ['PhotoWall', PW],
      ['SpiralPlate', SP],
      ['big-image.ts', BI],
    ] as const) {
      expect(code(src), `${name} 里还留着"取缓存里的缩略图"那套占位`).not.toMatch(/thumbOf/);
    }
    /* 两段式换图（先 src=小、后台 decode 完再 src=大）整套拆掉 —— 只禁函数名不够，
       万一有人把占位换个名字接着用，那还是"先小后大"。 */
    expect(code(BI), '还留着"先设小档、后台再换大档"的两段式').not.toMatch(/pre\.src|pre\.decode/);
    /* ⚠ 第三个参数现在**合法存在**了，只是语义从"占位地址"变成"就绪回调" ——
       所以不能像本条早先那样笼统地禁"第三个参数"，要钉住它的**用途**：
       `img.src` 在 showBig 里**只准**被赋成大档本身。
       （早先两条按名字/前瞻写的都是弱判据：
         · `/small\??\s*:\s*string/` —— 参数改名成 onReady 就不响了；
         · `/img\.src\s*=\s*(?!big\b)/` —— **`\s*` 会回溯到零宽**，负向前瞻看到的
           是 `=` 后面的那个**空格**而不是 `big` ⇒ 恒红。
       ⇒ 改成"把每一处赋值的目标抠出来比对集合"，不依赖任何前瞻/回溯。
       同 AGENTS §5「判据要落在"这条数据是从哪来的"，不是"这个名字出现过"」。 */
    const assigned = [...code(BI).matchAll(/img\.src\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
    expect(assigned.length, 'showBig 里没找到 img.src 赋值（换图逻辑被改掉了？）').toBeGreaterThan(0);
    expect(
      [...new Set(assigned)],
      'showBig 里 img.src 被赋成了大档以外的东西（那是撤掉的占位那套）',
    ).toEqual(['big']);
  });

  it('★★ 说明文字必须等"图可绘制了"再换（站主「翻页照片卡一下但左上角文字已经变了」）', () => {
    /* 这条是**量出来的**，不是推的：localhost 起 dist，真点开连点 4 次「下一张」，
       同一 tick 里读 `lbPos/lbCap` 与 `img.complete` ——
       修之前每一步都是 `pos=7` 而 `complete=false / naturalWidth=0`（错帧，**每次**都发生）。
       ⇒ 两处调用都必须把说明文字写进 showBig 的第三个参数（就绪回调）里。 */
    expect(BI, 'showBig 没接第三个参数（就绪回调），说明文字无处安放')
      .toMatch(/onReady\?:\s*\(\(\)\s*=>\s*void\)\s*\|\s*null/);
    /* ⚠ 这条也排在上面那条**之前**：第三参数被改回字符串时，
       先撞上"没接回调"只会说"签名不对"，说不清是"退回占位地址那套"了（变异 #17）。 */
    for (const [name, src] of [
      ['PhotoWall', PW],
      ['SpiralPlate', SP],
    ] as const) {
      /* 反面：旧写法是 `showBig(...);` 之后同步写文字 ——
         判据认的是"**showBig 这通调用还没闭合**就已经在写 lbCap"，
         那个闭合记号就是 `);`。 */
      expect(
        code(src),
        `${name} 的说明文字写在 showBig(...) 返回之后 ⇒ 又变回同步改文字`,
      ).not.toMatch(/showBig\([\s\S]{0,400}?\);[\s\S]{0,400}?lbCap\.textContent/);
      expect(
        src,
        `${name} 没把说明文字放进 showBig 的就绪回调（文字会与图错帧）`,
      ).toMatch(/showBig\([\s\S]*?=>\s*\{[\s\S]*?lbCap\.textContent/);
    }
    /* 用 decode() 而不是 load：load 只保证字节到齐，中间还差一次解码 ⇒ 不是"同帧"。 */
    expect(BI, '换图该走 decode()（load 只保证字节到齐，不是"可绘制"）').toMatch(/\.decode\(\)/);
    /* 回调里必须再对一次"现在要的还是不是它"：翻页快时上一张的解码会晚回来。 */
    for (const [name, src] of [
      ['PhotoWall', PW],
      ['SpiralPlate', SP],
    ] as const) {
      expect(src, `${name} 的就绪回调没有竞态防护`).toMatch(/if\s*\(\s*\w+\s*!==\s*(cur|lbAt)\s*\)\s*return/);
    }
  });

  it('★★ 预取要**低优先级**、悬停要有 dwell 延迟（"点开才取"守的是量级，不是字面）', () => {
    /* 旧守则是"打开灯箱之前不许产生任何大档请求"。现在收窄成：
       页面加载时不取 · 指向一张并**停够久**才取那一张 · 打开后只多取紧邻的一张。
       全册 82 帧一次性拖进来（9.3 MB）仍然不做 —— 那才是这条主张要防的。
       实测（localhost、浏览器读 resource timing）：
         页面加载完 0 个 · 扫过一张就走 0 个 · 在一张上停 700 ms → 1 个 ·
         接着快速扫另外三张 → 仍然 1 个。 */
    expect(BI, '预取必须存在（否则每次翻页都要重新过一次网络：实测单张 269 ms）')
      .toMatch(/export function prefetch\(/);
    /* ⚠ 必须 low：给成 high 会出现"下一张先到、当前这张还在等"的倒挂。 */
    expect(BI, '预取没给 low 优先级 ⇒ 会跟当前要看的那张抢带宽')
      .toMatch(/fetchPriority\s*=\s*'low'/);
    /* dwell 是这一条的关键：指针扫过砖墙会一路触发 pointerenter（一次横扫七八张），
       没有延迟就是"扫一遍全册预取"。 */
    expect(BI, '悬停预取必须等停够久（不许 pointerenter 就取）').toMatch(
      /pointerenter[\s\S]{0,200}?setTimeout\(/,
    );
    expect(BI, '悬停预取的 dwell 形参不见了').toMatch(/dwell\s*=\s*(\d+)/);
    /* ★ 必须卡**取值下界**，不是只卡"有这个形参" ——
       变异验证第 16 条把 `dwell = 250` 改成 `0` 时，
       早先那条 `/dwell\s*=\s*\d+/` **照样绿**（0 也是数字）⇒ 门闩漏了它。
       这与 AGENTS §5「装饰性动效的契约只写上界 = 给"越漂越弱"发了许可证」同族：
       形参"存在"不是它起效的证据，"它是个真实的延迟"才是。
       250 ms 是站上实际操作里"手停下了 / 手在移动"的量级；给 0 就等于没有 dwell。 */
    const dwell = Number(BI.match(/dwell\s*=\s*(\d+)/)?.[1] ?? 0);
    expect(dwell, `悬停预取的 dwell 必须是真实延迟（当前 ${dwell} ms）`).toBeGreaterThanOrEqual(150);
    /* 两处调用都得预取紧邻的那一张 —— 只加一半等于翻页还是卡。 */
    for (const [name, src] of [
      ['PhotoWall', PW],
      ['SpiralPlate', SP],
    ] as const) {
      expect(src, `${name} 没接 prefetch`).toMatch(/prefetch\(\s*\{?\s*import|prefetch\(\s*(bigOf|items\[)/);
      expect(src, `${name} 没挂悬停预取（点开第一张还是会卡）`).toMatch(/intentPrefetch\(/);
    }
  });

  it('★★ 大档请求只许发生在"打开灯箱那一刻"', () => {
    /* 页面加载时就去拉大档，正是要避免的那件事。
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

  it('★ 翻页绕回同一张不许闪一下', () => {
    /* 判据要连 `src` 一起看 —— 关灯箱时会把它摘掉（"不留空 src"那条规定），
       只比 dataset 的话，再打开同一张就什么都不显示了。 */
    expect(BI, '同一张重设 src 会再闪一次（翻页绕回来时）⇒ 要连 src 一起判空').toMatch(
      /img\.dataset\.big === big && img\.getAttribute\('src'\)/,
    );
    expect(BI, '换图压根没记下当前是哪张 ⇒ 绕回来时无从判断').toMatch(/img\.dataset\.big = big/);
  });
});
