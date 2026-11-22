import { afterEach,expect,it,vi } from 'vitest';
import { mountWriterEditor } from '../src/scripts/writer/editor';
import { mountPublish } from '../src/scripts/writer/publish';
import type { WriterDraft } from '../src/lib/writer/model';
import type { RecoveryRecord } from '../src/scripts/writer/recovery';
// DOM 边界只提供浏览器节点/事件；字段组件、保存控制器和发布确认均运行真实实现。
// ProseMirror 的编辑/撤销/IME 由既有用例覆盖，本组只保持正文以检查字段保存没有改文。
vi.mock('../src/scripts/writer/body-editor',()=>({mountWriterBody:(_host:unknown,body:string)=>({getMarkdown:()=>body,destroy(){},insertImage:()=>true,removeImage:()=>true})}));
class Node extends EventTarget{
  children:Node[]=[];own='';tagName:string;value='';name='';type='';className='';hidden=false;disabled=false;dataset:Record<string,string>={};attrs:Record<string,string>={};isConnected=true;
  constructor(tag:string){super();this.tagName=tag.toUpperCase();}
  set textContent(value:string){this.own=value;this.children=[];}get textContent():string{return this.own+this.children.map(c=>c.textContent).join('');}
  append(...nodes:Node[]){this.children.push(...nodes);}prepend(...nodes:Node[]){this.children.unshift(...nodes);}replaceChildren(...nodes:Node[]){this.own='';this.children=nodes;}
  setAttribute(k:string,v:string){this.attrs[k]=v;}getAttribute(k:string){return this.attrs[k]??null;}removeAttribute(k:string){delete this.attrs[k];}
  scrollIntoView(){}click(){this.dispatchEvent(new Event('click'));}
  focus(){(document as any).activeElement=this;}setCustomValidity(message:string){this.attrs.validity=message;}
  all():Node[]{return [this,...this.children.flatMap(c=>c.all())];}
}
let mounted:ReturnType<typeof mountWriterEditor>|undefined,publisher:ReturnType<typeof mountPublish>|undefined;
afterEach(async()=>{await mounted?.dispose();publisher?.dispose();mounted=undefined;publisher=undefined;vi.unstubAllGlobals();});
const settle=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function dom(){const root=new Node('div'),doc=new Node('document');Object.assign(doc,{createElement:(tag:string)=>new Node(tag),createDocumentFragment:()=>new Node('fragment'),createTextNode:(text:string)=>{const n=new Node('text');n.textContent=text;return n;},hidden:false});vi.stubGlobal('document',doc);vi.stubGlobal('window',new EventTarget());vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('location',{origin:'https://northcedar.top'});return root;}
const find=(root:Node,text:string)=>root.all().find(n=>n.tagName==='BUTTON'&&n.own===text)!;
const input=(root:Node,name:string)=>root.all().find(n=>n.name===name)!;
const edit=(node:Node,value:string)=>{node.value=value;node.dispatchEvent(new Event('input'));};
async function open(kind:string,fields:Record<string,unknown>,assets:{sha256:string;alt:string}[]=[],recoveryCopies:any[]=[]){
  const root=dom(),draft={id:'a'.repeat(32),kind,key:kind==='forge'?'forge':'example',revision:1,publishedRevision:0,base:{commit:'1'.repeat(40),blobSha:'2'.repeat(40),text:'原文'},value:{fields,body:'原有\r\n正文\n',assets}},saved:any[]=[];
  const api=async(path:string)=>{
    if(path==='/content?mode=tags')return {tags:[]};if(path==='/drafts')return {drafts:[draft]};if(path.startsWith('/drafts?id='))return {draft};
    throw Error(path);
  };
  const request=async(path:string,init?:RequestInit)=>init?.method==='POST'?(()=>{const payload=JSON.parse(String(init.body));saved.push(payload);return {draft:{...draft,revision:payload.expectedRevision+1,value:payload.value}};})():api(path);
  const published:any[]=[];mounted=mountWriterEditor(root as any,request as any,{findDraft:async()=>recoveryCopies,put:async()=>{},remove:async()=>{}} as any,{user:{id:'owner',nickname:'站主'},publish:true,onPublish:async draft=>{published.push(draft);}});
  await settle();find(root,kind==='forge'?'forge':'example').click();await settle();return {root,draft,saved,published};
}

