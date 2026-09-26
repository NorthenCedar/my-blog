import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { bootCss, boundClasses } from '../src/lib/boot-css';
import * as T from '../src/lib/boot-tracks';

const DIST_INDEX = 'dist/index.html';

/**
 * 首页开场动画的**静态契约**（增量 1–2：覆盖层还没挂到首页，所以这里不碰 dist/）。
 *
 * 与 B2 的分工一样：浏览器级的三态/逐帧抽样属于 `scripts/verify-boot-intro.mjs`（增量 5），
 * 本文件守"不打开浏览器也能查"的那一半。
 *
 * 输出规矩（台账 21a5c66）：每条断言都要能反推出「验的是什么、实测多少」，禁止裸 PASS。
 */
const CSS = bootCss();
const COMPONENT = 'src/components/BootIntro.astro';
const SRC = readFileSync(COMPONENT, 'utf8');

const count = (re: RegExp) => (CSS.match(re) ?? []).length;

describe('开场动画：生成器产出', () => {
  it('产出了一份包含全部关键帧的 CSS（记录条数与字节数）', () => {
    const names = [...CSS.matchAll(/@keyframes\s+([\w-]+)\{/g)].map((m) => m[1]);
    const stops = count(/\}/g);
    const bytes = Buffer.byteLength(CSS, 'utf8');
    console.log(
      `判据 生成器产出 对象 bootCss() 实测: ${names.length} 条 @keyframes / 约 ${stops} 个声明块 / ${bytes} 字节`,
    );
    expect(names.length, '关键帧条数').toBeGreaterThan(40);
    expect(names, '时钟关键帧（收尾靠它）').toContain('boot-clock');
    expect(names, 'Logo 轮廓描边').toContain('boot-logo-dash');
    expect(names, '双环半径').toContain('boot-arc-outer-r');
    expect(names, '北斗六点生长（逐颗一条绝对时间轴规则）').toContain('boot-sat-0-r');
    expect(names, '北斗第六颗的生长规则').toContain('boot-sat-5-r');
    expect(bytes, 'CSS 字节数').toBeGreaterThan(8000);
  });

  it('生成的 CSS 结构自洽：括号配平 + 每条 animation 都能找到对应的 @keyframes', () => {
    const open = (CSS.match(/\{/g) ?? []).length;
    const close = (CSS.match(/\}/g) ?? []).length;
    expect(open, `花括号不配平：开 ${open} / 闭 ${close}`).toBe(close);

    const defined = new Set([...CSS.matchAll(/@keyframes\s+([\w-]+)\{/g)].map((m) => m[1]));
    // animation 简写里的第一个 token 是名字，后面跟时长等；只取形如 boot-xxx 的 token
    const used = new Set(
      [...CSS.matchAll(/animation:([^;}]+)/g)]
        .flatMap((m) => m[1].split(','))
        .map((chunk) => chunk.trim().split(/\s+/)[0])
        .filter((name) => name.startsWith('boot-')),
    );
    const dangling = [...used].filter((name) => !defined.has(name));
    console.log(
      `判据 CSS 自洽 对象 ${defined.size} 条关键帧 / ${used.size} 个被引用名 实测: 花括号 ${open}/${close} · 悬空引用 ${dangling.length}${dangling.length ? `（${dangling.join(', ')}）` : ''}`,
    );
    expect(dangling, 'animation 引用了不存在的 @keyframes（那条动画不会跑）').toEqual([]);
  });

  it('总时长 20.16 s 由 token 提供，不是散落的字面量', () => {    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    const uses = count(/var\(--dur-boot\)/g);
    console.log(
      `判据 时长走 token 对象 --dur-boot / --dur-boot-out 实测: TOTAL_MS=${T.TOTAL_MS} · var(--dur-boot) 被引用 ${uses} 次`,
    );
    expect(T.TOTAL_MS, '504 帧 @25fps').toBe(20160);
    expect(T.SPAN).toBe(504);
    expect(tokens, 'tokens.css 缺 --dur-boot').toContain('--dur-boot: 20160ms');
    expect(tokens, 'tokens.css 缺 --dur-boot-out').toContain('--dur-boot-out: 400ms');
    expect(uses, 'var(--dur-boot) 引用次数').toBeGreaterThan(40);
  });

  it('关键百分比停点落在算出来的位置（帧 → %）', () => {
    // 这几个是段边界与闪变帧，抄错一位整个节奏就错
    const sentinels: [number, string][] = [
      [169, '0%'],
      [226, '11.3095%'],
      [229, '11.9048%'],
      [487, '63.0952%'],
      [568, '79.1667%'],
      [569, '79.3651%'],
      [673, '100%'],
    ];
    for (const [frame, str] of sentinels) {
      const pctStr = `${Math.round(T.pct(frame) * 10000) / 10000}%`;
      expect(pctStr, `帧 ${frame} 的百分比`).toBe(str);
      expect(CSS, `产物 CSS 里没有 ${str} 这个停点`).toContain(str);
    }
    console.log(`判据 关键停点 对象 ${sentinels.length} 个段边界/闪变帧 实测: 与算式逐个一致`);
  });

  it('授权线回归网：产物与模板里不出现上游的品牌字样（#13）', () => {
    // 文案的真源是 boot-tracks.ts 的 TEXT（模板里写的是表达式，不是字面量）—— 三处都要查
    const all = `${CSS}\n${SRC}\n${JSON.stringify(T.TEXT)}`;
    // 禁的是**上游那几串原文**，不是子串：'SING' 会命中我们保留的 'PROCESSING'（#11 明确保留它）
    const banned = ['RHINE LAB', 'RHINE·LAB', 'RHINE LAB.LLC.', 'JOYCE MOORE', 'SING...'];
    for (const word of banned) {
      expect(all.includes(word), `开场相关文件里出现了上游原文 ${word}`).toBe(false);
    }
    expect(T.TEXT.brand1, '品牌第一行').toBe('NORTH CEDAR');
    expect(T.TEXT.logoWord, 'Logo 内文字').toBe('NORTH·CEDAR');
    expect(T.TEXT.company, '欢迎段公司名').toBe('NORTH CEDAR.LLC.');
    expect(T.TEXT.powered, '右下角').toBe('POWERED BY NORTH CEDAR');
    expect(T.TEXT.authName, '身份第二句（与 JOYCE MOORE 同为 11 字）').toBe('NORTH CEDAR');
    expect(T.TEXT.authGlitch, '故障词').toContain('LINK...');
    expect(T.TEXT.authGlitch.length, '故障串与原串等长（14 空格 + 7 字）').toBe(21);
    expect(SRC, '模板应当引用 TEXT 而不是写死文案').toContain('TEXT.skip');
    console.log(
      `判据 授权线 对象 ${banned.join('/')} 实测: 三处均未出现；NORTH CEDAR / NORTH·CEDAR / POWERED BY NORTH CEDAR / LINK... 均在位`,
    );
  });

  it('逐字表：ACCESS 26 字（170–187 帧）、名字 11 字，延迟单调不减', () => {
    const access = T.accessSpans(T.TEXT.access);
    const name = T.typedSpans(T.TEXT.authName, T.AUTH.nameWindow[0], T.AUTH.nameWindow[1]);
    console.log(
      `判据 逐字表 对象 access/name 实测: ACCESS ${access.length} 字（首字 ${access[0].frame} 帧、末字 ${access[access.length - 1].frame} 帧）· 名字 ${name.length} 字`,
    );
    expect(access.length, 'ACCESS 字数').toBe(T.TEXT.access.length);
    expect(access.length).toBe(26);
    expect(access[0].frame).toBe(170);
    expect(access[25].frame).toBe(187);
    expect(name.length, 'NORTH CEDAR 与 JOYCE MOORE 同为 11 字 ⇒ 逐字帧不用重算').toBe(11);
    const frames = access.map((c) => c.frame);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i], `第 ${i + 1} 字的出现帧不该早于第 ${i} 字`).toBeGreaterThanOrEqual(frames[i - 1]);
    }
  });

  it('错峰走"每行/每颗一条绝对时间轴规则"，且不残留 delay 机制（整层必须能被 seek 到任意绝对帧）', () => {
    // 这条是实测逼出来的：用 animation-delay 错峰会把品牌/卫星放到"相对自己的时间轴"上，
    // 于是"一个 currentTime = 一个绝对帧"就不成立（截图验收到 268 帧会看见本该 278 帧才入场的字）。
    const kfBody = (name: string): string => {
      const at = CSS.indexOf(`@keyframes ${name}{`);
      if (at < 0) return '';
      const open = CSS.indexOf('{', at);
      let depth = 0;
      for (let i = open; i < CSS.length; i++) {
        if (CSS[i] === '{') depth++;
        else if (CSS[i] === '}') {
          depth--;
          if (depth === 0) return CSS.slice(open, i + 1);
        }
      }
      return '';
    };
    const want = ['boot-brand-1-op', 'boot-brand-1-x', 'boot-brand-2-op', 'boot-brand-3-op', 'boot-sat-t'];
    for (let i = 0; i < T.SATELLITE_COUNT; i++) want.push(`boot-sat-${i}-r`);
    const missing = want.filter((n) => !kfBody(n));
    expect(missing, `缺这些规则：${missing.join(', ')}`).toEqual([]);
    expect(CSS, '残留了 --line-delay 错峰机制').not.toContain('--line-delay');
    expect(CSS, '残留了 --sat-delay 错峰机制').not.toContain('--sat-delay');

    // 三行的"提前一帧"停点必须落在各自的时间轴上：277 / 279 / 281 帧
    const starts: [string, number][] = [
      ['boot-brand-1-op', T.BRAND_START_FRAME - 1],
      ['boot-brand-2-op', T.BRAND_START_FRAME + 1],
      ['boot-brand-3-op', T.BRAND_START_FRAME + 3],
    ];
    for (const [name, frame] of starts) {
      const pctStr = `${Math.round(T.pct(frame) * 10000) / 10000}%`;
      expect(kfBody(name), `${name} 里没有 ${pctStr}（该行的起点不在自己的时间轴上）`).toContain(pctStr);
    }
    // 卫星第 0 颗从 547 帧（= 出现帧 548 的前一帧）开始长：t.pct(547) 恰好是 75%
    expect(kfBody('boot-sat-0-r'), '第 0 颗卫星的起点不对').toContain(`${Math.round(T.pct(547) * 10000) / 10000}%`);
    expect(kfBody('boot-sat-1-r'), '第 1 颗应比第 0 颗晚 3 帧').toContain(
      `${Math.round(T.pct(550) * 10000) / 10000}%`,
    );
    console.log(
      `判据 绝对时间轴 对象 ${want.length} 条错峰规则 + 三行/六点的起点停点 实测: 全部就位 · pct(547)=${Math.round(T.pct(547) * 10000) / 10000}%（第 0 颗卫星）`,
    );
  });
});

