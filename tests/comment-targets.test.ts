import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
it('构建目标只从最终 HTML 的实际留言及点赞标记产生，排序去重并排除正文与脚本干扰', () => {
  const root = mkdtempSync(join(tmpdir(), 'nc-targets-')); dirs.push(root);
  const dist = join(root, 'dist'); mkdirSync(join(dist, 'posts', 'published'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), `<section data-comments data-slug="guestbook"></section>
    <button data-like="talk-real"></button><section data-comments-for="talk-real"></section>
    <script>const fake = '<section data-comments data-slug="script-fake">';</script>
    <!-- <button data-like="talk-comment-fake"> -->
    <div title="<button data-like='talk-attribute-fake'>">属性里的示例</div>
    <section title="data-comments data-slug='attribute-fake'" data-comments data-slug="guestbook"></section>
    <pre>&lt;section data-comments data-slug="code-fake"&gt;</pre>`);
  writeFileSync(join(dist, 'posts', 'published', 'index.html'), `<section data-slug='published' data-comments></section>`);
  writeFileSync(join(root, 'draft.md'), `<section data-comments data-slug="draft"></section>`);
  const output = join(root, 'generated', 'targets.json');
  execFileSync(process.execPath, ['scripts/generate-comment-targets.mjs', dist, output]);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ comments: ['guestbook', 'published', 'talk-real'], talks: ['talk-real'] });
});