function delayedDraftSelection() {
  const root = dom();
  const drafts: WriterDraft[] = ['first', 'second'].map((key, index) => ({
    id: String(index + 1).repeat(32), kind: 'post', key, revision: 1, publishedRevision: 0, base: null,
    value: { fields: { title: key }, body: key + ' 正文', assets: [] },
  }));
  const reads = drafts.map(() => Promise.withResolvers<{ draft: WriterDraft }>());
  const requested: { id: string; signal?: AbortSignal | null }[] = [];
  const saved: { id: string; value: WriterDraft['value'] }[] = [];
  const findDraft = vi.fn(async (_owner: string, _id: string): Promise<RecoveryRecord[]> => []);
  async function api(path: string, init?: RequestInit) {
    if (path === '/content?mode=tags') return { tags: [] };
    if (path === '/drafts' && !init) return { drafts };
    if (path === '/drafts' && init?.method === 'POST') {
      const input = JSON.parse(String(init.body));
      saved.push(input);
      return { draft: { revision: input.expectedRevision + 1 } };
    }
    const index = drafts.findIndex(draft => path === '/drafts?id=' + draft.id);
    if (index < 0) throw Error(path);
    requested.push({ id: drafts[index].id, signal: init?.signal });
    return reads[index].promise;
  }
  mounted = mountWriterEditor(root as any, api as any, { findDraft, put: async () => {}, remove: async () => {} } as any, {
    user: { id: 'owner', nickname: '站主' }, publish: true,
  });
  const editor = mounted;
  const read = (index: number) => reads[index].resolve({ draft: drafts[index] });
  return { root, drafts, read, requested, saved, findDraft, editor };
}

it('草稿读取乱序时仍编辑最后选择的一份，新输入和原正文能一起保存', async () => {
  const { root, drafts, read, requested, saved, editor } = delayedDraftSelection();
  await settle();
  find(root, 'first').click(); await settle();
  find(root, 'second').click(); await settle();
  expect(requested.map(request => request.id)).toEqual(drafts.map(draft => draft.id));
  read(1); await settle();
  expect(editor.getDraft()?.id).toBe(drafts[1].id);
  edit(input(root, 'title'), '保留这次输入');
  read(0); await settle();

  expect(editor.getDraft()?.id).toBe(drafts[1].id);
  expect(input(root, 'title').value).toBe('保留这次输入');
  expect(requested[0].signal?.aborted).toBe(true);
  find(root, '保存草稿').click(); await settle();
  expect(saved.at(-1)).toMatchObject({ id: drafts[1].id, value: { fields: { title: '保留这次输入' }, body: 'second 正文' } });
});

it('准备切换草稿时仍能编辑当前稿，读完后先保存这段输入再切换', async () => {
  const { root, drafts, read, saved, editor } = delayedDraftSelection();
  await settle();
  find(root, 'second').click(); await settle();
  read(1); await settle();
  find(root, 'first').click(); await settle();
  edit(input(root, 'title'), '等待读取时修改的标题');
  read(0); await settle();

  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ id: drafts[1].id, value: { fields: { title: '等待读取时修改的标题' } } });
  expect(editor.getDraft()?.id).toBe(drafts[0].id);
});

