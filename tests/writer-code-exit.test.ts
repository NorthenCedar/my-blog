import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { EditorState,TextSelection } from 'prosemirror-state';
import { parseWriterMarkdown,serializeWriterMarkdown } from '../src/scripts/writer/markdown';
import { appendParagraph,padAfterCode } from '../src/scripts/writer/code-exit';

/* 站主 2026-11-16：
   「可视化编辑下如果最后一行是代码块，那么换行换不出去，点不出去到外面正文」；
   随后补一条「正常换行用 ENTER，跳到外面用其他键，可以是组合键」
   ⇒ Enter 在代码块里就是老实换行，跳出只认 Ctrl / ⌘ + Enter（或点块下方空白）。 */

const run = (command: ReturnType<typeof padAfterCode>, state: EditorState) => {
  let next = state;
  const handled = command(state, tr => { next = state.apply(tr); });
  return { handled, next };
};

const stateAt = (raw: string, pos: number) => {
  const doc = parseWriterMarkdown(raw);
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
};

it('Ctrl / ⌘ + Enter：光标在代码块末尾时跳出，并在块后留下一个空段落', () => {
  const doc = parseWriterMarkdown('正文\n\n```\ncode\n```\n');
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, doc.content.size - 1) });
  const { handled, next } = run(padAfterCode(), state);
  expect(handled).toBe(true);
  expect(next.doc.lastChild!.type.name).toBe('paragraph');
  expect(next.selection.$from.parent.type.name).toBe('paragraph');
  expect(next.doc.lastChild!.content.size).toBe(0);
});

it('代码块夹在中间时也能跳出，块后原有内容不受影响', () => {
  const { handled, next } = run(padAfterCode(), stateAt('```\ncode\n```\n\n尾声\n', 3));
  expect(handled).toBe(true);
  expect(next.doc.childCount).toBe(3);
  expect(next.doc.child(1).type.name).toBe('paragraph');
  expect(serializeWriterMarkdown(next.doc).trimEnd().endsWith('尾声')).toBe(true);
});

it('光标不在代码块里时 padAfterCode 不动（Enter / 正文都交给默认行为）', () => {
  const { handled } = run(padAfterCode(), stateAt('正文\n\n```\ncode\n```\n', 2));
  expect(handled).toBe(false);
});

it('点在只读小块（表格 / 原生视频）下方空白时，末尾补一个能落笔的段落', () => {
  const doc = parseWriterMarkdown('正文\n\n| a | b |\n| - | - |\n| 1 | 2 |\n');
  expect(doc.lastChild!.type.name).toBe('raw_block');
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
  const { handled, next } = run(appendParagraph(), state);
  expect(handled).toBe(true);
  expect(next.doc.lastChild!.type.name).toBe('paragraph');
  expect(next.selection.$from.parent.type.name).toBe('paragraph');
});

/* 绑定契约：Enter 只做列表续行，跳出只挂在 Ctrl / ⌘ + Enter 上。
   站主明确要「正常换行用 ENTER」，谁再往 Enter 上挂跳出命令，这条会红。 */
it('Enter 只负责换行 / 列表续行，跳出只挂在 Mod-Enter 上', () => {
  const source = readFileSync(new URL('../src/scripts/writer/body-editor.ts', import.meta.url), 'utf8');
  expect(source).toContain('Enter:splitListItem(schema.nodes.list_item),');
  expect(source).toContain("'Mod-Enter':(state,dispatch)=>padAfterCode()(state,dispatch)||padAfter(view),");
  expect(source, 'Enter 上又挂了「跳出代码块」').not.toContain('padAfterCode(true)');
});