import { describe,expect,it } from 'vitest';
import { markdownFormat,markdownLink,markdownUnlink,sourceFormatActive } from '../src/scripts/writer/source-format';

/* 2026-11-16 站主：「Markdown 源码写作的时候那些段落格式、加粗、斜体等等那些按钮都没用了」。
   可视化那侧交给 ProseMirror；源码这侧全是纯函数，进来是原文 + 两个光标，出去是新原文 + 新光标。 */

const marker = (raw: string, text: string) => [raw.indexOf(text), raw.indexOf(text) + text.length] as const;

describe('行内标记', () => {
  it('选中文字加粗，再点一次去掉', () => {
    const raw = '这一段要重点。';
    const [start, end] = marker(raw, '重点');
    const bold = markdownFormat(raw, start, end, 'strong');
    expect(bold.body).toBe('这一段要**重点**。');
    expect(bold.body.slice(bold.start, bold.end)).toBe('重点');
    const again = markdownFormat(bold.body, bold.start, bold.end, 'strong');
    expect(again.body).toBe(raw);
  });

  it('没选文字时插一对记号，光标停在中间', () => {
    const edit = markdownFormat('甲', 1, 1, 'em');
    expect(edit.body).toBe('甲**');
    expect(edit.start).toBe(2);
    expect(edit.end).toBe(2);
  });

  it('已是加粗的文字点斜体，不会被拆成星号乱飞', () => {
    const raw = '**重点**';
    const edit = markdownFormat(raw, 2, 4, 'em');
    expect(edit.body).toBe('***重点***');
    const back = markdownFormat(edit.body, edit.start, edit.end, 'em');
    expect(back.body).toBe(raw);
  });

  it('删除线用 ~~', () => {
    const raw = '划掉这句';
    expect(markdownFormat(raw, 0, raw.length, 'strike').body).toBe('~~划掉这句~~');
  });
});

describe('行首格式', () => {
  it('多行加圆点后再点一次取消，其它行不动', () => {
    const raw = '甲\n乙\n\n丙';
    const edit = markdownFormat(raw, 0, 3, 'bullet');
    expect(edit.body).toBe('- 甲\n- 乙\n\n丙');
    expect(markdownFormat(edit.body, 0, edit.body.indexOf('丙'), 'bullet').body).toBe(raw);
  });

  it('引用与有序列表加在每行行首', () => {
    expect(markdownFormat('甲\n乙', 0, 3, 'quote').body).toBe('> 甲\n> 乙');
    expect(markdownFormat('甲\n乙', 0, 3, 'ordered').body).toBe('1. 甲\n1. 乙');
  });

  it('围栏代码里的行不参与改写', () => {
    const raw = '```\nconst a = 1;\n```\n正文';
    expect(markdownFormat(raw, 0, raw.length, 'quote').body).toBe('```\nconst a = 1;\n```\n> 正文');
  });

  it('选中的全是空行或代码时报错，不静默写坏', () => {
    expect(() => markdownFormat('```\ncode\n```', 4, 8, 'quote')).toThrow();
    expect(() => markdownFormat('\n\n', 0, 2, 'bullet')).toThrow();
  });
});

describe('标题级别', () => {
  it('正文 → 章节标题 → 小标题 → 正文', () => {
    const h2 = markdownFormat('标题一行', 0, 4, 'h2');
    expect(h2.body).toBe('## 标题一行');
    const h3 = markdownFormat(h2.body, h2.start, h2.end, 'h3');
    expect(h3.body).toBe('### 标题一行');
    const body = markdownFormat(h3.body, h3.start, h3.end, 'h0');
    expect(body.body).toBe('标题一行');
  });

  it('同级再点一次回到正文（与可视化按钮同义）', () => {
    const edit = markdownFormat('## 已有标题', 3, 7, 'h2');
    expect(edit.body).toBe('已有标题');
  });

  it('CRLF 原样保留', () => {
    const edit = markdownFormat('甲\r\n乙\r\n', 0, 4, 'h2');
    expect(edit.body).toBe('## 甲\r\n## 乙\r\n');
  });
});

describe('链接', () => {
  it('选中文字包成 [文字](地址)', () => {
    const raw = '看这里';
    const edit = markdownLink(raw, 1, 3, 'https://example.com');
    expect(edit.body).toBe('看[这里](https://example.com)');
    expect(edit.body.slice(edit.start, edit.end)).toBe('这里');
  });

  it('没选文字时插入地址并把文字选中', () => {
    const edit = markdownLink('', 0, 0, 'https://example.com', '示例');
    expect(edit.body).toBe('[示例](https://example.com)');
    expect(edit.body.slice(edit.start, edit.end)).toBe('示例');
  });

  it('去掉链接外壳只留文字', () => {
    const raw = '前 [文字](https://example.com) 后';
    const start = raw.indexOf('文字');
    const edit = markdownUnlink(raw, start, start + 2);
    expect(edit.body).toBe('前 文字 后');
    expect(edit.body.slice(edit.start, edit.end)).toBe('文字');
  });

  it('没有链接时原样返回', () => {
    const edit = markdownUnlink('普通文字', 2, 2);
    expect(edit.body).toBe('普通文字');
  });
});

describe('格式状态（点亮按钮）', () => {
  it('报出当前行与选区上的格式', () => {
    expect(sourceFormatActive('**甲**', 2, 3).strong).toBe(true);
    expect(sourceFormatActive('- 甲', 2, 2).bullet).toBe(true);
    expect(sourceFormatActive('1. 甲', 3, 3).ordered).toBe(true);
    expect(sourceFormatActive('> 甲', 2, 2).quote).toBe(true);
    expect(sourceFormatActive('## 甲', 3, 3).h2).toBe(true);
    expect(sourceFormatActive('### 甲', 4, 4).h3).toBe(true);
    expect(sourceFormatActive('甲', 1, 1)).toMatchObject({ h0: true, strong: false, bullet: false });
  });
});