it.each(['云端草稿', '本机副本'])('旧%s正在读取时，新建表单及其中的输入仍保留', async delayed => {
  const { root, drafts, read, findDraft } = delayedDraftSelection();
  const copies = Promise.withResolvers<RecoveryRecord[]>();
  findDraft.mockReturnValueOnce(copies.promise);
  await settle();
  find(root, 'first').click(); await settle();
  if (delayed === '本机副本') {
    read(0); await settle();
    expect(findDraft).toHaveBeenCalledWith('owner', drafts[0].id);
  }
  find(root, '新文章').click(); await settle();
  edit(input(root, 'title'), '新文章标题');
  if (delayed === '云端草稿') read(0);
  copies.resolve([{
    key: 'owner/' + drafts[0].id + '/new', user: 'owner', draftId: drafts[0].id,
    value: { ...drafts[0].value, body: '旧恢复副本' }, revision: 1, pending: null,
    serial: 1, pendingSerial: 0, updatedAt: Date.now(),
  }]);
  await settle();
  expect(input(root, 'title').value).toBe('新文章标题');
  expect(input(root, 'key')).toBeDefined();
  expect(root.textContent).not.toContain('发现本设备恢复副本');
});

it('清理账户时取消草稿读取，迟到结果不再读取旧账户的本机副本', async () => {
  const { root, read, requested, findDraft, editor } = delayedDraftSelection();
  await settle();
  find(root, 'first').click(); await settle();
  await editor.dispose();
  read(0); await settle();

  expect(findDraft).not.toHaveBeenCalled();
  expect(requested[0].signal?.aborted).toBe(true);
  expect(root.textContent).toBe('');
});

