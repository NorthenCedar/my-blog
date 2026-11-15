import { describe, expect, it } from 'vitest';
import { parseWriterMarkdown, serializeWriterMarkdown } from '../src/scripts/writer/markdown';

/** 把「用户在段落末尾又敲了一个字」变成一次真实编辑，用来取序列化结果。 */
function typeAtEnd(raw: string): string {
  const doc = parseWriterMarkdown(raw);
  const paragraph = doc.firstChild!;
  const edited = doc.type.schema.nodes.paragraph!.create(
    null,
    paragraph.content.addToEnd(doc.type.schema.text('。')),
  );
  const parts: any[] = [];
  doc.forEach(node => parts.push(node));
  parts[0] = edited;
  const next = doc.type.create(doc.attrs, parts);
  return serializeWriterMarkdown(next, { raw, doc });
}

function hasEmphasis(raw: string): boolean {
  const json = JSON.stringify(parseWriterMarkdown(raw).toJSON());
  return json.includes('"em"') || json.includes('"strong"');
}

describe('正文里的星号：代码记号按字面，强调照旧', () => {
  it('int* p 这类指针声明不会被吃成强调', () => {
    expect(typeAtEnd('int* p, q;')).toBe('int\\* p, q;。');
    expect(hasEmphasis('int* p, q;')).toBe(false);
  });

  it('句子里出现两个星号也只当字面（复合赋值那句）', () => {
    const raw = 'x *= a+b;是x = x*(a+b),但是在define函数中x *= a+b;是x = x*a +b;';
    const out = typeAtEnd(raw);
    expect(hasEmphasis(raw)).toBe(false);
    expect(out).not.toMatch(/(?<!\\)\*/);
  });

  it('一整句里的三处 int* 都按字面', () => {
    const raw =
      '另外一种定义方法是int* p;这里还是p是指针而不是有int*这么一个类型；所以int* p,q;中的q还是一个普通的整形';
    expect(hasEmphasis(raw)).toBe(false);
    expect(typeAtEnd(raw).match(/(?<!\\)\*/g)).toBe(null);
  });

  it('int *p, *q 这种写法也不配成对', () => {
    expect(hasEmphasis('int *p, *q; 两个指针')).toBe(false);
  });

  it('真的斜体与加粗照旧往返', () => {
    expect(hasEmphasis('中文 *斜体* 与 **加粗** 都要留着')).toBe(true);
    expect(hasEmphasis('English *italic* and **bold** must survive')).toBe(true);
    const out = typeAtEnd('中文 *斜体* 与 **加粗** 都要留着');
    expect(out).toContain('*斜体*');
    expect(out).toContain('**加粗**');
  });
});