import type { Node } from 'prosemirror-model';
import type MarkdownIt from 'markdown-it';

/**
 * 原样保住「没被改过的块」。
 *
 * ★ 为什么需要（2026-11-16）：站主写笔记是一行一条、子项用 1–3 个空格续行。
 *   CommonMark 在**解析阶段**就会吃掉段落续行开头的空白，于是
 *   `parse(markdown) → serialize(doc)` 这条往返会把缩进和软换行一起抹平
 *   —— 只要编辑一个字符，整篇 400 多行的缩进就没了。
 *   站点构建那边靠 src/lib/markdown-preserve-indent.mjs 在喂给解析器之前动手，
 *   编辑器这条路则改成：解析前把行首 1–3 个空格换成 &#32;（实体在解析阶段是
 *   普通字符，解码后就是空格），序列化时又回到 &#32;，字节稳定。
 *
 * ★ 但「改了哪里就只重写哪里」还得靠逐块比对：整篇重新序列化会把没碰过的
 *   块也改写成 &#32; 形态（视觉一样、源码全变），站主看 diff 会以为我动了他的
 *   文章。所以保存时按顶层块做 LCS：匹配上的块**原样吐回原始字节**（含块
 *   之间的空行），只把真正改过 / 新插入的块交给序列化器。
 */

export type RawBlock = { text: string; gap: string; lead?: string };

/** 行首之后出现这些就当块级结构，不把空格换成实体。 */
const BLOCK_START = /^(?:[-*+]|\d+[.)]|>|#|\||<|```|~~~)/;

/**
 * 解析前：段落续行的行首 1–3 个空格换成 &#32;，让缩进活过 CommonMark 解析。
 * 规则与站点构建的 keepLineIndent 完全一致（见 src/lib/markdown-preserve-indent.mjs）。
 */
export function indentEntities(markdown: string): string {
  if (!markdown.includes('\n')) return markdown;
  const lines = markdown.split('\n');
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1]!.startsWith('`') ? '```' : '~~~';
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const lead = line.match(/^( {1,3})(?! )/);
    if (!lead) continue;
    if (BLOCK_START.test(line.slice(lead[0].length))) continue;
    if (i === 0 || lines[i - 1]!.trim() === '') continue;
    lines[i] = '&#32;'.repeat(lead[0].length) + line.slice(lead[0].length);
  }
  return lines.join('\n');
}

/** 把源码切成顶层块：块文本 + 它与下一块之间的原始间隔（空行等）。 */
export function splitTopLevelBlocks(markdown: string, md: MarkdownIt): RawBlock[] {
  const lines = markdown.split('\n');
  const starts: number[] = [0];
  for (let i = 1; i < lines.length; i++) starts.push(starts[i - 1]! + lines[i - 1]!.length + 1);
  const offsetOf = (line: number) => (line >= lines.length ? markdown.length : starts[line] ?? markdown.length);

  const ranges: [number, number][] = [];
  for (const token of md.parse(markdown, {})) {
    if (token.level !== 0 || !token.map || /_close$/.test(token.type)) continue;
    ranges.push([token.map[0]!, token.map[1]!]);
  }
  const blocks: RawBlock[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const [start, end] = ranges[i]!;
    const next = i + 1 < ranges.length ? ranges[i + 1]![0] : lines.length;
    blocks.push({
      text: markdown.slice(offsetOf(start), offsetOf(end)),
      gap: markdown.slice(offsetOf(end), offsetOf(next)),
      // 正文开头的空行（写作台从 frontmatter 切出来的正文常常以空行起头）也得留住，
      // 否则改一个字就把开头那行空行吃掉。
      lead: i === 0 ? markdown.slice(0, offsetOf(start)) : undefined,
    });
  }
  return blocks;
}

const cheapEqual = (a: Node, b: Node) => a.type === b.type && a.nodeSize === b.nodeSize && a.eq(b);

/**
 * 原文用的换行符。
 *
 * ★ 为什么需要（2026-11-16）：桌面写作台在 Windows 上回写文章时用的是 CRLF。
 *   序列化器只会吐 `\n`，若原样混进去，一篇 CRLF 文章改一个字就会变成「混合行尾」，
 *   逐行 diff 看着像改了三行（`\r` 单独成一行），站主会以为我动了他的排版。
 *   所以重写块的行尾统一跟随原文。
 */
function sourceEol(blocks: readonly RawBlock[]): string {
  return blocks.some(block => block.text.includes('\r\n')) ? '\r\n' : '\n';
}

/** 把序列化器输出的 LF 换成原文的行尾。 */
function matchEol(text: string, eol: string): string {
  if (eol === '\n') return text;
  return text.replace(/\r\n/g, '\n').split('\n').join(eol);
}

/** 顶层块的最长公共子序列：返回每个当前块匹配到的原始块下标（没有就是 -1）。 */
function alignBlocks(current: readonly Node[], original: readonly Node[]): number[] {
  const rows = current.length, cols = original.length;
  const table: Uint16Array[] = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i]![j] = cheapEqual(current[i]!, original[j]!)
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const matched = new Array<number>(rows).fill(-1);
  for (let i = 0, j = 0; i < rows && j < cols; ) {
    if (cheapEqual(current[i]!, original[j]!)) {
      matched[i] = j;
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return matched;
}

/**
 * 按块合并序列化结果：没改过的块用原始字节，改过的块用序列化器的输出。
 * `serializeBlock` 负责把单个块序列化成 Markdown 文本。
 */
export function mergeVerbatim(
  current: readonly Node[],
  original: readonly Node[],
  blocks: readonly RawBlock[],
  serializeBlock: (node: Node) => string,
): string {
  if (current.length === 0) return '';
  const matched = alignBlocks(current, original);
  const eol = sourceEol(blocks);
  // 第一个块之前的空行（写作台切出来的正文常以空行起头）原样留在最前面。
  let out = blocks[0]?.lead ?? '';
  let pendingGap = '';
  for (let i = 0; i < current.length; i++) {
    const index = matched[i]!;
    if (i > 0) {
      out += pendingGap;
      // 原末块可能没有行尾，插入相邻块时需要补上分隔。
      if (out && !out.endsWith('\n')) out += eol + eol;
    }
    if (index >= 0) {
      out += blocks[index]!.text;
      pendingGap = blocks[index]!.gap;
    } else {
      out += matchEol(serializeBlock(current[i]!), eol);
      pendingGap = eol + eol;
    }
  }
  // 末尾换行跟着原始字节走：原文结尾有换行就补回来，没有就不补。
  const last = matched[current.length - 1]!;
  if (last >= 0) out += blocks[last]!.gap;
  return out;
}
