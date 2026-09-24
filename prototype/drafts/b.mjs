// prototype/drafts/b.mjs — 草案 B · 海报式
// 思路：大色块 + 超大标题。首屏整块黑，文字压底对齐；列表用超大标题堆叠。
// 强调色在这里是**大面积**的（hover 整行标题变橙，因为字号远大于 24px，走 3:1 门槛）。
import { baseCss, protoBar } from './base.mjs';

const css =
  baseCss() +
  `
.wrap{max-width:82rem;margin:0 auto;padding:0 clamp(1rem,4vw,3rem)}

.band{background:var(--ink);color:var(--paper)}
.band-inner{min-height:min(74vh,42rem);display:flex;flex-direction:column;justify-content:space-between;gap:3rem;padding:1.3rem 0 2.4rem}
.brandline{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap}
.brandline .wm{color:var(--paper);text-decoration:none;font-weight:800;letter-spacing:-.01em;font-size:1rem}
.brandline .sub{font-family:var(--mono);font-size:.66rem;letter-spacing:.24em;text-transform:uppercase;color:#B4B4B4}
.nav a{color:#DEDEDE;font-size:.78rem;letter-spacing:.08em;text-decoration:none;margin-left:1.1rem}
.nav a:hover,.nav a[aria-current="page"]{color:var(--paper);box-shadow:inset 0 -2px 0 var(--accent)}
.band-title{font-size:clamp(2.8rem,13vw,8.5rem);line-height:.86;letter-spacing:-.045em;margin:0;font-weight:800}
.band-intro{max-width:33em;margin:1.9rem 0 0;font-size:1rem;line-height:1.75;color:#DEDEDE}

.poster-index{list-style:none;margin:0;padding:0;border-top:1px solid var(--ink)}
.poster-index li{border-bottom:1px solid var(--hair)}
.poster-index a{display:block;padding:clamp(1.2rem,3vw,2.1rem) 0;text-decoration:none;color:inherit}
.poster-date{font-family:var(--mono);font-size:.74rem;letter-spacing:.1em;color:var(--muted)}
.poster-title{display:block;font-size:clamp(1.6rem,1rem + 4.2vw,3.4rem);line-height:1.03;letter-spacing:-.032em;font-weight:800;margin:.4rem 0 .6rem;max-width:22em}
.poster-index a:hover .poster-title{color:var(--accent)}
.poster-summary{display:block;font-size:.92rem;color:var(--muted);max-width:40em}
.poster-tags{display:block;margin-top:.7rem;font-family:var(--mono);font-size:.72rem;color:var(--muted);letter-spacing:.06em}

.post-band{background:var(--ink);color:var(--paper)}
.post-band-inner{padding:clamp(2.4rem,7vw,5.5rem) 0 clamp(1.8rem,4vw,3rem)}
.post-title{font-size:clamp(1.9rem,1.1rem + 3.6vw,3.8rem);line-height:1.02;letter-spacing:-.035em;margin:0 0 1.1rem;font-weight:800;max-width:24em}
.post-meta{font-family:var(--mono);font-size:.74rem;letter-spacing:.08em;color:#B4B4B4;margin:0}
.post-body-wrap{padding:clamp(2rem,5vw,3.6rem) 0 clamp(3rem,8vw,5rem)}

.toc-strip{border-top:1px solid var(--ink);border-bottom:1px solid var(--hair);padding:1.1rem 0;margin:0 0 2.8rem}
.aside-label{display:block;font-family:var(--mono);font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
.toc-strip ol{list-style:none;margin:0;padding:0;columns:2;column-gap:2.4rem;font-size:.85rem;line-height:1.65}
.toc-strip li.lv3{padding-left:.9rem;color:var(--muted)}
.toc-strip a{color:inherit;text-decoration:none;border-bottom:1px solid transparent}
.toc-strip a:hover{color:var(--accent-ink);border-bottom-color:var(--accent-ink)}

.foot{background:var(--ink);color:#B4B4B4;padding:1.8rem 0 2.6rem}
.foot-inner{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.8rem}
.foot a{color:#DEDEDE}
.foot a:hover{color:var(--accent)}

@media (max-width:640px){
  .toc-strip ol{columns:1}
  .band-inner{min-height:min(64vh,32rem)}
}
`;

