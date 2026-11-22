import { expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWriterMarkdown,serializeWriterMarkdown,visualMarkdownIssue,writerFrozenBlocks } from '../src/scripts/writer/markdown';
import { EditorState } from 'prosemirror-state';

/**
 * 站主的 6 篇文章里带原生表格或 <video>，以前整篇被判进源码模式（「正文包含表格，
 * 请在源码模式编辑」）。现在表格与原生 HTML 变成「整块只读」的 raw_block：
 * 前后正文照常可视化编辑，这一块按原字节保留。这组测试盯三件事：
 *   ① 6 篇真实文章都能进可视化模式，且序列化后与源码逐字节相同；
 *   ② 在别处改一个字，表格一个字节都不动（块级比对兜住）；
 *   ③ 嵌套在引用/列表里的表格仍然整篇退回源码模式，绝不半懂不懂地改。
 */
const corpus=['kali-linux-tutorial','monitor-progress','roogoo-card','sql-injection-tutorial','susu-rig-tars'];
// 写作台只把 frontmatter 之后的正文交给编辑器，所以测试也按正文取。
const read=(slug:string)=>readFileSync(join('content','posts',slug,'index.md'),'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/,'');

it.each(corpus)('带表格或原生视频的文章可以可视化编辑，原文一个字节都不差：%s',slug=>{
  const raw=read(slug);
  expect(visualMarkdownIssue(raw)).toBeNull();
  const frozen=writerFrozenBlocks(raw);
  expect(frozen.length).toBeGreaterThan(0);
  const doc=parseWriterMarkdown(raw);
  expect(serializeWriterMarkdown(doc,{raw,doc})).toBe(raw);
  const texts:string[]=[];
  doc.descendants(node=>{if(node.type.name==='raw_block')texts.push(node.attrs.text as string);});
  expect(texts).toEqual(frozen.map(block=>block.text));
  // 不走「原文原样返回」的捷径，真序列化一遍：再解析后冻结块数量与内容不变。
  // （有序列表里的续行缩进是既有语义差异，doc.eq 不比——真值以上面那条逐字节断言为准。）
  const again=parseWriterMarkdown(serializeWriterMarkdown(doc));
  expect(writerFrozenBlocks(serializeWriterMarkdown(doc)).map(block=>block.text)).toEqual(frozen.map(block=>block.text));
  expect(again.childCount).toBe(doc.childCount);
});

it('在正文里改一段，只有那一段变，30 张表一字未动',()=>{
  const raw=read('sql-injection-tutorial');
  const doc=parseWriterMarkdown(raw);
  let pos=-1;
  doc.descendants((node,offset)=>{if(pos<0&&node.type.name==='paragraph'&&node.textContent.length>10)pos=offset+1;});
  expect(pos).toBeGreaterThan(0);
  const out=serializeWriterMarkdown(EditorState.create({doc}).tr.insertText('补一句',pos).doc,{raw,doc});
  const before=raw.split('\n'),after=out.split('\n');
  expect(after.length).toBe(before.length);
  const changed=before.map((line,index)=>line===after[index]?null:index).filter(index=>index!==null);
  expect(changed.length).toBe(1);
  expect(after[changed[0]!]).toContain('补一句');
  for(const block of writerFrozenBlocks(raw))expect(out.includes(block.text)).toBe(true);
});

it('表格写在引用或列表里时仍然整篇退回源码模式',()=>{
  expect(visualMarkdownIssue('> 引用\n>\n> | A | B |\n> | --- | --- |\n> | 1 | 2 |')).toBe('表格');
  expect(visualMarkdownIssue('- 条目\n\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |')).toBe('表格');
  expect(visualMarkdownIssue('文字 <video src="./a.mp4"></video> 文字')).toBe('HTML、视频或组件');
});