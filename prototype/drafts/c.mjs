// prototype/drafts/c.mjs — 草案 C · 印刷品
// 思路：极致克制。没有色块、没有超大标题、没有橙色，靠细线和留白分层。
// 这是三套里最"安静"的一套，用来对照：如果 A/B 太吵，退到这里。
// 唯一显眼的强调色用法是焦点环和链接 hover。
import { baseCss, protoBar } from './base.mjs';

const css =
  baseCss() +
  `
.sheet{max-width:46rem;margin:0 auto;padding:0 clamp(1.1rem,5vw,2rem)}

.masthead{padding:2.2rem 0 1.1rem;border-bottom:1px solid var(--ink)}
.masthead-inner{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap}
.wordmark{display:flex;align-items:baseline;gap:.6rem;text-decoration:none;color:var(--ink);font-weight:700;font-size:.98rem;letter-spacing:.01em}
.wordmark-sub{font-family:var(--mono);font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:400}
.nav a{font-size:.8rem;color:var(--muted);text-decoration:none;margin-left:1.1rem}
.nav a:hover,.nav a[aria-current="page"]{color:var(--accent-ink);text-decoration:underline;text-underline-offset:.2em}

.lede{font-size:1.08rem;line-height:1.9;margin:2.6rem 0 3.2rem;color:var(--ink)}
.lede .sig{display:block;margin-top:1rem;font-family:var(--mono);font-size:.72rem;letter-spacing:.08em;color:var(--muted)}

.section-label{font-family:var(--mono);font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin:0 0 .9rem;font-weight:400}
.toc-index{list-style:none;margin:0;padding:0;border-top:1px solid var(--ink)}
.toc-index li{border-bottom:1px solid var(--hair)}
.entry{display:grid;grid-template-columns:6.5rem minmax(0,1fr);gap:1.3rem;padding:1.25rem 0;text-decoration:none;color:inherit;align-items:baseline}
.entry-date{font-family:var(--mono);font-size:.74rem;color:var(--muted);display:block}
.entry-title{display:block;font-size:clamp(1.05rem,1rem + .5vw,1.3rem);font-weight:700;line-height:1.35;letter-spacing:-.008em}
.entry:hover .entry-title{text-decoration:underline;text-underline-offset:.18em}
.entry-summary{display:block;margin-top:.45rem;font-size:.9rem;line-height:1.7;color:var(--muted)}
.entry-meta{display:block;margin-top:.5rem;font-family:var(--mono);font-size:.7rem;color:var(--muted);letter-spacing:.05em}

.post-head{padding:2.8rem 0 0}
.post-title{font-size:clamp(1.6rem,1.15rem + 1.9vw,2.4rem);line-height:1.22;letter-spacing:-.018em;margin:0 0 .9rem;font-weight:700}
.post-meta{font-family:var(--mono);font-size:.72rem;letter-spacing:.05em;color:var(--muted);margin:0 0 2.4rem;padding-bottom:1.1rem;border-bottom:1px solid var(--hair)}
.post-aside{margin:0 0 2.6rem;padding:1.1rem 1.2rem;border:1px solid var(--hair);background:#FAFAF9}
.aside-label{display:block;font-family:var(--mono);font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
.toc ol{list-style:none;margin:0;padding:0;columns:2;column-gap:2rem;font-size:.84rem;line-height:1.7}
.toc li.lv3{padding-left:.9rem;color:var(--muted)}
.toc a{color:inherit;text-decoration:none}
.toc a:hover{color:var(--accent-ink);text-decoration:underline}

.foot{border-top:1px solid var(--ink);padding:1.6rem 0 2.4rem;margin-top:clamp(2rem,6vw,4rem)}
.foot-inner{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.78rem;color:var(--muted)}
.foot a{color:var(--muted)}
.foot a:hover{color:var(--accent-ink)}

@media (max-width:620px){
  .entry{grid-template-columns:1fr;gap:.35rem}
  .entry-date{order:-1}
  .toc ol{columns:1}
}
`;

const NOTICE =
  '<div class="protonote">原型草案 <strong>C · 印刷品</strong> · 一次性原型，不是最终站点 · 三套草案共用同一份真草稿</div>';

function masthead(SITE, current) {
  return `<header class="masthead"><div class="sheet masthead-inner">
<a class="wordmark" href="index.html">${SITE.name}<span class="wordmark-sub">${SITE.wordmark}</span></a>
<nav class="nav" aria-label="主导航">
<a href="index.html"${current === 'index' ? ' aria-current="page"' : ''}>文章</a><a href="#">标签</a><a href="#">关于</a><a href="#">RSS</a>
</nav>
</div></header>`;
}

function footer(SITE) {
  return `<footer class="foot"><div class="sheet foot-inner">
<span>© 2026 ${SITE.name}</span>
<span><a href="mailto:${SITE.email}">${SITE.email}</a> · <a href="${SITE.github}" rel="me noopener">GitHub</a> · <a href="#">RSS</a></span>
</div></footer>`;
}

function tocBox(POST) {
  if (!POST.headings.length) return '';
  const items = POST.headings
    .map((h) => `<li class="lv${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
    .join('');
  return `<nav class="post-aside toc" aria-label="本文目录"><span class="aside-label">目录</span><ol>${items}</ol></nav>`;
}

export default {
  name: 'C · 印刷品',
  css,

  index({ SITE, POSTS }) {
    const rows = POSTS.map(
      (p) => `<li><a class="entry" href="${p.url}">
<span class="entry-date"><time datetime="${p.date}">${p.date}</time></span>
<span><span class="entry-title">${p.title}</span><span class="entry-summary">${p.summary}</span><span class="entry-meta">${p.tags.join(' / ')}${p.draft ? ' · 草稿' : ''}</span></span>
</a></li>`
    ).join('\n');

    return `${NOTICE}
${masthead(SITE, 'index')}
<main id="main"><div class="sheet">
<p class="lede">${SITE.intro}<span class="sig">${SITE.wordmark}</span></p>
<h2 class="section-label">最近写的</h2>
<ul class="toc-index">
${rows}
</ul>
</div></main>
${footer(SITE)}
${protoBar({ key: 'c', posts: POSTS })}`;
  },

  post({ SITE, POST, ALL }) {
    return `${NOTICE}
${masthead(SITE, 'post')}
<main id="main"><div class="sheet">
<div class="post-head">
<h1 class="post-title">${POST.title}</h1>
<p class="post-meta"><time datetime="${POST.date}">${POST.date}</time> · ${POST.chars} 字 · 约 ${POST.minutes} 分钟 · ${POST.tags.join(' / ')}${POST.draft ? ' · 草稿' : ''}</p>
</div>
${tocBox(POST)}
<div class="prose">
${POST.html}
</div>
</div></main>
${footer(SITE)}
${protoBar({ key: 'c', slug: POST.slug, posts: ALL })}`;
  },
};