describe('开场动画：与模板的对账', () => {
  it('CSS 里绑定了动画的类，模板里都真的存在', () => {
    const bound = boundClasses();
    const missing = bound.filter((cls) => !SRC.includes(cls));
    console.log(
      `判据 类名对账 对象 ${bound.length} 个被绑定的类 实测: 模板缺失 ${missing.length} 个${missing.length ? `（${missing.join(', ')}）` : ''}`,
    );
    expect(missing, 'CSS 绑了动画却没有对应元素 = 那条动画永远不跑').toEqual([]);
  });

  it('装饰子树 aria-hidden，skip 按钮在它外面（aria-hidden 里不许有可聚焦元素）', () => {
    expect(SRC, '装饰层缺少 aria-hidden').toContain('class="boot-deco" aria-hidden="true"');
    const btnAt = SRC.indexOf('class="boot-skip"');
    expect(btnAt, '模板里没有 skip 按钮').toBeGreaterThan(-1);
    const before = SRC.slice(0, btnAt);
    const open = (before.match(/<div\b/g) ?? []).length;
    const close = (before.match(/<\/div>/g) ?? []).length;
    console.log(
      `判据 aria 结构 对象 按钮之前的 <div> 配对 实测: 开 ${open} / 闭 ${close} ⇒ 未闭合 ${open - close}（应为 1 = 只剩覆盖层根）`,
    );
    // 只剩覆盖层根还开着 ⇒ 装饰子树已闭合 ⇒ 按钮不在 aria-hidden 里
    expect(open - close, 'skip 按钮被包进了 aria-hidden 子树').toBe(1);
    expect(SRC, 'skip 按钮必须是真 button').toMatch(/<button[^>]*class="boot-skip"[^>]*type="button"/);
  });

  it('门控方向：默认不显示，只有 JS 判定该播才加 .boot-on；小屏与 reduced-motion 不播', () => {
    const checks: [string, boolean][] = [
      ['html:not(.boot-on) 隐藏', CSS.includes('html:not(.boot-on) [data-boot-overlay]{display:none}')],
      ['锁滚动挂在 .boot-on 上', CSS.includes('html.boot-on{overflow:hidden}')],
      ['≤767px 不播', CSS.includes('@media (max-width:767px)')],
      ['reduced-motion 不播', CSS.includes('@media (prefers-reduced-motion:reduce)')],
      // 除数必须带单位：calc(100vw / 1920) 是长度，scale() 要纯数（实测的坑，别改回去）
      ['舞台 1920 基准 + 等比缩放', CSS.includes('min(calc(100vw / 1920px), calc(100dvh / 1080px))')],
    ];
    for (const [label, ok] of checks) expect(ok, label).toBe(true);
    console.log(`判据 门控 对象 ${checks.length} 条样式约定 实测: 全部命中（默认不显示 = 无 JS/reduced/小屏/已播四种情形都安全）`);
  });
});

