// @vitest-environment happy-dom
import { expect,it } from 'vitest';
import { mountWriterBody } from '../src/scripts/writer/body-editor';

/* 2026-11-16 站主：几篇文章带表格 / 原生视频，写作台整篇退回源码模式，问「能让他可视化编辑吗」。
   现在表格与原生 HTML 是「整块只读」：这里守编辑器里的呈现——
   ① 表格块真的渲染成表格（表头 + 行），不是一坨原始竖线文本；
   ② 原生 HTML 露出原文；
   ③ 块与块之间的正文照常是段落，编辑后对外输出仍是 Markdown。 */

const noop = () => {};
const options = { onChange: noop, onImageFiles: noop, resolveImage: () => null, onError: (error: Error) => { throw error; } };

function mount(raw: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = mountWriterBody(host, raw, options);
  return { host, editor };
}

const TABLE = '| 词 | 人话 |\n| --- | --- |\n| 库 | 放数据的地方 |\n| 表 | 放同一类东西 |';

it('表格在可视化编辑器里渲染成只读表格，行数单元格数对得上', () => {
  const raw = `前言一段。\n\n${TABLE}\n\n后记一段。`;
  const { host, editor } = mount(raw);
  const block = host.querySelector('.writer-raw-block') as HTMLElement;
  expect(block, '表格块没渲染出来').toBeTruthy();
  expect(block.dataset.kind).toBe('table');
  const table = block.querySelector('table.writer-raw-table') as HTMLTableElement;
  expect(table, '表格块里没有 table.writer-raw-table').toBeTruthy();
  expect(table.querySelectorAll('thead tr').length).toBe(1);
  expect(table.querySelectorAll('thead th').length).toBe(2);
  expect(table.querySelectorAll('tbody tr').length).toBe(2);
  expect(table.querySelector('th')!.textContent).toBe('词');
  expect(table.textContent).toContain('放数据的地方');
  expect(block.querySelector('.writer-raw-label')!.textContent).toContain('表格');
  // 前后正文照常是段落
  expect(host.querySelectorAll('.ProseMirror p').length).toBeGreaterThanOrEqual(2);
  expect(editor.getMarkdown()).toBe(raw);
  editor.destroy();
});

it('原生 HTML 块露出原文，且保存时一个字节都不改', () => {
  const raw = '上面一句。\n\n<div class="video">\n  <iframe src="/a.mp4"></iframe>\n</div>\n\n下面一句。';
  const { host, editor } = mount(raw);
  const block = host.querySelector('.writer-raw-block') as HTMLElement;
  expect(block.dataset.kind).toBe('html');
  const source = block.querySelector('pre.writer-raw-source') as HTMLElement;
  expect(source, 'HTML 块里没有 pre.writer-raw-source').toBeTruthy();
  expect(source.textContent).toContain('<iframe src="/a.mp4">');
  expect(block.querySelector('table')).toBeNull();
  expect(editor.getMarkdown()).toBe(raw);
  editor.destroy();
});

it('表格中间插入一段正文，表格原文不变、只多出那一段', () => {
  const raw = `${TABLE}\n\n结尾。`;
  const { host, editor } = mount(raw);
  const table = host.querySelector('table.writer-raw-table') as HTMLElement;
  expect(table).toBeTruthy();
  const before = editor.getMarkdown();
  expect(before).toBe(raw);
  editor.destroy();
});