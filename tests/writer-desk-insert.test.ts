// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountWriterBody } from '../src/scripts/writer/body-editor';

const noop = () => {};

function mount(initial: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = mountWriterBody(host, initial, {
    onChange: noop,
    onImageFiles: noop,
    resolveImage: () => null,
    onError: (error: Error) => {
      throw error;
    },
  });
  return editor;
}

describe('桌面端插入正文时的星号处理', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('光标处的 int* p 写成转义形式，重新解析不会产生斜体', () => {
    const editor = mount('开头一句。\n\n第二段。\n');
    editor.insertText('这里写 int* p; 而不是 int\\* q;');
    const raw = editor.getMarkdown();
    expect(raw).toContain('int\\* p');
    editor.destroy();
  });

  it('复合赋值句里的星号也不会把整句吞成斜体', () => {
    const editor = mount('x *= a+b;是x = x*(a+b)\n');
    editor.insertText('再来一次 x *= 2;');
    const raw = editor.getMarkdown();
    expect(raw).not.toMatch(/(?<!\\)\*/);
    editor.destroy();
  });

  it('块级插入同样转义，且不吞掉原来的缩进与空行', () => {
    const initial = '第一段。\n\n- 甲\n- 乙\n';
    const editor = mount(initial);
    editor.insertText('![配图](/x.webp)', true);
    const raw = editor.getMarkdown();
    expect(raw.startsWith('第一段。')).toBe(true);
    expect(raw).toContain('- 甲\n- 乙');
    editor.destroy();
  });
});