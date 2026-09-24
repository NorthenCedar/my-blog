// prototype/drafts/a.mjs — 草案 A · 索引式
// 思路：瑞士网格 + 目录式列表。桌面左侧留白克制、右侧信息分层；
// 强调色只出现在 hover 下划线、当前导航项、草稿标记。
import { baseCss, protoBar } from './base.mjs';

const css =
  baseCss() +
  `
.wrap{max-width:78rem;margin:0 auto;padding:0 clamp(1rem,4vw,3rem)}

.masthead{border-bottom:1px solid var(--ink)}
.masthead-inner{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap;padding:1.05rem 0}
.wordmark{display:flex;align-items:baseline;gap:.7rem;text-decoration:none;color:var(--ink);font-weight:800;letter-spacing:-.01em;font-size:1.05rem}
.wordmark-sub{font-family:var(--mono);font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);font-weight:400}
.nav a{font-size:.8rem;letter-spacing:.06em;color:var(--muted);text-decoration:none;margin-left:1.15rem}
.nav a:hover,.nav a[aria-current="page"]{color:var(--ink);box-shadow:inset 0 -2px 0 var(--accent)}

.hero{padding:clamp(2.6rem,9vw,7rem) 0 clamp(1.6rem,4vw,3.2rem);border-bottom:1px solid var(--ink)}
.hero-title{font-size:clamp(2.6rem,11vw,7rem);line-height:.92;letter-spacing:-.035em;margin:0;font-weight:800}
.hero-sub{font-family:var(--mono);font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin:.9rem 0 0}
.hero-intro{max-width:34em;margin:2.2rem 0 0;font-size:1.05rem}

.listwrap{padding-top:clamp(2rem,5vw,3.5rem);padding-bottom:clamp(3rem,8vw,6rem)}
.section-label{font-family:var(--mono);font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin:0 0 1.2rem;font-weight:400}
.index{list-style:none;margin:0;padding:0;border-top:1px solid var(--ink)}
.index li{border-bottom:1px solid var(--hair)}
.entry{display:grid;grid-template-columns:8rem minmax(0,1fr) 11rem;gap:1.4rem;align-items:baseline;padding:1.5rem 0;text-decoration:none;color:inherit}
.entry-date{font-family:var(--mono);font-size:.78rem;color:var(--muted)}
.entry-title{display:block;font-size:clamp(1.15rem,1rem + .9vw,1.7rem);font-weight:700;letter-spacing:-.018em;line-height:1.25}
.entry:hover .entry-title{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:.14em}
.entry-summary{display:block;margin-top:.5rem;font-size:.92rem;color:var(--muted);max-width:38em}
.entry-tags{font-size:.78rem;color:var(--muted);text-align:right}

.post-head{padding:clamp(2rem,5vw,3.4rem) 0 0}
.post-title{font-size:clamp(1.9rem,1.1rem + 3.4vw,3.6rem);line-height:1.02;letter-spacing:-.03em;margin:0 0 1rem;font-weight:800}
.post-meta{font-family:var(--mono);font-size:.75rem;letter-spacing:.06em;color:var(--muted);margin:0 0 2.2rem}
.post-layout{display:grid;grid-template-columns:11rem minmax(0,1fr);gap:clamp(1.5rem,5vw,4.5rem);padding:0 0 clamp(3rem,8vw,5rem)}
.post-aside{position:sticky;top:1.4rem;align-self:start;font-size:.8rem;color:var(--muted)}
.aside-block{margin-bottom:1.3rem}
.aside-label{display:block;font-family:var(--mono);font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--ink);margin-bottom:.35rem}
.toc ol{list-style:none;margin:0;padding:0;font-size:.8rem;line-height:1.5}
.toc li{margin:.25rem 0}
.toc li.lv3{padding-left:.9rem;color:var(--muted)}
.toc a{color:inherit;text-decoration:none}
.toc a:hover{color:var(--accent-ink);text-decoration:underline}

.foot{border-top:1px solid var(--ink);padding:1.6rem 0 2.4rem}
.foot-inner{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}
.foot a{color:var(--muted)}
.foot a:hover{color:var(--accent-ink)}

@media (max-width:860px){
  .entry{grid-template-columns:1fr;gap:.55rem}
  .entry-tags{text-align:left}
  .post-layout{grid-template-columns:1fr;gap:1.6rem}
  .post-aside{position:static;display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:1rem}
  .toc{grid-column:1/-1}
}
`;