it('项目只改文案仍保存原模型、预览、未知字段与原正文，不写入文章日期',async()=>{
  const {root,saved}=await open('project',{title:'项目标题',summary:'旧摘要',tagline:'一句话',category:'TOOL',status:'持续打磨',order:2,tags:['工具'],visual:'desk',effect:'tilt',images:[],links:[],preview:{name:'原模型'},future:{keep:true}});
  expect(root.textContent).toContain('造物台项目');expect(input(root,'summary')).toBeDefined();expect(input(root,'date')).toBeUndefined();
  edit(input(root,'summary'),'新的项目摘要');find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value).toMatchObject({fields:{summary:'新的项目摘要',visual:'desk',preview:{name:'原模型'},future:{keep:true}},body:'原有\r\n正文\n'});
  expect(saved.at(-1).value.fields).not.toHaveProperty('date');
});
it('页面文案的三条提示和工作手记可编辑，保留未知字段与原正文且不提供配图',async()=>{
  const {root,saved}=await open('forge',{title:'造物台',description:'旧说明',stages:['一','二','三'],notes:[{title:'手记',text:'原手记'}],future:'保留'});
  expect(input(root,'description')).toBeDefined();expect(input(root,'stage-2')).toBeDefined();expect(input(root,'date')).toBeUndefined();expect(find(root,'添加工作手记')).toBeDefined();
  edit(input(root,'description'),'新说明');edit(input(root,'stage-2'),'第三条新提示');find(root,'添加工作手记').click();edit(input(root,'note-1-title'),'新手记');edit(input(root,'note-1-text'),'新的记录');find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value).toEqual({fields:{title:'造物台',description:'新说明',stages:['一','二','第三条新提示'],notes:[{title:'手记',text:'原手记'},{title:'新手记',text:'新的记录'}],future:'保留'},body:'原有\r\n正文\n',assets:[],audios:[]});
  expect(root.all().some(n=>n.type==='file')).toBe(false);
});
it('发布项目和页面文案显示准确类型与有效摘要，确认前不发起发布',async()=>{
  const root=dom(),requests:string[]=[];publisher=mountPublish(root as any,(async(path:string)=>{requests.push(path);throw Error('不应请求');}) as any,{owner:'owner'});
  await publisher.open({kind:'project',key:'example',value:{fields:{title:'项目',summary:'项目摘要'},body:'',assets:[]}} as any);
  expect(root.textContent).toContain('造物台项目');expect(root.textContent).toContain('项目摘要');expect(requests).toEqual([]);
  await publisher.open({kind:'forge',key:'forge',value:{fields:{title:'造物台',description:'页面介绍'},body:'',assets:[]}} as any);
  expect(root.textContent).toContain('造物台页面文案');expect(root.textContent).toContain('页面介绍');expect(requests).toEqual([]);
});
it('图库选亮暗图不丢键盘焦点，预览实际受控图片，保存封面排序与暗色引用',async()=>{
  const sha='a'.repeat(64),dark='b'.repeat(64),{root,saved}=await open('project',{title:'项目',visual:'image',images:[{src:'./old.webp',alt:'原封面'},{src:'writer-asset:'+sha,alt:'第二张'}]},[{sha256:sha,alt:'亮色图'},{sha256:dark,alt:'暗色图'}]);
  const select=input(root,'image-0-darkSrc');select.focus();select.value='writer-asset:'+dark;select.dispatchEvent(new Event('change'));
  expect(root.all()).toContain((document as any).activeElement);
  expect(root.all().filter(n=>n.tagName==='IMG').map(n=>(n as any).src)).toContain('/api/writer/assets?sha256='+dark);
  expect(root.all().filter(n=>n.tagName==='IMG').map(n=>(n as any).src)).toContain('/api/writer/content?commit='+'1'.repeat(40)+'&image=content%2Fprojects%2Fexample%2Fold.webp');
  find(root,'下移').click();find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value.fields.images).toEqual([{src:'writer-asset:'+sha,alt:'第二张'},{src:'./old.webp',alt:'原封面',darkSrc:'writer-asset:'+dark}]);
  expect(saved.at(-1).value.assets).toHaveLength(2);
});
it('不安全项目链接可保留在私密草稿以便修正，但不能进入发布确认',async()=>{
  const {root,published}=await open('project',{title:'项目',visual:'site',links:[{label:'项目介绍',href:'/archive/',future:'保留'}]});
  edit(input(root,'link-0-href'),'https://name:secret@example.com/');find(root,'发布').click();await settle();
  expect(published).toEqual([]);expect(root.textContent).toContain('项目链接');
  edit(input(root,'link-0-href'),'/forge/');find(root,'发布').click();await settle();
  expect(published[0].value.fields.links).toEqual([{label:'项目介绍',href:'/forge/',future:'保留'}]);
});
it('已有项目的平铺文件名与点斜杠配图均可预览，跨目录图片不生成读取请求',async()=>{
  const {root}=await open('project',{title:'项目',visual:'image',images:[{src:'机器人 正面.webp',alt:'正面'},{src:'../other.webp',alt:'越界'}]});
  const sources=root.all().filter(n=>n.tagName==='IMG').map(n=>(n as any).src);
  expect(sources).toContain('/api/writer/content?commit='+'1'.repeat(40)+'&image=content%2Fprojects%2Fexample%2F%E6%9C%BA%E5%99%A8%E4%BA%BA%20%E6%AD%A3%E9%9D%A2.webp');
  expect(sources.some(source=>source?.includes('other.webp'))).toBe(false);
});
it('新项目创建使用固定英文网址、照片模板与自动动效，创建后网址没有编辑入口',async()=>{
  const root=dom(),created:any[]=[];
  const api=async(path:string,init?:RequestInit)=>{
    if(init){const payload=JSON.parse(String(init.body));created.push(payload);return {draft:{id:'a'.repeat(32),kind:payload.kind,key:payload.key,revision:1,base:null,publishedRevision:0,value:payload.value}};}
    if(path==='/content?mode=tags')return {tags:[]};if(path==='/drafts')return {drafts:[]};throw Error(path);
  };
  mounted=mountWriterEditor(root as any,api as any,{findDraft:async()=>[],put:async()=>{},remove:async()=>{}} as any,{user:{id:'owner',nickname:'站主'},publish:true});await settle();
  find(root,'新项目').click();await settle();edit(input(root,'key'),'my-project');edit(input(root,'title'),'新作品');root.all().find(n=>n.tagName==='FORM')!.dispatchEvent(new Event('submit',{cancelable:true}));await settle();
  expect(created).toEqual([{action:'create',kind:'project',key:'my-project',value:{fields:{title:'新作品',summary:'',tagline:'',category:'',status:'',order:0,tags:[],visual:'image',effect:'auto',images:[],links:[]},body:'',assets:[]}}]);
  expect(input(root,'key')).toBeUndefined();expect(root.textContent).toContain('my-project');
  expect(input(root,'visual').children.map(option=>option.value)).toEqual(['image']);
});
it('造物台页面入口导入固定单页，不能另建任意页面',async()=>{
  const root=dom(),imports:any[]=[],paths:string[]=[],draft={id:'a'.repeat(32),kind:'forge',key:'forge',revision:1,base:null,publishedRevision:0,value:{fields:{title:'造物台'},body:'',assets:[]}};
  const api=async(path:string,init?:RequestInit)=>{paths.push(path);if(init){imports.push(JSON.parse(String(init.body)));return {draft};}if(path==='/content?mode=tags')return {tags:[]};if(path==='/drafts')return {drafts:[]};if(path==='/content?kind=forge&page=1')return {commit:'1'.repeat(40),items:[{key:'forge',title:'造物台页头和手记'}],more:false};throw Error(path);};
  mounted=mountWriterEditor(root as any,api as any,{findDraft:async()=>[],put:async()=>{},remove:async()=>{}} as any,{user:{id:'owner',nickname:'站主'},publish:true});await settle();find(root,'页面文案').click();await settle();find(root,'造物台页头和手记').click();await settle();
  expect(paths).toContain('/content?kind=forge&page=1');expect(imports).toEqual([{action:'import',kind:'forge',key:'forge'}]);expect(input(root,'title')).toBeDefined();expect(find(root,'新页面')).toBeUndefined();
});
it('友链分类支持导入友链页并新增、保存友链条目',async()=>{
  const root=dom(),imports:any[]=[],saved:any[]=[],draft={id:'b'.repeat(32),kind:'forge',key:'links',revision:1,base:{commit:'1'.repeat(40),blobSha:'2'.repeat(40),text:'原文'},publishedRevision:0,value:{fields:{title:'友链',intro:'一些常去的角落',groups:[{title:'友情链接',note:'互相惦记的邻居',items:[{name:'北杉札记',href:'https://northcedar.top/',desc:'旧友'}]}]},body:'正文\n',assets:[]}};
  const api=async(path:string,init?:RequestInit)=>{
    if(init){
      const body=JSON.parse(String(init.body));
      if(body.action==='import'){imports.push(body);return {draft};}
      if(body.action==='save'){saved.push(body);return {draft:{...draft,revision:body.expectedRevision+1,value:body.value}};}
    }
    if(path==='/content?mode=tags')return {tags:[]};
    if(path==='/drafts')return {drafts:[]};
    if(path==='/content?kind=links&page=1')return {commit:'1'.repeat(40),items:[{key:'links',title:'友链'}],more:false};
    throw Error(path);
  };
  mounted=mountWriterEditor(root as any,api as any,{findDraft:async()=>[],put:async()=>{},remove:async()=>{}} as any,{user:{id:'owner',nickname:'站主'},publish:true});
  await settle();
  find(root,'友链').click();await settle();
  find(root,'友链').click();await settle();
  const listBtn=root.all().filter(n=>n.tagName==='BUTTON'&&n.own==='友链').at(-1)!;
  listBtn.click();await settle();
  expect(imports).toEqual([{action:'import',kind:'forge',key:'links'}]);
  find(root,'＋ 添加友链').click();
  edit(input(root,'group-0-item-1-name'),'新朋友');
  edit(input(root,'group-0-item-1-href'),'https://friend.example.com/');
  edit(input(root,'group-0-item-1-desc'),'新站点介绍');
  find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value.fields.groups[0].items).toEqual([
    {name:'北杉札记',href:'https://northcedar.top/',desc:'旧友'},
    {name:'新朋友',href:'https://friend.example.com/',desc:'新站点介绍'},
  ]);
});
it('图库最多六项、链接和标签最多四项，移除图库不误删已上传资产',async()=>{
  const images=Array.from({length:6},(_,i)=>({src:`./photo-${i}.webp`,alt:`照片${i}`})),{root,saved}=await open('project',{title:'项目',images,links:[{label:'一',href:'/one/'},{label:'二',href:'/two/'},{label:'三',href:'/three/'},{label:'四',href:'/four/'}],tags:['一','二','三','四']},[{sha256:'a'.repeat(64),alt:'待使用'}]);
  expect(find(root,'添加图库图片').disabled).toBe(true);expect(find(root,'添加项目链接').disabled).toBe(true);expect(find(root,'添加标签').disabled).toBe(true);
  find(root,'移除图库项').click();find(root,'添加图库图片').click();find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value.fields.images).toHaveLength(6);expect(saved.at(-1).value.fields.images[0]).toEqual({src:'./photo-1.webp',alt:'照片1'});expect(saved.at(-1).value.fields.images[5]).toEqual({src:'writer-asset:'+'a'.repeat(64),alt:'待使用'});expect(saved.at(-1).value.assets).toEqual([{sha256:'a'.repeat(64),alt:'待使用'}]);
});
it('项目恢复副本对照呈现文案字段，选择恢复后保存该版本及原正文',async()=>{
  const copy={key:'owner/'+'a'.repeat(32)+'/'+'1'.repeat(40),user:'owner',draftId:'a'.repeat(32),value:{fields:{title:'项目',summary:'本设备恢复摘要',visual:'desk',preview:{name:'原模型'}},body:'恢复正文',assets:[]},revision:1,pending:null,serial:1,pendingSerial:0,updatedAt:Date.now()}, {root,saved}=await open('project',{title:'项目',summary:'云端摘要',visual:'desk',preview:{name:'原模型'}},[],[copy]);
  expect(root.all().filter(n=>n.tagName==='TEXTAREA').some(n=>n.value.includes('本设备恢复摘要'))).toBe(true);
  expect(root.all().filter(n=>n.tagName==='TEXTAREA').some(n=>n.value.includes('云端摘要'))).toBe(true);
  find(root,'恢复本设备版本').click();await settle();expect(input(root,'summary').value).toBe('本设备恢复摘要');find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value).toEqual(copy.value);
});
it.each([['site',{wordmark:'原网站模型'}],['desk',{write:'原写作台模型'}]] as const)('已有 %s 模型能切换照片并切回，选项不提供另一种空模型',async(model,preview)=>{
  const {root,saved}=await open('project',{title:'项目',visual:model,preview});
  const select=input(root,'visual');expect(select.children.map(option=>option.value)).toEqual(['image',model]);
  select.value='image';select.dispatchEvent(new Event('change'));select.value=model;select.dispatchEvent(new Event('change'));find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value.fields).toEqual({title:'项目',visual:model,preview});
});
it.each([['site',{wordmark:'保留的网站模型'}],['desk',{write:'保留的写作台模型'}]] as const)('照片项目保留原 %s 预览资料时能切回该模型',async(model,preview)=>{
  const {root,saved}=await open('project',{title:'项目',visual:'image',preview});
  const select=input(root,'visual');expect(select.children.map(option=>option.value)).toEqual(['image',model]);
  select.value=model;select.dispatchEvent(new Event('change'));find(root,'保存草稿').click();await settle();
  expect(saved.at(-1).value.fields).toEqual({title:'项目',visual:model,preview});
});
