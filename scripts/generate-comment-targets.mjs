import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// 以实际公开产物为准：不读取 Markdown，也不重复实现说说 ID 算法。
const dist = resolve(process.argv[2] ?? 'dist');
const output = resolve(process.argv[3] ?? 'functions/api/_generated/comment-targets.json');
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  }));
  return groups.flat();
}
function attributes(tag) {
  const found = new Map();
  // 一次消费完整属性值，里面出现的 data-* 示例不能冒充实际属性。
  for (const match of tag.matchAll(/\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (!found.has(name)) found.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return found;
}
const comments = new Set();
const talks = new Set();
for (const file of await htmlFiles(dist)) {
  const html = (await readFile(file, 'utf8')).replace(/<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  // 扫过所有完整标签后再筛选，跳过其他标签属性值里的“<button>”字符串。
  for (const [tag] of html.matchAll(/<[a-z][a-z0-9:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    if (!/^<(?:section|button)\b/i.test(tag)) continue;
    const attrs = attributes(tag);
    const normal = attrs.has('data-comments') ? attrs.get('data-slug') ?? null : null;
    const reply = attrs.get('data-comments-for') ?? null;
    const like = attrs.get('data-like') ?? null;
    for (const slug of [normal, reply, like]) {
      if (slug !== null && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160)) throw new Error(`公开页面留言标识不合法：${file}`);
    }
    if (normal) comments.add(normal);
    if (reply) comments.add(reply);
    if (like) {
      if (!like.startsWith('talk-') || like.length > 60) throw new Error(`公开说说标识不合法：${file}`);
      talks.add(like); comments.add(like);
    }
  }
}
if (!comments.size) throw new Error('公开产物没有留言目标；保留既有白名单并停止构建');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ comments: [...comments].sort(), talks: [...talks].sort() }, null, 2) + '\n');
console.log(`留言目标已生成：${comments.size} 个留言页面，${talks.size} 条说说`);
