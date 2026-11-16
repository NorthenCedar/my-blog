import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseWriterMarkdown, serializeWriterMarkdown } from '../src/scripts/writer/markdown';

/**
 * 桌面写作台「只打正文、格式全靠按钮」的地基：Markdown 往返不能走样。
 * 站主 2026-11-16 的要求原话是「确定在正文里打两个 * 不会被识别为斜体了」，
 * 以及「不要动我文章的排版」——所以这里既守星号，也守缩进与逐块原样。
 */
const load = (slug: string) => readFileSync(`content/posts/${slug}/index.md`, 'utf8');

const editText = (raw: string, needle: string, insert: string) => {
  const doc = parseWriterMarkdown(raw);
  let at = -1;
  doc.descendants((node, pos) => {
    if (at >= 0 || node.type.name !== 'text') return true;
    const index = node.text!.indexOf(needle);
    if (index >= 0) at = pos + index + needle.length;
    return true;
  });
  if (at < 0) throw new Error(`没找到 ${needle}`);
  const state = EditorState.create({ doc });
  return { doc, out: serializeWriterMarkdown(state.apply(state.tr.insertText(insert, at)).doc, { raw, doc }) };
};

describe.each(['my-c-note', 'my-python-memorandum'])('%s 的 Markdown 往返', (slug) => {
  it('没改动的文档一个字节都不变', () => {
    const raw = load(slug);
    const doc = parseWriterMarkdown(raw);
    expect(serializeWriterMarkdown(doc, { raw, doc })).toBe(raw);
  });

  it('只改一处时，其余行逐字节保持原样', () => {
    const raw = load(slug);
    const needle = slug === 'my-c-note' ? 'int* p,q;' : '变量名称 = ()';
    const { out } = editText(raw, needle, '（补）');
    const before = raw.split('\n');
    const after = out.split('\n');
    expect(after.length).toBe(before.length);
    const changed = before.filter((line, index) => line !== after[index]);
    expect(changed.length).toBe(1);
    expect(out).toContain('（补）');
  });
});

describe('正文里打出来的星号不会被吃成强调', () => {
  const state = (raw: string) => {
    const doc = parseWriterMarkdown(raw);
    return { doc, editor: EditorState.create({ doc }) };
  };

  it('在现有句子里补一个星号，保存后写成转义形态', () => {
    const { doc, editor } = state('指针就是地址');
    const out = serializeWriterMarkdown(editor.apply(editor.tr.insertText('int* p', 1)).doc, { raw: '指针就是地址', doc });
    expect(out).toBe('int\\* p指针就是地址');
    expect(parseWriterMarkdown(out).textContent).toBe('int* p指针就是地址');
  });

  it('同一段里打两个星号也不成对', () => {
    const { doc, editor } = state('比较大小');
    const out = serializeWriterMarkdown(editor.apply(editor.tr.insertText('a ** b', 1)).doc, { raw: '比较大小', doc });
    expect(out).toBe('a \\*\\* b比较大小');
    let emphasis = 0;
    parseWriterMarkdown(out).descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === 'em')) emphasis++;
      return true;
    });
    expect(emphasis).toBe(0);
  });

  it('已有转义星号的文章再编辑，转义保持原样', () => {
    const { out } = editText(load('my-c-note'), 'int* p,q;', '（补）');
    expect(out).toContain('int\\* p,q;（补）');
    expect(out).not.toContain('int* p,q;');
  });
});

describe('排版结构', () => {
  const roundTrip = (raw: string) => serializeWriterMarkdown(parseWriterMarkdown(raw));

  it('圆点列表用「- 」起头', () => {
    expect(roundTrip('- 甲\n- 乙')).toBe('- 甲\n- 乙');
  });

  it('行首 1–3 个空格换成实体，不会被重读成代码块', () => {
    const raw = '第一行\n   续行的一句';
    const out = roundTrip(raw);
    expect(out).toBe('第一行\n&#32;&#32;&#32;续行的一句');
    expect(parseWriterMarkdown(out).textContent).toBe('第一行\n   续行的一句');
    expect(parseWriterMarkdown(out).childCount).toBe(1);
  });

  it('代码块里的星号与缩进一个字都不动', () => {
    const raw = '```c\n   int* p = &i;\n```';
    expect(roundTrip(raw)).toBe(raw);
  });

  it('强调与删除线仍然按格式序列化', () => {
    const raw = '**加粗** 与 *斜体* 与 ~~删除线~~';
    const out = roundTrip(raw);
    expect(parseWriterMarkdown(out).eq(parseWriterMarkdown(raw))).toBe(true);
    expect(out).toContain('**加粗**');
    expect(out).toContain('<del>删除线</del>');
  });

  it('CRLF 的文章改一处，行尾不变、也只改一行', () => {
    const raw = '第一段\r\n\r\n- 甲\r\n- 乙\r\n\r\n结尾';
    const doc = parseWriterMarkdown(raw);
    let at = -1;
    doc.descendants((node, pos) => {
      if (at >= 0 || node.type.name !== 'text') return true;
      const index = node.text!.indexOf('甲');
      if (index >= 0) at = pos + index + 1;
      return true;
    });
    const state = EditorState.create({ doc });
    const out = serializeWriterMarkdown(state.apply(state.tr.insertText('（补）', at)).doc, { raw, doc });
    expect(out).not.toMatch(/[^\r]\n/);
    const before = raw.split('\n');
    const after = out.split('\n');
    expect(after.length).toBe(before.length);
    expect(before.filter((line, index) => line !== after[index]).length).toBe(1);
  });
});