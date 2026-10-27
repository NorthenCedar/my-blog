import { afterEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// 这条用例要真起 git init/add/commit 一串子进程，全量并发校验时超过默认 5 秒
// （2026-10-27 实测在 19:40 那次全量里报 Test timed out in 5000ms）。
// testTimeout 在 it() 注册时读取，所以必须写在用例前面。
vi.setConfig({testTimeout:30000});

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

it('首次生成及新增说说后重生成清单，不改变写作台可见的内容工作区快照', () => {
  const root = mkdtempSync(join(tmpdir(), 'nc-targets-publish-')); dirs.push(root);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  writeFileSync(join(root, '.gitignore'), readFileSync('.gitignore'));
  mkdirSync(join(root, 'content', 'pages'), { recursive: true });
  writeFileSync(join(root, 'content', 'pages', 'talks.md'), '原有内容\n');
  git('add', '--', '.gitignore', 'content');
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  writeFileSync(join(root, 'content', 'pages', 'talks.md'), '新增说说\n');
  const before = git('status', '--porcelain=v1', '--untracked-files=all');
  mkdirSync(join(root, 'dist'), { recursive: true });
  const script = resolve('scripts/generate-comment-targets.mjs');
  const target = join(root, 'functions', 'api', '_generated', 'comment-targets.json');
  for (const id of ['talk-new', 'talk-another']) {
    writeFileSync(join(root, 'dist', 'index.html'), `<section data-comments data-slug="guestbook"></section><button data-like="${id}"></button>`);
    execFileSync(process.execPath, [script], { cwd: root });
    expect(JSON.parse(readFileSync(target, 'utf8')).talks).toEqual([id]);
    expect(git('status', '--porcelain=v1', '--untracked-files=all')).toBe(before);
  }
  git('add', '--', 'content');
  expect(git('diff', '--cached', '--name-only').trim()).toBe('content/pages/talks.md');
});
