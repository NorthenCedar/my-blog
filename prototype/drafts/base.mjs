// prototype/drafts/base.mjs — 三套草案共享的排版底座
// 只放「机械部分」：重置、无障碍、正文 prose、代码块、表格、图片。
// 字号阶梯、行宽、网格这些**故意不在这里** —— 那正是三套草案要比的东西。

export const FONT = `"Archivo","Space Grotesk","Public Sans","IBM Plex Sans","Segoe UI Variable Display","Segoe UI",Arial,"Noto Sans SC","Microsoft YaHei",sans-serif`;
export const MONO = `"Ubuntu Sans Mono","JetBrains Mono",Consolas,"Lucida Console","Courier New",monospace`;

export function baseCss() {
  return `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0}
img,svg{max-width:100%;height:auto;display:block}
button{font:inherit;color:inherit}

:root{
  --ink:#0E0E0E;            /* 对白 19.3:1 */
  --paper:#FFFFFF;
  --muted:#5C5C5C;          /* 对白 6.4:1，可做正文级灰 */
  --hair:#D6D6D6;           /* 只做装饰线，不承载文字 */
  --accent:#E4572E;         /* 对白 3.68:1 —— 只允许 >=24px 大字 / hover / 图形 / 边框 */
  --accent-ink:#C2410C;     /* 对白 5.18:1 —— 小字专用 */
  --font:${FONT};
  --mono:${MONO};
  --fs-body:1.0625rem;
  --lh-body:1.75;
}

body{
  background:var(--paper);
  color:var(--ink);
  font-family:var(--font);
  font-size:var(--fs-body);
  line-height:var(--lh-body);
  text-rendering:optimizeLegibility;
}

/* ---------- 无障碍 ---------- */
:focus-visible{outline:3px solid var(--accent-ink);outline-offset:3px}
.skip{position:absolute;left:-9999px;top:0;background:var(--ink);color:var(--paper);padding:.6rem 1rem;z-index:99}
.skip:focus{left:0}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}

/* ---------- 正文 ---------- */
.prose{max-width:var(--measure)}
.prose p{margin:0 0 1.15em}
.prose h1,.prose h2,.prose h3,.prose h4{line-height:1.18;letter-spacing:-.012em;margin:2.2em 0 .55em;font-weight:700}
.prose h2{font-size:clamp(1.45rem,1.05rem + 1.5vw,2.1rem)}
.prose h3{font-size:clamp(1.15rem,1rem + .7vw,1.4rem)}
.prose h2:first-child,.prose h3:first-child{margin-top:0}
.prose a{color:inherit;text-decoration:underline;text-underline-offset:.18em;text-decoration-thickness:1px}
.prose a:hover{color:var(--accent-ink);text-decoration-thickness:2px}
.prose ul,.prose ol{margin:0 0 1.15em;padding-left:1.35em}
.prose li{margin:.4em 0}
.prose li>ul,.prose li>ol{margin:.4em 0}
.prose blockquote{margin:1.9em 0;padding:.1em 0 .1em 1.15em;border-left:4px solid var(--ink);color:var(--ink)}
.prose blockquote p:last-child{margin-bottom:0}
.prose hr{border:0;border-top:1px solid var(--hair);margin:2.4em 0}
.prose img{margin:1.7em 0;width:100%}
.prose code{font-family:var(--mono);font-size:.88em;background:#F2F1EF;padding:.12em .38em;border-radius:2px;overflow-wrap:break-word}
.prose strong{font-weight:700}
.prose em{font-style:italic}

/* ---------- 表格 ---------- */
.tablewrap{margin:1.9em 0;overflow-x:auto}
.prose table{border-collapse:collapse;width:100%;font-size:.95rem;line-height:1.55}
.prose th,.prose td{border-bottom:1px solid var(--hair);padding:.6em .8em .6em 0;text-align:left;vertical-align:top}
.prose th{font-weight:700;border-bottom:2px solid var(--ink);white-space:nowrap}

/* ---------- 代码块（阶段 2 决策：黑底白字）---------- */
.codeblock{margin:1.9em 0;background:var(--ink);color:#EDEDED;overflow:hidden}
.codeblock-bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.45rem .8rem;border-bottom:1px solid #333}
.codeblock-lang{font-family:var(--mono);font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#B4B4B4}
.codeblock-copy{background:none;border:1px solid #4A4A4A;color:#EDEDED;font-size:.72rem;padding:.22rem .55rem;cursor:pointer;letter-spacing:.06em}
.codeblock-copy:hover{background:#242424;border-color:#EDEDED}
.codeblock pre{margin:0;padding:1rem 1.1rem 1.15rem;overflow-x:auto}
.codeblock code{
  font-family:var(--mono);font-size:.85rem;line-height:1.72;color:#EDEDED;
  background:none;padding:0;border-radius:0;
  white-space:pre;            /* 块级用横向滚动（阶段 2 调研结论）*/
  display:block;
}

/* ---------- 通用零件 ---------- */
.badge-draft{
  display:inline-block;font-size:.68rem;letter-spacing:.16em;line-height:1.5;
  border:1px solid var(--accent-ink);color:var(--accent-ink);padding:0 .4em;vertical-align:.08em;
}
.taglist{display:flex;flex-wrap:wrap;gap:.45rem;list-style:none;margin:0;padding:0}
.taglist a{
  font-size:.78rem;letter-spacing:.04em;color:var(--muted);text-decoration:none;
  border:1px solid var(--hair);padding:.1em .5em;
}
.taglist a:hover{color:var(--accent-ink);border-color:var(--accent-ink)}

/* ---------- 原型自身的外壳（最终站点不会有这两条）---------- */
.protonote{
  border-bottom:1px solid var(--ink);background:var(--paper);color:var(--muted);
  font-family:var(--mono);font-size:.72rem;letter-spacing:.04em;padding:.5rem 1rem;text-align:center;
}
.protonote strong{color:var(--ink)}
.protopbar{
  position:fixed;left:0;right:0;bottom:0;z-index:50;
  display:flex;flex-wrap:wrap;gap:.4rem 1rem;align-items:center;justify-content:center;
  background:var(--ink);color:#EDEDED;font-size:.74rem;letter-spacing:.06em;padding:.55rem 1rem;
}
.protopbar a{color:#EDEDED;text-decoration:none;border-bottom:1px solid #5A5A5A;padding-bottom:1px}
.protopbar a:hover{border-color:var(--accent);color:#fff}
.protopbar a[aria-current="page"]{border-bottom-color:var(--accent);color:#fff}
.protopbar .pgroup{display:flex;gap:.6rem;align-items:center}
.protopbar .pgroup+.pgroup::before{content:"";width:1px;height:.9em;background:#5A5A5A;margin-right:.4rem}
body{padding-bottom:3.4rem}
`;
}

// 原型切换条：三套草案之间跳转（最终站点不会有）
export const SHORT_LABEL = {
  'piano-eight-level-and-after': '长文',
  'ai-built-this-blog': '技术文',
  'camera-in-gaosan': '短文',
};

export function protoBar({ key, slug = null, posts }) {
  const page = slug ? `post-${slug}.html` : 'index.html';
  const drafts = ['a', 'b', 'c']
    .map((k) => `<a href="../draft-${k}/${page}"${k === key ? ' aria-current="page"' : ''}>草案 ${k.toUpperCase()}</a>`)
    .join('');
  const pages = [
    `<a href="index.html"${!slug ? ' aria-current="page"' : ''}>首页</a>`,
    ...posts.map(
      (p) => `<a href="post-${p.slug}.html"${slug === p.slug ? ' aria-current="page"' : ''}>${SHORT_LABEL[p.slug] || p.title}</a>`
    ),
  ].join('');
  return `<nav class="protopbar" aria-label="原型切换"><span class="pgroup">${drafts}</span><span class="pgroup">${pages}</span></nav>`;
}
