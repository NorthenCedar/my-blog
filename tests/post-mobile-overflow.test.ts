import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const readCss = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

function ruleBody(css: string, selectorPattern: RegExp): string {
  const match = css.match(new RegExp(selectorPattern.source + String.raw`\s*\{([^}]*)\}`));
  expect(match, `找不到规则：${selectorPattern}`).not.toBeNull();
  return match![1];
}

describe('文章页 · 手机端不发生横向溢出', () => {
  it('正文长词折行，行内代码与长链接可断行，但代码块保持原样横滚不折行', () => {
    const prose = readCss('src/styles/prose.css');
    expect(ruleBody(prose, /\.prose/)).toMatch(/overflow-wrap:\s*break-word/);
    expect(ruleBody(prose, /\.prose a/)).toMatch(/overflow-wrap:\s*anywhere/);
    expect(ruleBody(prose, /\.prose code/)).toMatch(/overflow-wrap:\s*anywhere/);
    expect(ruleBody(prose, /\.astro-code/)).toMatch(/overflow-wrap:\s*normal/);
    expect(ruleBody(prose, /\.astro-code code/)).toMatch(/overflow-wrap:\s*normal/);
  });

  it('评论名字与正文支持长词断行，不把文章页撑出横向空白', () => {
    const comments = readCss('src/styles/comments.css');
    expect(ruleBody(comments, /\.comment-name/)).toMatch(/overflow-wrap:\s*break-word/);
    expect(ruleBody(comments, /\.comment-body/)).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('文章布局壳层折行兜底且样式花括号配对平衡', () => {
    const post = readFileSync(join(ROOT, 'src/layouts/Post.astro'), 'utf8');
    const styleStart = post.indexOf('<style>');
    const styleEnd = post.indexOf('</style>', styleStart);
    expect(styleStart).toBeGreaterThan(-1);
    expect(styleEnd).toBeGreaterThan(styleStart);
    const style = stripComments(post.slice(styleStart + '<style>'.length, styleEnd));

    expect(ruleBody(style, /\.post-layout/)).toMatch(/overflow-wrap:\s*break-word/);
    const opens = (style.match(/\{/g) ?? []).length;
    const closes = (style.match(/\}/g) ?? []).length;
    expect(opens, 'Post.astro <style> 花括号必须成对').toBe(closes);
  });

  it('主 flex 容器 main 允许在窄屏下收缩（min-width: 0）', () => {
    const base = readCss('src/styles/base.css');
    expect(ruleBody(base, /body:not\(\.chrome-console\)\s*>\s*main/)).toMatch(/min-width:\s*0/);
  });
});
