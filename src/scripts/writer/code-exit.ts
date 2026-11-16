import { TextSelection,type Command } from 'prosemirror-state';
import { writerSchema as schema } from './markdown';

/**
 * 从代码块里「走出来」。
 *
 * 站主 2026-11-16：「可视化编辑下如果最后一行是代码块，那么换行换不出去，点不出去到外面正文」，
 * 随后又补一条：「正常换行用 ENTER，跳到外面用其他键，可以是组合键」
 * ⇒ Enter 不再抢（代码块里就是老实换行），跳出只认 Ctrl / ⌘ + Enter，或点块下方空白。
 *
 * 提示语里承诺的就是这个组合键，所以绑定必须跟这里一致（tests/writer-code-exit.test.ts 钉着）。
 */
export function padAfterCode(): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    if (!$from.sameParent($to)) return false;
    const block = $from.parent;
    if (block.type !== schema.nodes.code_block) return false;
    const after = $from.after();
    if (dispatch) {
      const tr = state.tr.insert(after, schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/**
 * 文档末尾补一个空段落并把光标放进去。
 *
 * 用在哪：正文最后一块是点不进去的块（表格 / 原生视频 / 代码块）时，点它下面的空白处
 * 没有落点 —— 那时交给这个命令，比 padAfterCode 更宽松（不要求光标已经在某个块里）。
 */
export function appendParagraph(): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const end = state.doc.content.size;
      const tr = state.tr.insert(end, schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, end + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}