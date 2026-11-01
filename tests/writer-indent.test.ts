import { expect,it } from 'vitest';
import { AllSelection,EditorState,TextSelection } from 'prosemirror-state';
import { history,undo,redo } from 'prosemirror-history';
import { writerSchema as schema,parseWriterMarkdown,serializeWriterMarkdown } from '../src/scripts/writer/markdown';
import { indentText,tabIndentCommand } from '../src/scripts/writer/indentation';

it.each([
  ['甲乙',1,1,'甲    乙',5,5],
  ['abc',1,2,'a    c',5,5],
  ['',0,0,'    ',4,4],
  ['a\r\nb',3,3,'a\r\n    b',7,7],
] as const)('单点或单行选区插入四个真实空格：%j',(raw,start,end,body,from,to)=>{
  expect(indentText(raw,start,end)).toMatchObject({body,start:from,end:to});
});
it.each([
  ['甲\r\n乙\r\n后',0,6,'    甲\r\n    乙\r\n后',4,14],
  ['ab\ncd\nEF',1,6,'    ab\n    cd\nEF',5,14],
  ['a\n\nb',0,4,'    a\n    \n    b',4,16],
] as const)('多行逐行缩进，保留行尾且不碰选区后的行：%j',(raw,start,end,body,from,to)=>{
  expect(indentText(raw,start,end)).toMatchObject({body,start:from,end:to});
});
it.each([
  ['    abc',6,6,'abc',2,2],
  ['  abc',1,1,'abc',0,0],
  ['abc',1,1,'abc',1,1],
  ['\tabc',2,2,'\tabc',2,2],
  ['    a\r\n  b\r\nc',0,12,'a\r\nb\r\nc',0,6],
] as const)('反向缩进只删行首最多四个空格，既有Tab不转换：%j',(raw,start,end,body,from,to)=>{
  expect(indentText(raw,start,end,true)).toMatchObject({body,start:from,end:to});
});