/**
 * 「覆盖层是纯增量」——#21 的可复核判据（本轮基线还在时有效，基线清掉后自动跳过）。
 *
 * 做法：把本轮**故意**加进去的东西从产物首页里摘掉，看剩下的 `<main>` 能不能与**挂载前**的基线逐字节相同：
 *   · 覆盖层整块（按 `data-boot-overlay` 起点做 div 配对切出）
 *   · 两段脚本：开场门控（含 `classList.add('js')`）与覆盖层行为（含 `data-boot-overlay`）
 *     —— **两侧都摘**：门控脚本在基线里本来就有（只是变长了），拿它当差异就不是"正文被改了"。
 *     Astro 会把组件里的 `<script>` 提到槽首，所以只能按内容认、不能假设位置。
 *   · h1 上的 `tabindex="-1"`（决策 #16 交回焦点用）
 * 三样都摘干净后还一样 ⇒ 首页正文一个字没动，覆盖层确实只是"盖上去的装饰"。
 */
const BASELINE = '<本机工作区>\\_tmp-dist-boot-before\\index.html';
describe.skipIf(!existsSync(DIST_INDEX) || !existsSync(BASELINE))('B3 交付：覆盖层是纯增量（#21）', () => {
  const normalize = (s: string) =>
    s
      .replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '')
      .replace(/\[data-astro-cid-[a-z0-9]+\]/g, '');
  const stripFeatureScripts = (html: string) =>
    html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (block) =>
      block.includes('data-boot-overlay') || block.includes("classList.add('js')") ? '' : block,
    );
  const mainOf = (html: string) => normalize((html.match(/<main[\s\S]*?<\/main>/) ?? [''])[0]);

  it('摘掉"覆盖层 + 两段脚本 + tabindex"后，首页 <main> 与基线逐字节相同', () => {
    const before = mainOf(stripFeatureScripts(readFileSync(BASELINE, 'utf8')));
    let after = readFileSync(DIST_INDEX, 'utf8');

    // ① 覆盖层整块：从 data-boot-overlay 起点按 div 配对切到闭合
    const start = after.indexOf('<div class="boot" data-boot-overlay>');
    expect(start, '产物里找不到覆盖层根').toBeGreaterThan(-1);
    let depth = 0;
    let end = -1;
    const tagRe = /<\/?div\b/g;
    tagRe.lastIndex = start;
    for (let m = tagRe.exec(after); m; m = tagRe.exec(after)) {
      depth += m[0] === '</div' ? -1 : 1;
      if (depth === 0) {
        end = after.indexOf('>', m.index) + 1;
        break;
      }
    }
    expect(end, '覆盖层的 div 没配对闭合').toBeGreaterThan(start);
    after = after.slice(0, start) + after.slice(end);

    // ② 两段脚本（两侧都摘）
    const beforeStrip = after.length;
    after = stripFeatureScripts(after);
    expect(beforeStrip - after.length, '产物里没找到本轮新加的两段脚本').toBeGreaterThan(500);

    // ③ h1 的 tabindex
    after = after.replace(/(<h1 class="display") tabindex="-1"/, '$1');

    const now = mainOf(after);
    console.log(
      `判据 纯增量 对象 首页 <main>（摘掉覆盖层/门控脚本/tabindex 后）实测: 与基线${now === before ? '逐字节相同' : '存在差异'} · ${before.length} → ${now.length} 字节`,
    );
    if (now !== before) {
      let i = 0;
      while (i < Math.min(before.length, now.length) && before[i] === now[i]) i++;
      console.log(
        `  首个差异 @${i}\n    基线: ${JSON.stringify(before.slice(Math.max(0, i - 90), i + 130))}\n    现在: ${JSON.stringify(now.slice(Math.max(0, i - 90), i + 130))}`,
      );
    }
    expect(now).toBe(before);
  });
});