const NOTICE =
  '<div class="protonote">原型草案 <strong>B · 海报式</strong> · 一次性原型，不是最终站点 · 三套草案共用同一份真草稿</div>';

function masthead(SITE, current) {
  return `<header class="band"><div class="wrap band-inner">
<div class="brandline">
<a class="wm" href="index.html">${SITE.name}</a>
<span class="sub">${SITE.wordmark}</span>
<nav class="nav" aria-label="主导航">
<a href="index.html"${current === 'index' ? ' aria-current="page"' : ''}>文章</a><a href="#">标签</a><a href="#">关于</a><a href="#">RSS</a>
</nav>
</div>
<div>
<h1 class="band-title">${SITE.name}</h1>
<p class="band-intro">${SITE.intro}</p>
</div>
</div></header>`;
}

function footer(SITE) {
  return `<footer class="foot"><div class="wrap foot-inner">
<span>© 2026 ${SITE.name}</span>
<span><a href="mailto:${SITE.email}">${SITE.email}</a> · <a href="${SITE.github}" rel="me noopener">GitHub</a> · <a href="#">RSS</a></span>
</div></footer>`;
}

function tocStrip(POST) {
  if (!POST.headings.length) return '';
  const items = POST.headings
    .map((h) => `<li class="lv${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
    .join('');
  return `<nav class="toc-strip" aria-label="本文目录"><span class="aside-label">目录</span><ol>${items}</ol></nav>`;
}

export default {
  name: 'B · 海报式',
  css,

  index({ SITE, POSTS }) {
    const rows = POSTS.map(
      (p) => `<li><a href="${p.url}">
<span class="poster-date"><time datetime="${p.date}">${p.date}</time>${p.draft ? ' · 草稿' : ''}</span>
<span class="poster-title">${p.title}</span>
<span class="poster-summary">${p.summary}</span>
<span class="poster-tags">${p.tags.join(' / ')}</span>
</a></li>`
    ).join('\n');

    return `${NOTICE}
${masthead(SITE, 'index')}
<main id="main">
<section><div class="wrap" style="padding-top:clamp(2rem,5vw,3.4rem);padding-bottom:clamp(3rem,8vw,6rem)">
<h2 class="aside-label" style="margin-bottom:1.2rem">最近写的</h2>
<ul class="poster-index">
${rows}
</ul>
</div></section>
</main>
${footer(SITE)}
${protoBar({ key: 'b', posts: POSTS })}`;
  },

  post({ SITE, POST, ALL }) {
    return `${NOTICE}
<header class="post-band"><div class="wrap post-band-inner">
<div class="brandline" style="margin-bottom:clamp(1.6rem,4vw,3rem)">
<a class="wm" href="index.html">${SITE.name}</a>
<span class="sub">${SITE.wordmark}</span>
<nav class="nav" aria-label="主导航"><a href="index.html">文章</a><a href="#">标签</a><a href="#">关于</a><a href="#">RSS</a></nav>
</div>
<h1 class="post-title">${POST.title}</h1>
<p class="post-meta"><time datetime="${POST.date}">${POST.date}</time> · ${POST.chars} 字 · 约 ${POST.minutes} 分钟${POST.draft ? ' · 草稿' : ''} · ${POST.tags.join(' / ')}</p>
</div></header>
<main id="main"><div class="wrap post-body-wrap">
${tocStrip(POST)}
<div class="prose">
${POST.html}
</div>
</div></main>
${footer(SITE)}
${protoBar({ key: 'b', slug: POST.slug, posts: ALL })}`;
  },
};