function editor(doc:ReturnType<typeof parseWriterMarkdown>,anchor:number,head=anchor){
  let state=EditorState.create({doc,selection:TextSelection.create(doc,anchor,head),plugins:[history()]});
  return {get state(){return state;},run(command:ReturnType<typeof tabIndentCommand>){return command(state,tr=>{state=state.apply(tr);});}};
}
it('代码块中的Tab可整次撤销重做，语言和其他内容保留',()=>{
  const raw='```cpp linenos\nint main() {\nreturn 0;\n}\n```',doc=parseWriterMarkdown(raw);
  const e=editor(doc,doc.firstChild!.textContent.indexOf('return')+1);
  expect(e.run(tabIndentCommand())).toBe(true);
  expect(e.state.doc.firstChild!.textContent).toBe('int main() {\n    return 0;\n}');
  expect(e.state.doc.firstChild!.attrs.params).toBe('cpp linenos');
  expect(e.run(undo)).toBe(true);expect(e.state.doc.eq(doc)).toBe(true);
  expect(e.run(redo)).toBe(true);expect(e.state.doc.textContent).toContain('    return');
});
it('可视化单行选区替换为四空格后光标折叠，后续输入不会吃掉缩进',()=>{
  const e=editor(parseWriterMarkdown('甲乙丙'),2,3);e.run(tabIndentCommand());
  expect(e.state.doc.textContent).toBe('甲    丙');
  expect(e.state.selection.empty).toBe(true);expect(e.state.selection.from).toBe(6);
});
it.each(['`ab`','**ab**'])('行内代码或格式文字中间插入空格仍保留当前格式：%s',raw=>{
  const e=editor(parseWriterMarkdown(raw),2);e.run(tabIndentCommand());
  expect(e.state.doc.textContent).toBe('a    b');
  expect(e.state.doc.firstChild!.childCount).toBe(1);
  expect(parseWriterMarkdown(serializeWriterMarkdown(e.state.doc)).eq(e.state.doc)).toBe(true);
});
it.each(['foo','## foo','**foo**'])('段尾插入四空格保存重读不丢失：%s',raw=>{
  const doc=parseWriterMarkdown(raw),e=editor(doc,doc.content.size-1);e.run(tabIndentCommand());
  expect(e.state.doc.textContent).toBe('foo    ');
  expect(parseWriterMarkdown(serializeWriterMarkdown(e.state.doc)).eq(e.state.doc)).toBe(true);
});
it('单行选区覆盖到段尾后，四空格保存重读不丢失',()=>{
  const e=editor(parseWriterMarkdown('abcdef'),4,7);e.run(tabIndentCommand());
  expect(e.state.doc.textContent).toBe('abc    ');
  expect(parseWriterMarkdown(serializeWriterMarkdown(e.state.doc)).eq(e.state.doc)).toBe(true);
});
it.each(['`foo`','**`foo`**'])('行内代码替换全部文字或段首插入四空格可完整往返：%s',raw=>{
  for(const end of [1,4]){
    const e=editor(parseWriterMarkdown(raw),1,end);e.run(tabIndentCommand());
    expect(e.state.doc.firstChild!.firstChild!.marks.map(mark=>mark.type.name)).toContain('code');
    expect(e.state.doc.textContent.startsWith('    ')).toBe(true);
    expect(parseWriterMarkdown(serializeWriterMarkdown(e.state.doc)).eq(e.state.doc)).toBe(true);
  }
});
it.each(['## 标题','- 列表项目','> 引用正文','**加粗段首**','甲  \n乙'])('格式正文的缩进可无损往返：%s',raw=>{
  const doc=parseWriterMarkdown(raw),position=raw.startsWith('- ')?3:raw.startsWith('> ')?2:1;
  const e=editor(doc,position);e.run(tabIndentCommand());
  expect(parseWriterMarkdown(serializeWriterMarkdown(e.state.doc)).eq(e.state.doc)).toBe(true);
});
it('代码多行缩进保留反向选区，Shift+Tab还原并可单独撤销',()=>{
  const doc=parseWriterMarkdown('```c\na\nb\nc\n```'),e=editor(doc,5,1);
  e.run(tabIndentCommand());expect(e.state.doc.textContent).toBe('    a\n    b\nc');
  expect(e.state.selection.anchor).toBeGreaterThan(e.state.selection.head);
  e.run(tabIndentCommand(true));expect(e.state.doc.eq(doc)).toBe(true);
  e.run(undo);expect(e.state.doc.textContent).toBe('    a\n    b\nc');
});
it('跨段落只插入缩进，不删除图片、标题、格式或改成列表层级',()=>{
  const doc=schema.nodes.doc.create(null,[
    schema.nodes.heading.create({level:2},schema.text('标题')),
    schema.nodes.paragraph.create(null,[schema.text('粗体',[schema.marks.strong.create()]),schema.nodes.image.create({src:'writer-asset:abc',alt:'原图'})]),
    schema.nodes.paragraph.create(null,schema.text('后文')),
  ]);
  const e=editor(doc,1,doc.child(0).nodeSize+doc.child(1).nodeSize+1);
  e.run(tabIndentCommand());
  expect(e.state.doc.child(0).textContent).toBe('    标题');
  expect(e.state.doc.child(1).textContent).toBe('    粗体');
  expect(e.state.doc.child(1).lastChild!.attrs.src).toBe('writer-asset:abc');
  expect(e.state.doc.child(2).textContent).toBe('后文');
  expect(e.state.doc.child(1).rangeHasMark(4,6,schema.marks.strong)).toBe(true);
});
it('普通段落的四空格缩进在可视化与源码之间往返不变成代码块',()=>{
  const e=editor(parseWriterMarkdown('原正文'),1);e.run(tabIndentCommand());
  expect(e.state.doc.firstChild!.textContent).toBe('    原正文');
  expect(parseWriterMarkdown(serializeWriterMarkdown(e.state.doc)).eq(e.state.doc)).toBe(true);
});
it('Ctrl+A 产生的整篇选区也能逐行缩进，不把Tab交给页面焦点',()=>{
  const doc=parseWriterMarkdown('```python\na\nb\n```');
  let state=EditorState.create({doc,selection:new AllSelection(doc),plugins:[history()]});
  expect(tabIndentCommand()(state,tr=>{state=state.apply(tr);})).toBe(true);
  expect(state.doc.textContent).toBe('    a\n    b');
});
it('硬换行的多行逐行缩进，行内样式保留',()=>{
  const doc=schema.nodes.doc.create(null,schema.nodes.paragraph.create(null,[schema.text('甲'),schema.nodes.hard_break.create(),schema.text('乙',[schema.marks.em.create()])]));
  const e=editor(doc,1,4);e.run(tabIndentCommand());
  expect(e.state.doc.firstChild!.child(0).text).toBe('    甲');
  expect(e.state.doc.firstChild!.textBetween(0,e.state.doc.firstChild!.content.size,'','\n')).toBe('    甲\n    乙');
  expect(e.state.doc.firstChild!.lastChild!.marks[0].type.name).toBe('em');
});
