import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readBuildHtmlIndex } from './build-html-index.mjs';

/** 以实际公开产物为准，沿用页面已经生成的稳定 ID。 */
export async function writeCommentTargets({
  distDir = resolve('dist'),
  output = resolve('functions/api/_generated/comment-targets.json'),
  htmlIndex,
} = {}) {
  const index = htmlIndex ?? await readBuildHtmlIndex(distDir);
  const comments = new Set();
  const talks = new Set();
  for (const { file, normal, reply, like } of index.comments) {
    for (const slug of [normal, reply, like]) {
      if (slug !== undefined && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160)) {
        throw new Error(`公开页面留言标识不合法：${file}`);
      }
    }
    if (normal) comments.add(normal);
    if (reply) comments.add(reply);
    if (like) {
      if (!like.startsWith('talk-') || like.length > 60) throw new Error(`公开说说标识不合法：${file}`);
      talks.add(like);
      comments.add(like);
    }
  }

  if (!comments.size) throw new Error('公开产物没有留言目标；保留既有白名单并停止构建');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ comments: [...comments].sort(), talks: [...talks].sort() }, null, 2) + '\n');
  console.log(`留言目标已生成：${comments.size} 个留言页面，${talks.size} 条说说`);
}
