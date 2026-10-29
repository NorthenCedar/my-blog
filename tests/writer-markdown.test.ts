import { expect,it } from 'vitest';
import { parseWriterMarkdown,serializeWriterMarkdown,visualMarkdownIssue,restoreImageAssets } from '../src/scripts/writer/markdown';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { headingTree } from '../src/lib/post-meta';
import { EditorState,TextSelection } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';
import { history,undo } from 'prosemirror-history';

it('正文、两级标题、列表、链接、图片和代码使用实际 Markdown 结构',()=>{
  const doc=parseWriterMarkdown('正文\n\n## 章节\n\n### 小节\n\n- **粗体**与*斜体*\n\n![说明](writer-asset:abc)\n\n```ts\nconst a = 1\n```\n');
  expect(doc.child(1).type.name).toBe('heading');expect(doc.child(1).attrs.level).toBe(2);
  expect(doc.child(2).attrs.level).toBe(3);expect(doc.child(3).type.name).toBe('bullet_list');
  expect(doc.child(4).firstChild?.attrs.src).toBe('writer-asset:abc');expect(doc.child(5).attrs.params).toBe('ts');
});
it('未修改以及撤销回初始文档时保留 CRLF、空行和原始 Markdown 字节',()=>{
  const raw='章节\r\n=====\r\n\r\n正文  \r\n下一行\r\n\r\n';const doc=parseWriterMarkdown(raw);
  expect(serializeWriterMarkdown(doc,{raw,doc})).toBe(raw);
  expect(serializeWriterMarkdown(doc.copy(doc.content),{raw,doc})).toBe(raw);
  expect(serializeWriterMarkdown(parseWriterMarkdown('## 新章节'),{raw,doc})).toBe('## 新章节');
});
it.each([
  '<video controls src="./a.mp4"></video>', '<!-- 保留注释 -->', '<span>内联 HTML</span>',
  '| A | B |\n| --- | --- |\n| 1 | 2 |', '- [x] 任务', '文字[^1]\n\n[^1]: 脚注',
  '[链接][ref]\n\n[ref]: https://example.com', '$x^2$', ':::note\n内容\n:::',
  '<Component />', 'import Widget from "./x";',
])('特殊旧文进入源码模式并保留完整原文：%s',raw=>{expect(visualMarkdownIssue(raw)).toBeTruthy();});
it('删除线可以可视化编辑、与强调组合，代码中的格式符号仍是原文',async()=>{
  const raw='~~旧说法 **加粗** 与 *斜体*~~\n\n`~~代码~~`\n\n```cpp\nstd::cout << "**原文**";\n```';
  expect(visualMarkdownIssue(raw)).toBeNull();
  const doc=parseWriterMarkdown(raw);
  expect(doc.firstChild?.firstChild?.marks.map(mark=>mark.type.name)).toContain('strike');
  const serialized=serializeWriterMarkdown(doc);
  expect(parseWriterMarkdown(serialized).eq(doc)).toBe(true);
  expect(serialized).toContain('`~~代码~~`');expect(serialized).toContain('std::cout << "**原文**";');
  const rendered=await (await createSatteriMarkdownProcessor()).render(serialized);
  expect(rendered.code).toMatch(/<(?:del|s)>旧说法 <strong>加粗<\/strong> 与 <em>斜体<\/em><\/(?:del|s)>/);
});
it('删除线按钮命令可以切换与撤销，撤销回初始文档保留原始CRLF',()=>{
  const raw='原来文字\r\n',doc=parseWriterMarkdown(raw);
  let state=EditorState.create({doc,selection:TextSelection.create(doc,1,5),plugins:[history()]});
  expect(state.schema.marks.strike).toBeTruthy();
  const run=(command:ReturnType<typeof toggleMark>)=>command(state,tr=>{state=state.apply(tr);});
  expect(run(toggleMark(state.schema.marks.strike))).toBe(true);
  expect(serializeWriterMarkdown(state.doc)).toBe('<del>原来文字</del>');
  expect(run(undo)).toBe(true);expect(serializeWriterMarkdown(state.doc,{raw,doc})).toBe(raw);
  run(toggleMark(state.schema.marks.strike));run(toggleMark(state.schema.marks.strike));expect(state.doc.eq(doc)).toBe(true);
});
it('编辑后字面量波浪线仍为文字，不会意外变成删除线',()=>{
  const raw='\\~\\~普通文字\\~\\~ 与 `~~代码~~`',doc=parseWriterMarkdown(raw);
  expect(parseWriterMarkdown(serializeWriterMarkdown(doc)).eq(doc)).toBe(true);
});
it('仅放行配对无属性的删除线，其他HTML和字面标签不改成格式',()=>{
  expect(visualMarkdownIssue('这是<del>**旧字**</del>。')).toBeNull();
  for(const raw of ['<del onclick="alert(1)">文字</del>','<del>文字','</del>文字','<script>x</script>','<del>a `</del>`','<del>a \\</del>','<del><del>a</del>'])expect(visualMarkdownIssue(raw)).toBeTruthy();
  const doc=parseWriterMarkdown('\\<del>字面量\\</del>');expect(parseWriterMarkdown(serializeWriterMarkdown(doc)).eq(doc)).toBe(true);
});
it('中文句中叠加三种格式后仍能无损往返，不露出星号',async()=>{
  let state=EditorState.create({doc:parseWriterMarkdown('这是一段文字，供格式验收。')});
  state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,3,7)));
  for(const mark of ['strong','em','strike'])toggleMark(state.schema.marks[mark])(state,tr=>{state=state.apply(tr);});
  const doc=state.doc;
  const serialized=serializeWriterMarkdown(doc);
  expect(parseWriterMarkdown(serialized).eq(doc)).toBe(true);
  const rendered=await (await createSatteriMarkdownProcessor()).render(serialized);
  expect(rendered.code).not.toContain('***');expect(rendered.code).toContain('<strong>');expect(rendered.code).toContain('<em>');expect(rendered.code).toMatch(/<(del|s)>/);
});
it('代码中的 HTML、数学和表格符号不误判成扩展正文',()=>{
  expect(visualMarkdownIssue('```html\n<video />\n$x$\n| --- |\n```\n\n`<span>`')).toBeNull();
  expect(visualMarkdownIssue('普通正文\n\n## 章节\n\n### 小节\n\n> 引用\n\n![图](./a.png)')).toBeNull();
});
it('图片说明保留内部强调、行内代码与转义文字',()=>{
  const doc=parseWriterMarkdown('![说明 **加粗** 与 `代码` 和 \\[括号\\]](./image.png)');
  expect(doc.firstChild?.firstChild?.attrs.alt).toBe('说明 加粗 与 代码 和 [括号]');
});
it('编辑器输出经实际文章 Markdown 渲染生成两级目录和对应锚点',async()=>{
  const body=serializeWriterMarkdown(parseWriterMarkdown('正文\n\n## 一、开始写作\n\n段落\n\n### 1.1 插入图片\n\n说明'));
  const processor=await createSatteriMarkdownProcessor(),rendered=await processor.render(body);
  const headings=headingTree(rendered.metadata.headings);
  expect(headings).toHaveLength(2);expect(headings.map(h=>h.depth)).toEqual([2,3]);
  for(const h of headings)expect(rendered.code).toContain(`id="${h.id}"`);
});
it('撤销移图恢复已知配图说明，忽略代码和未知配图，不制造重复',()=>{
  const image={sha256:'a'.repeat(64),alt:'原图说明'},known=new Map([[image.sha256,image]]);
  const raw=`![原图说明](writer-asset:${image.sha256})`;
  expect(restoreImageAssets(raw,[],known)).toEqual([image]);
  expect(restoreImageAssets(raw,[image],known)).toEqual([image]);
  expect(restoreImageAssets('`'+raw+'`\n\n```md\n'+raw+'\n```',[],known)).toEqual([]);
  expect(restoreImageAssets(raw,[],new Map())).toEqual([]);
});
