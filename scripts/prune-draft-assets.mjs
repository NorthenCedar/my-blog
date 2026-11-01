// 构建后清理：把「只被草稿引用」的图片从 dist 里删掉。
//
// 为什么需要这一步：Astro 的内容管线在同步阶段就会渲染条目并优化其中的图片，
// 即使这篇是 draft: true、页面根本不产出。结果是「草稿的正文没上线，但草稿的图片上线了」——
// 素材躺在一个哈希 URL 上，没人能猜到，但按 content-model.md §5 的精神它就不该被部署。
// 试过 glob 的 deferRender: true（Astro 7.1+），实测三张图仍然产出，所以改为确定性的后置清理。
//
// 安全性：只删「出现在草稿里、且没有出现在任何已发布文章里」的素材。共用素材不会被误删。

import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {parseDocument} from 'yaml';

const POSTS = 'content/posts';
const DIST_ASTRO = 'dist/_astro';

const IMG = /!\[[^\]]*\]\(\.\/([^)\s]+)\)/g;

async function collect() {
  const drafts = new Set();
  const published = new Set();

  let dirs = [];
  try {
    for(const parent of [POSTS,'content/gallery'])for(const entry of await readdir(parent,{withFileTypes:true}).catch(()=>[]))if(entry.isDirectory())dirs.push({name:join(parent,entry.name)});
  } catch {
    return { drafts, published };
  }

  for (const d of dirs) {
    const file = join(d.name, 'index.md');
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    // ⚠️ \r?\n：仓库没有 .gitattributes，Windows 上 core.autocrlf=true ⇒ 新克隆出来是 CRLF，
    //    只认 \n 的话这里会静默 continue（草稿隔离失效，而不是报错 —— 更危险）。
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!fm) continue;
    const isDraft = parseDocument(fm[1]).get('draft')===true;
    const target = isDraft ? drafts : published;

    // 正文里的相对图片，外加 frontmatter 的 cover
    for (const m of fm[2].matchAll(IMG)) target.add(m[1].split('/').pop());
    const cover = fm[1].match(/^cover:\s*"?\.\/([^"\n]+)"?/m);
    if (cover) target.add(cover[1].split('/').pop());
  }
  return { drafts, published };
}

const { drafts, published } = await collect();
const onlyDraft = [...drafts].filter((f) => !published.has(f));

if (onlyDraft.length === 0) {
  console.log('[prune] 没有被草稿独占的素材');
  process.exit(0);
}

let files = [];
try {
  files = await readdir(DIST_ASTRO);
} catch {
  console.log('[prune] dist/_astro 不存在，跳过');
  process.exit(0);
}

let removed = 0;
for (const basename of onlyDraft) {
  const stem = basename.replace(/\.[^.]+$/, '');
  for (const f of files) {
    // Astro 输出形如 Image_xxx.<hash>.jpg —— 用去掉扩展名的原名前缀匹配
    if (f === basename || f.startsWith(stem + '.')) {
      const p = join(DIST_ASTRO, f);
      const size = (await stat(p)).size;
      await rm(p);
      console.log(`[prune] 删除草稿素材 ${f}  (${(size / 1024).toFixed(0)} KB)`);
      removed++;
    }
  }
}

console.log(removed > 0 ? `[prune] 共删除 ${removed} 个草稿素材` : '[prune] 没有匹配到需要删除的素材');
