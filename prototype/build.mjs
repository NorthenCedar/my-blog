// prototype/build.mjs — 一次性生成器（用完即弃，不是产品代码）
//
// 作用：把 content/posts/*/index.md（真草稿）转成 HTML，注入 3 套草案模板。
// 产物：prototype/draft-{a,b,c}/{index,post}.html —— 每个文件自包含、无依赖、双击即开。
// 用法：node prototype/build.mjs
//
// 为什么要生成器而不是手抄：三套草案用的是同一份真实内容，手抄三遍既有转录误差，
// 又会让「比较版式」变成「比较我的打字」。内容永远来自 content/ 下的真文件。

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const POSTS_DIR = join(ROOT, 'content', 'posts');

// ---------------------------------------------------------------- 站点信息
const SITE = {
  name: '北杉札记',
  wordmark: "North_Cedar's notes",
  intro:
    '你好，我是郑云嘉，合肥人，安徽大学大一在读。小学把钢琴弹到了八级，跳过几年 locking，高三开始拍照，中途还学过跆拳道、游泳、围棋、机器人和一段无疾而终的 C++——学过的东西很多，真正留下的不多，这个博客就用来存放留下来的那些。我在这里写随笔、放照片、记一些用 AI 折腾项目的经历。写得好不好另说，先写。',
  metaDescription: '你好，我是郑云嘉，合肥人，安徽大学大一在读。学过钢琴、街舞、跆拳道、围棋……大部分半途而废，这个博客存放留下来的那些：随笔、照片，以及用 AI 折腾项目的记录。写得好不好另说，先写。',
  email: 'a13655515876@163.com',
  github: 'https://github.com/NorthenCedar',
};

// ---------------------------------------------------------------- Markdown → HTML
// 只实现本博客实际用到的子集：标题/段落/引用/有序无序列表(含嵌套)/围栏代码/GFM 表格/
// 行内代码/粗体/斜体/链接/图片。够用就行 —— 这是原型，不是解析器。

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(src) {
  const codes = [];
  // 行内代码先摘出来，避免里面的 * 和 [] 被后续规则误伤
  let s = src.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000C${codes.length - 1}\u0000`;
  });
  s = esc(s);
  // 图片必须在链接之前处理
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src2) => {
    // 产物在 prototype/draft-x/ 下，回退两级才是仓库根
    const abs = src2.replace(/^\.\//, `../../content/posts/@@SLUG@@/`);
    return `\u0000I${alt}\u0000${abs}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s（(])\*([^*\n]+)\*(?=[\s）)。，、]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000I([^\u0000]*)\u0000([^\u0000]*)\u0000/g, (_, alt, src2) => {
    const a = alt ? ` alt="${alt}"` : ' alt=""';
    return `<img src="${src2}"${a} loading="lazy" decoding="async">`;
  });
  s = s.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

function parseMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let hCount = 0;
  let i = 0;

  const flushPara = (buf) => {
    if (!buf.length) return;
    out.push(`<p>${inline(buf.join(' '))}</p>`);
    buf.length = 0;
  };

  const para = [];
  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara(para);
      const lang = fence[1] || 'text';
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // 跳过收尾围栏
      out.push(
        `<figure class="codeblock" data-lang="${lang}">` +
          `<figcaption class="codeblock-bar"><span class="codeblock-lang">${lang}</span>` +
          `<button type="button" class="codeblock-copy" data-copy>复制</button></figcaption>` +
          `<pre><code class="language-${lang}">${esc(body.join('\n'))}</code></pre></figure>`
      );
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(para);
      const level = h[1].length;
      const id = `sec-${++hCount}`;
      headings.push({ level, text: h[2].trim(), id });
      out.push(`<h${level} id="${id}">${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // 引用块
    if (/^>\s?/.test(line)) {
      flushPara(para);
      const body = [];
      while (i < lines.length && (/^>\s?/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() === '' && !/^>\s?/.test(lines[i + 1] || '')) break;
        body.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${parseMarkdown(body.join('\n')).html}</blockquote>`);
      continue;
    }

    // GFM 表格：表头行 + 分隔行
    if (/\|/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      flushPara(para);
      const cells = (l) =>
        l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        `<div class="tablewrap"><table><thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }

    // 列表（有序/无序，含 2 空格缩进嵌套）
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flushPara(para);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        items.push({ indent: Math.floor(m[1].length / 2), ordered: /\d/.test(m[2]), text: m[3] });
        i++;
      }
      const render = (idx, depth) => {
        const ordered = items[idx].ordered;
        const tag = ordered ? 'ol' : 'ul';
        let html = `<${tag}>`;
        while (idx < items.length && items[idx].indent === depth) {
          const cur = items[idx];
          idx++;
          let inner = '';
          if (idx < items.length && items[idx].indent > depth) {
            const r = render(idx, items[idx].indent);
            inner = r.html;
            idx = r.idx;
          }
          html += `<li>${inline(cur.text)}${inner}</li>`;
        }
        return { html: html + `</${tag}>`, idx };
      };
      out.push(render(0, items[0].indent).html);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushPara(para);
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara(para);
  return { html: out.join('\n'), headings };
}

// ---------------------------------------------------------------- 读取真草稿
function parsePost(dirName) {
  const raw = readFileSync(join(POSTS_DIR, dirName, 'index.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`frontmatter 解析失败: ${dirName}`);
  const fm = m[1];
  const body = m[2];
  const val = (k) => {
    const r = fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'));
    return r ? r[1].trim() : '';
  };
  const tags = (val('tags') || '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const title = val('title');

  // 图片路径按草稿 slug 重写，指向仓库里的真图
  const { html, headings } = parseMarkdown(body);
  const htmlFixed = html.replace(/@@SLUG@@/g, dirName);

  const text = body.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`\[\]()!-]/g, '');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[A-Za-z]+/g) || []).length;
  const minutes = Math.max(1, Math.round((cjk + latin * 1.5) / 400));

  return {
    slug: dirName,
    title,
    date: val('date'),
    summary: val('summary'),
    tags,
    draft: val('draft') === 'true',
    html: htmlFixed,
    headings,
    chars: cjk,
    minutes,
    url: `post-${dirName}.html`,
  };
}

const slugDirs = readdirSync(POSTS_DIR).filter((d) => statSync(join(POSTS_DIR, d)).isDirectory());
const POSTS = slugDirs.map(parsePost).sort((a, b) => (a.date < b.date ? 1 : -1));

// ---------------------------------------------------------------- 页面外壳
const FONT_STACK =
  `"Archivo","Space Grotesk","Public Sans","IBM Plex Sans","Segoe UI Variable Display","Segoe UI",Arial,"Noto Sans SC","Microsoft YaHei",sans-serif`;
const MONO_STACK = `"JetBrains Mono","IBM Plex Mono",Consolas,"Cascadia Mono","Courier New",monospace`;

function shell({ title, css, body, extraHead = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(SITE.metaDescription)}">
${extraHead}<style>
${css}
</style>
</head>
<body>
${body}
<script>
document.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-copy]');
  if (!btn) return;
  var code = btn.closest('.codeblock').querySelector('code');
  navigator.clipboard.writeText(code.innerText).then(function () {
    btn.textContent = '已复制';
    setTimeout(function () { btn.textContent = '复制'; }, 1200);
  });
});
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- 生成
const drafts = ['a', 'b', 'c'];
const built = [];
for (const key of drafts) {
  const mod = await import(`./drafts/${key}.mjs`);
  const d = mod.default;
  const dir = join(HERE, `draft-${key}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), shell({ title: `${SITE.name} — 首页`, css: d.css, body: d.index({ SITE, POSTS, FONTS: FONT_STACK, MONO: MONO_STACK }) }), 'utf8');
  for (const p of POSTS) {
    writeFileSync(join(dir, `post-${p.slug}.html`), shell({ title: `${p.title} — ${SITE.name}`, css: d.css, body: d.post({ SITE, POST: p, ALL: POSTS, FONTS: FONT_STACK, MONO: MONO_STACK }) }), 'utf8');
  }
  built.push(`${d.name} → draft-${key}/index.html + ${POSTS.length} 个文章页`);
}

console.log('已生成 ' + built.length + ' 套草案：');
built.forEach((b) => console.log('  ' + b));
console.log(`内容来源：${POSTS.length} 篇真草稿（${POSTS.map((p) => p.slug).join(', ')}）`);
