import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { keepLineIndent } from '../src/lib/markdown-preserve-indent.mjs';

/**
 * 段落续行的行首缩进必须保住（2026-11-04 站主报：写作台里缩进好，线上顶到最左）。
 * 规则来自 CommonMark 的实际行为：续行开头的空格在解析阶段就被吃掉，
 * 所以只能在喂解析器之前换成不换行空格。断言直接用 \u00A0 写，别用空格 —— 看不见的差异最坑。
 */
describe('markdown 行首缩进', () => {
  it('段落续行 1–3 个空格换成不换行空格', () => {
    const out = keepLineIndent('1.int x = 0144;\n  int x = 0x64;\n   also;');
    expect(out).toBe('1.int x = 0144;\n\u00A0\u00A0int x = 0x64;\n\u00A0\u00A0\u00A0also;');
  });

  it('段落首行的缩进不动（那是块级缩进，不是作者的手工对齐）', () => {
    const out = keepLineIndent('  第一行\n第二行');
    expect(out).toBe('  第一行\n第二行');
  });

  it('4 个以上空格不动（缩进代码块）', () => {
    const md = '第一行\n    int a = 1;';
    expect(keepLineIndent(md)).toBe(md);
  });

  it('围栏代码块里一个字符都不改', () => {
    const md = '前言\n\n```c\n  int a = 1;\n    int b = 2;\n```\n';
    expect(keepLineIndent(md)).toBe(md);
  });

  it('列表 / 引用 / 标题 / 表格这些块级结构不动', () => {
    const md = ['一段', '  - 列表项', '  > 引用', '  # 标题', '  | 表格 |'].join('\n');
    expect(keepLineIndent(md)).toBe(md);
  });

  it('空行分隔的两个段落各自独立', () => {
    const out = keepLineIndent('甲\n  乙\n\n丙\n  丁');
    expect(out).toBe('甲\n\u00A0\u00A0乙\n\n丙\n\u00A0\u00A0丁');
  });

  it('产物里那篇文章的续行确实带上了不换行空格', () => {
    const file = join('dist', 'posts', 'my-c-note', 'index.html');
    if (!existsSync(file)) return; // 没构建过就跳过（构建型断言只在有产物时生效）
    const html = readFileSync(file, 'utf8');
    expect(html).toContain('\u00A0\u00A0int x = ');
  });
});