import { expect,it } from 'vitest';
import { EditorState,TextSelection } from 'prosemirror-state';
import { history,undo } from 'prosemirror-history';
import { parseWriterMarkdown,serializeWriterMarkdown } from '../src/scripts/writer/markdown';
import { codeBlockCommand,codeLanguageCommand,markdownCodeBlock,markdownCodeLanguage } from '../src/scripts/writer/code-block';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';

function editor(raw:string,from:number,to=from){
  const doc=parseWriterMarkdown(raw);let state=EditorState.create({doc,selection:TextSelection.create(doc,from,to),plugins:[history()]});
  return {get state(){return state;},run(command:ReturnType<typeof codeBlockCommand>){return command(state,tr=>{state=state.apply(tr);});}};
}

it('选中多段代码合为一个代码块，保留缩进、空行和符号',()=>{
  const e=editor('print(1)\n\n\n\n    print(2)',1,9);
  // 直接构造普通段落，避免 Markdown 的四格缩进先被解析成已有代码。
  const schema=e.state.schema,doc=schema.nodes.doc.create(null,[schema.nodes.paragraph.create(null,schema.text('if x:')),
    schema.nodes.paragraph.create(),schema.nodes.paragraph.create(null,schema.text('    print("<>&")'))]);
  let state=EditorState.create({doc,selection:TextSelection.create(doc,1,doc.content.size-1)});
  expect(codeBlockCommand('python')(state,tr=>{state=state.apply(tr);})).toBe(true);
  expect(state.doc.childCount).toBe(1);expect(state.doc.firstChild?.type.name).toBe('code_block');
  expect(state.doc.firstChild?.textContent).toBe('if x:\n\n    print("<>&")');
  expect(state.doc.firstChild?.attrs.params).toBe('python');
});
it('空选区插入可直接输入的空代码块，不吃掉原段落',()=>{
  const e=editor('原正文',4);expect(e.run(codeBlockCommand('python'))).toBe(true);
  expect(e.state.doc.textContent).toBe('原正文');
  expect(e.state.selection.$from.parent.type.name).toBe('code_block');
  expect(e.state.selection.$from.parent.textContent).toBe('');
});
it.each([['abc',1],['abc\n\n```js\n原有代码\n```',1],['> abc',2],['- abc',3]] as const)('段首插入定位到新空块，不会把光标送入后方已有代码：%s',(raw,pos)=>{
  const e=editor(raw,pos),before=e.state.doc.textContent;
  expect(e.run(codeBlockCommand('python'))).toBe(true);
  expect(e.state.selection.$from.parent.type.name).toBe('code_block');
  expect(e.state.selection.$from.parent.attrs.params).toBe('python');
  expect(e.state.selection.$from.parent.textContent).toBe('');
  expect(e.state.doc.textContent).toBe(before);
});
it('已有代码不套第二层，换语言仅改语言并保留额外信息',()=>{
  const e=editor('````js title="示例"\nconst text = "```";\n````',3);
  const original=e.state.doc;expect(e.run(codeBlockCommand('python'))).toBe(true);expect(e.state.doc.eq(original)).toBe(true);
  e.run(codeLanguageCommand('typescript'));
  expect(e.state.doc.firstChild?.attrs.params).toBe('typescript title="示例"');
  expect(e.state.doc.firstChild?.textContent).toBe('const text = "```";');
});
it.each(['c#','f#','objective-c','application/json'])('既有合法语言 %s 可保留和再次选择，不抛异常或改正文',language=>{
  const e=editor('```'+language+' linenos\n原有代码\n```',2),before=e.state.doc;
  expect(e.run(codeBlockCommand(language))).toBe(true);expect(e.state.doc.eq(before)).toBe(true);
  e.run(codeLanguageCommand(language));expect(e.state.doc.eq(before)).toBe(true);
});
it('格式操作可以撤销回原文；选区含图片或跨已有代码块时拒绝有损转换',()=>{
  const e=editor('普通代码',1,5),original=e.state.doc;e.run(codeBlockCommand('python'));
  expect(e.run(undo)).toBe(true);expect(e.state.doc.eq(original)).toBe(true);
  for(const raw of ['正文\n\n![配图](writer-asset:abc)','正文\n\n```js\nx\n```']){
    const doc=parseWriterMarkdown(raw),state=EditorState.create({doc,selection:TextSelection.create(doc,1,doc.content.size-1)});
    expect(codeBlockCommand('python')(state)).toBe(false);
  }
});
it('源码空选区插入空块，光标停在块内，周围正文保留',()=>{
  const result=markdownCodeBlock('前文后文',2,2,'python');
  expect(result.body).toBe('前文\n\n```python\n\n```\n\n后文');
  expect(result.start).toBe(result.end);expect(result.body.slice(0,result.start)).toBe('前文\n\n```python\n');
});
it('源码选中代码保留CRLF并选用比内容更长的围栏',()=>{
  const code='if ok:\r\n    print("```")',raw='前文\r\n\r\n'+code+'\r\n\r\n后文',start=raw.indexOf(code);
  const result=markdownCodeBlock(raw,start,start+code.length,'python');
  expect(result.body).toBe('前文\r\n\r\n````python\r\n'+code+'\r\n````\r\n\r\n后文');
  expect(result.body.slice(result.start,result.end)).toBe(code);
});
it('源码中已有代码不嵌套，语言调整保留长波浪线与其他资料，正文操作移除围栏',()=>{
  const raw='前文\n\n~~~~js title="例"\n  const a=1;\n~~~~\n\n后文',pos=raw.indexOf('const');
  expect(markdownCodeBlock(raw,pos,pos,'python').body).toBe(raw);
  const changed=markdownCodeBlock(raw,pos,pos,'typescript','language');
  expect(changed.body).toBe(raw.replace('~~~~js','~~~~typescript'));
  expect(markdownCodeBlock(raw,pos,pos,'','paragraph').body).toBe('前文\n\n  const a=1;\n\n后文');
});
it('跨既有代码的选区与嵌套容器明确拒绝，未闭合代码保持原文',()=>{
  expect(()=>markdownCodeBlock('文字\n\n```py\nx\n```',0,12,'python')).toThrow();
  expect(()=>markdownCodeBlock('> ```py\n> x\n> ```',12,12,'python')).toThrow();
  const open='```python\nprint(1)';expect(markdownCodeBlock(open,15,15,'python').body).toBe(open);
});
it.each(['```python\nx\n```\n','> ```python\n> x\n> ```\n'])('闭合围栏下一空行不是前一个代码块：%s',raw=>{
  const end=raw.length;
  expect(markdownCodeBlock(raw,end,end,'javascript','language').body).toBe(raw);
  expect(markdownCodeBlock(raw,end,end,'','paragraph').body).toBe(raw);
  const result=markdownCodeBlock(raw,end,end,'python');expect(result.body.startsWith(raw)).toBe(true);
  expect(parseWriterMarkdown(result.body).lastChild?.type.name).toBe('code_block');
  expect(parseWriterMarkdown(result.body).lastChild?.textContent).toBe('');
});
it('未闭合围栏后的EOF空行仍属于原代码，不插第二层',()=>{
  const raw='```python\nx\n';expect(markdownCodeBlock(raw,raw.length,raw.length,'python').body).toBe(raw);
});
it('源码光标移入已有块时读取真实语言，闭合块后不沿用前块语言',()=>{
  const raw='```javascript\nx\n```\n';
  expect(markdownCodeLanguage(raw,15,15)).toBe('javascript');
  expect(markdownCodeLanguage(raw,raw.length,raw.length)).toBeNull();
  expect(markdownCodeLanguage('```c# linenos\nx\n```',15,15)).toBe('c#');
});
it('实际文章渲染保留代码缩进并转义 HTML，使用语言语法高亮',async()=>{
  const raw=markdownCodeBlock('print("<script>")',0,17,'python').body;
  const processor=await createSatteriMarkdownProcessor(),rendered=await processor.render(raw);
  expect(rendered.code).toContain('<pre');expect(rendered.code).toContain('astro-code');
  expect(rendered.code).not.toContain('<script>');expect(rendered.metadata.headings).toHaveLength(0);
});
