import { expect,it,vi } from 'vitest';
import { renderWriterMarkdown } from '../src/scripts/writer/preview';

// 仅替代DOM容器，执行真实预览器；浏览器另外验实际文字样式和撤销。
class PreviewNode {
  children:PreviewNode[]=[];
  constructor(public tagName:string,public textContent=''){}
  append(...nodes:PreviewNode[]){this.children.push(...nodes);}
}
it('预览的加粗、斜体和删除线可组合，代码及HTML符号保持文字',()=>{
  vi.stubGlobal('location',{origin:'https://northcedar.top'});
  vi.stubGlobal('document',{createDocumentFragment:()=>new PreviewNode('fragment'),createElement:(tag:string)=>new PreviewNode(tag),createTextNode:(text:string)=>new PreviewNode('#text',text)});
  try{
    const root=renderWriterMarkdown('**加粗** *斜体* ~~删 **嵌套**~~ `~~原代码~~` <script>x</script>',()=>null) as unknown as PreviewNode;
    const all:PreviewNode[]=[];const visit=(node:PreviewNode)=>{all.push(node);node.children.forEach(visit);};visit(root);
    expect(all.filter(n=>n.tagName==='strong')).toHaveLength(2);
    expect(all.some(n=>n.tagName==='em'&&n.children.some(c=>c.textContent==='斜体'))).toBe(true);
    expect(all.some(n=>n.tagName==='s'&&n.children.some(c=>c.tagName==='strong'))).toBe(true);
    expect(all.some(n=>n.tagName==='code'&&n.textContent==='~~原代码~~')).toBe(true);
    expect(all.some(n=>n.tagName==='script')).toBe(false);
    expect(all.map(n=>n.textContent).join('')).toContain('<script>x</script>');
    const multiline=renderWriterMarkdown('<del>甲\\\n乙</del>',()=>null) as unknown as PreviewNode;
    expect(multiline.children[0].children[0].tagName).toBe('s');
    expect(multiline.children[0].children[0].children.some(node=>node.tagName==='br')).toBe(true);
    const blankCode=renderWriterMarkdown('前 `    ` 后',()=>null) as unknown as PreviewNode;
    expect(blankCode.children[0].children.find(node=>node.tagName==='code')?.textContent).toBe('    ');
  }finally{vi.unstubAllGlobals();}
});