const NOTICE =
  '<div class="protonote">原型草案 <strong>A · 索引式</strong> · 一次性原型，不是最终站点 · 三套草案共用同一份真草稿</div>';

function masthead(SITE, current) {
  return `<header class="masthead"><div class="wrap masthead-inner">
<a class="wordmark" href="index.html">${SITE.name}<span class="wordmark-sub">${SITE.wordmark}</span></a>
<nav class="nav" aria-label="主导航">
<a href="index.html"${current === 'index' ? ' aria-current="page"' : ''}>文章</a><a href="#">标签</a><a href="#">关于</a><a href="#">RSS</a>
</nav>
</div></header>`;
}

function footer(SITE) {
  return `<footer class="foot"><div class="wrap foot-inner">
<span>© 2026 ${SITE.name}</span>
<span><a href="mailto:${SITE.email}">${SITE.email}</a> · <a href="${SITE.github}" rel="me noopener">GitHub</a> · <a href="#">RSS</a></span>
</div></footer>`;
}

function tocOf(POST) {
  if (!POST.headings.length) return '';
  const items = POST.headings
    .map((h) => `<li class="lv${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
    .join('');
  return `<nav class="toc" aria-label="本文目录"><span class="aside-label">目录</span><ol>${items}</ol></nav>`;
}

export default {
  name: 'A · 索引式',
  css,

  index({ SITE, POSTS }) {
    const rows = POSTS.map(
      (p) => `<li><a class="entry" href="${p.url}">
<span class="entry-date"><time datetime="${p.date}">${p.date}</time></span>
<span><span class="entry-title">${p.title}${p.draft ? ' <span class="badge-draft">草稿</span>' : ''}</span><span class="entry-summary">${p.summary}</span></span>
<span class="entry-tags">${p.tags.join(' · ')}</span>
</a></li>`
    ).join('\n');

    return `${NOTICE}
${masthead(SITE, 'index')}
<main id="main">
<section class="hero"><div class="wrap">
<h1 class="hero-title">${SITE.name}</h1>
<p class="hero-sub">${SITE.wordmark}</p>
<p class="hero-intro">${SITE.intro}</p>
</div></section>
<section class="listwrap"><div class="wrap">
<h2 class="section-label">最近写的</h2>
<ul class="index">
${rows}
</ul>
</div></section>
</main>
${footer(SITE)}
${protoBar({ key: 'a', posts: POSTS })}`;
  },

  post({ SITE, POST, ALL }) {
    return `${NOTICE}
${masthead(SITE, 'post')}
<main id="main">
<div class="wrap post-head">
<h1 class="post-title">${POST.title}</h1>
<p class="post-meta"><time datetime="${POST.date}">${POST.date}</time> · ${POST.chars} 字 · 约 ${POST.minutes} 分钟${POST.draft ? ' · <span class="badge-draft">草稿</span>' : ''}</p>
</div>
<div class="wrap post-layout">
<aside class="post-aside">
<div class="aside-block"><span class="aside-label">标签</span><ul class="taglist">${POST.tags
      .map((t) => `<li><a href="#">${t}</a></li>`)
      .join('')}</ul></div>
${tocOf(POST)}
</aside>
<div class="post-body prose">
${POST.html}
</div>
</div>
</main>
${footer(SITE)}
${protoBar({ key: 'a', slug: POST.slug, posts: ALL })}`;
  },
};
