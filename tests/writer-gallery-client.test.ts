import {writerFixture} from './_writer';
import { afterEach,expect,it,vi } from 'vitest';
import { mountWriterEditor } from '../src/scripts/writer/editor';
import { mountPublish } from '../src/scripts/writer/publish';
// DOM 边界只提供浏览器节点/事件；字段组件、保存控制器和发布确认均运行真实实现。
// ProseMirror 的编辑/撤销/IME 由既有用例覆盖，本组只保持正文以检查字段保存没有改文。
vi.mock('../src/scripts/writer/images',()=>({prepareWriterImage:async(blob:Blob)=>({blob,width:(await blob.text())==='w'?1600:800,height:(await blob.text())==='w'?900:1200,previewUrl:URL.createObjectURL(blob),originalSize:blob.size})}));
vi.mock('../src/scripts/writer/body-editor',()=>({mountWriterBody:(_host:unknown,body:string)=>({getMarkdown:()=>body,destroy(){},insertImage:()=>true,removeImage:()=>true})}));
class Node extends EventTarget{
  children:Node[]=[];own='';tagName:string;value='';name='';type='';className='';hidden=false;disabled=false;dataset:Record<string,string>={};attrs:Record<string,string>={};isConnected=true;
  ownerDocument:any;documentElement:any;head:any;body:any;contentDocument:any;contentWindow:any;
  naturalWidth=800;naturalHeight=1200;async decode(){}
  animations:any[]=[];
  animate(frames:any[],options:any){let finish!:()=>void,reject!:(error:Error)=>void;const animation:any={frames,options,cancelled:false,finished:new Promise<void>((resolve,no)=>{finish=resolve;reject=no;}),effect:{getKeyframes:()=>frames},finish:()=>finish(),cancel(){this.cancelled=true;reject(new Error('cancelled'));}};this.animations.push(animation);return animation;}
  style:any={setProperty(key:string,value:string){this[key]=value;}};
  classList={contains:(key:string)=>this.className.split(' ').includes(key),add:(key:string)=>{if(!this.classList.contains(key))this.className+=' '+key;},toggle:(key:string,on:boolean)=>{this.className=this.className.split(' ').filter(k=>k!==key).concat(on?[key]:[]).join(' ');}};
  querySelectorAll(selector:string){return this.all().filter(n=>selector==='[data-reveal]'?'reveal'in n.dataset:selector==='[data-draw]'?'draw'in n.dataset:false);}
  getBoundingClientRect(){return {width:800};}remove(){}
  constructor(tag:string){super();this.tagName=tag.toUpperCase();}
  set textContent(value:string){this.own=value;this.children=[];}get textContent():string{return this.own+this.children.map(c=>c.textContent).join('');}
  append(...nodes:Node[]){this.children.push(...nodes);}prepend(...nodes:Node[]){this.children.unshift(...nodes);}replaceChildren(...nodes:Node[]){this.own='';this.children=nodes;}
  setAttribute(k:string,v:string){this.attrs[k]=v;}getAttribute(k:string){return this.attrs[k]??null;}
  removeAttribute(k:string){delete this.attrs[k];}
  scrollIntoView(){}click(){this.dispatchEvent(new Event('click'));}
  focus(){(document as any).activeElement=this;}setCustomValidity(message:string){this.attrs.validity=message;}
  all():Node[]{return [this,...this.children.flatMap(c=>c.all())];}
}
let mounted:ReturnType<typeof mountWriterEditor>|undefined,publisher:ReturnType<typeof mountPublish>|undefined;
afterEach(async()=>{await mounted?.dispose();publisher?.dispose();mounted=undefined;publisher=undefined;vi.unstubAllGlobals();vi.useRealTimers();vi.restoreAllMocks();});
const settle=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function dom(){
 function makeDocument():any{const doc=new Node('document');const create=(tag:string)=>{const node=new Node(tag);node.ownerDocument=doc;if(tag==='iframe'){node.contentDocument=makeDocument();node.contentWindow={getComputedStyle:(n:Node)=>n.style};}return node;};Object.assign(doc,{documentElement:create('html'),head:create('head'),body:create('body'),createElement:create,createElementNS:(_ns:string,tag:string)=>create(tag),createDocumentFragment:()=>create('fragment'),createTextNode:(text:string)=>{const n=create('text');n.textContent=text;return n;},hidden:false});return doc;}
 const doc=makeDocument(),root=doc.createElement('div');vi.stubGlobal('document',doc);vi.stubGlobal('window',new EventTarget());vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('location',{origin:'https://northcedar.top',href:'https://northcedar.top/write/'});return root;
}
const find=(root:Node,text:string)=>root.all().find(n=>n.tagName==='BUTTON'&&n.own===text)!;
const input=(root:Node,name:string)=>root.all().find(n=>n.name===name)!;
const edit=(node:Node,value:string)=>{node.value=value;node.dispatchEvent(new Event('input'));};
async function open(kind:string,fields:Record<string,unknown>,assets:{sha256:string;alt:string}[]=[],recoveryCopies:any[]=[],baseExtras:Record<string,unknown>={},assetUpload?:(blob:Blob)=>Promise<{sha256:string}>){
  const root=dom(),draft={id:'a'.repeat(32),kind,key:kind==='forge'?'forge':'example',revision:1,publishedRevision:0,base:{commit:'1'.repeat(40),blobSha:'2'.repeat(40),text:'原文',...baseExtras},value:{fields,body:'原有\r\n正文\n',assets}},saved:any[]=[];
  const api=async(path:string)=>{
    if(path==='/content?mode=tags')return {tags:[]};if(path==='/drafts')return {drafts:[draft]};if(path.startsWith('/drafts?id='))return {draft};
    throw Error(path);
  };
  const request=async(path:string,init?:RequestInit)=>path==='/assets'?assetUpload!(init!.body as Blob):init?.method==='POST'?(()=>{const payload=JSON.parse(String(init.body));saved.push(payload);return {draft:{...draft,revision:payload.expectedRevision+1,value:payload.value}};})():api(path);
  const published:any[]=[];mounted=mountWriterEditor(root as any,request as any,{findDraft:async()=>recoveryCopies,put:async()=>{},remove:async()=>{}} as any,{user:{id:'owner',nickname:'站主'},publish:true,onPublish:async draft=>{published.push(draft);}});
  await settle();find(root,kind==='forge'?'forge':'example').click();await settle();return {root,draft,saved,published};
}
it('相册排序不改变独立封面，保留未知图片字段与正文，保存固定推荐',async()=>{
 const {root,saved}=await open('gallery',{title:'相册',date:'2026-11-01',images:[{src:'./a.webp',alt:'第一张',credit:'作者',width:800,height:1200},{src:'./b.webp',alt:'第二张'}],future:'保留'});
 expect(root.all().filter(n=>n.tagName==='IFRAME')).toHaveLength(4);expect(root.all().find(n=>n.tagName==='IFRAME')!.contentDocument.body.textContent).toContain('第一张');expect(input(root,'titleEn')).toBeDefined();expect(find(root,'重新推荐')).toBeDefined();
 find(root,'下移').click();find(root,'保存草稿').click();await settle();
 const value=saved.at(-1).value;expect(value.fields.cover).toBe('./a.webp');expect(value.fields.images.map((x:any)=>x.src)).toEqual(['./b.webp','./a.webp']);expect(value.fields.images[1].credit).toBe('作者');expect(value.fields.presentation.arrangement).toBe('left');expect(value.fields.future).toBe('保留');expect(value.body).toBe('原有\r\n正文\n');
});
it('相册图注独立编辑、移除只解除引用，发布前严格验证，草稿仍可保存空相册',async()=>{
 const {root,saved,published}=await open('gallery',{title:'相册',date:'2026-11-01',images:[{src:'./a.webp',alt:'第一张'}]});
 edit(input(root,'gallery-image-0-alt'),'');find(root,'发布').click();await settle();expect(published).toEqual([]);
 find(root,'移除图库项').click();find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.fields.images).toEqual([]);expect(saved.at(-1).value.fields).not.toHaveProperty('cover');
});
it('空册首次上传横图后保存按真实宽高固定编排，后续排序不会重新推荐',async()=>{
 const {mountGalleryFields}=await import('../src/scripts/writer/gallery-editor');const root=dom(),value:any={fields:{title:'横图新册',images:[],draft:true},body:'',assets:[]};
 const editor=mountGalleryFields(root as any,{value,onChange(){},resolveImage:()=>null});editor.addUploaded('a'.repeat(64),'横图',{width:1600,height:900});editor.prepare();expect(value.fields.cover).toBe('writer-asset:'+'a'.repeat(64));expect(value.fields.presentation.arrangement).toBe('wide');editor.destroy();
});
it('新相册入口接受中文固定标识并创建空的私密相册',async()=>{
 const root=dom(),created:any[]=[];const api=async(path:string,init?:RequestInit)=>{if(path==='/content?mode=tags')return {tags:[]};if(path==='/drafts'&&!init)return {drafts:[]};if(init){const payload=JSON.parse(String(init.body));created.push(payload);return {draft:{id:'a'.repeat(32),kind:payload.kind,key:payload.key,revision:1,publishedRevision:0,base:null,value:payload.value}};}throw Error(path);};
 mounted=mountWriterEditor(root as any,api as any,{findDraft:async()=>[],put:async()=>{}} as any,{user:{id:'owner',nickname:'站主'},publish:true});await settle();find(root,'新相册').click();await settle();edit(input(root,'key'),'我的新相册');edit(input(root,'title'),'相册标题');root.all().find(n=>n.tagName==='FORM')!.dispatchEvent(new Event('submit',{cancelable:true}));await settle();expect(created[0]).toMatchObject({action:'create',kind:'gallery',key:'我的新相册',value:{fields:{title:'相册标题',draft:true,images:[]},body:'',assets:[]}});expect(input(root,'key')).toBeUndefined();
});
it('主预览和所有编排缩略图都跟随当前标题更新',async()=>{
 const {root}=await open('gallery',{title:'旧标题',date:'2026-11-01',images:[{src:'./a.webp',alt:'照片'}]});edit(input(root,'title'),'新相册标题');
 for(const iframe of root.all().filter(n=>n.tagName==='IFRAME'))expect(iframe.contentDocument.body.textContent).toContain('新相册标题');
});

it('真实预览快速往返在翻入途中取消旧动画，目标先反向再归正，销毁后不闪回',async()=>{
 const {mountCoverPreview}=await import('../src/scripts/album-cover-preview.js');const {coverMotion}=await import('../src/scripts/gallery-cover-motion.mjs');
 const root=dom();vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();
 const preview=mountCoverPreview(root as any,{fields:{title:'往返测试',images:[],presentation:{transition:'perspective'}},resolveImage:()=>null});
 const slide=root.all().find(n=>n.tagName==='IFRAME')!.contentDocument.body.all().find((n:Node)=>n.classList.contains('slide')) as Node;
 const initial=slide.animations.at(-1);find(root,'快速往返').click();expect(initial.cancelled).toBe(true);
 const entering=slide.animations.at(-1);expect(entering.frames.at(-1)).toEqual(coverMotion('perspective',1).visible);
 await vi.advanceTimersByTimeAsync(170);expect(entering.cancelled).toBe(true);const reverse=slide.animations.at(-1);expect(reverse.frames.at(-1)).toEqual(coverMotion('perspective',-1).enter);
 reverse.finish();await settle();expect(slide.animations.at(-1).frames.at(-1)).toEqual(coverMotion('perspective',-1).visible);
 find(root,'快速往返').click();const count=slide.animations.length;preview.destroy();await vi.advanceTimersByTimeAsync(1000);await settle();expect(slide.animations).toHaveLength(count);expect(slide.animations.at(-1).cancelled).toBe(true);
});

it('旧册索引1只改图注仍固定right，真实横图只改标题仍固定wide且不写伪尺寸',async()=>{
 const {mountGalleryFields}=await import('../src/scripts/writer/gallery-editor');
 for(const [width,height,expected]of [[800,1200,'right'],[1600,900,'wide']] as const){
 const root=dom(),value:any={fields:{title:'旧册',images:[{src:'./old.webp',alt:'旧图'}]},body:'',assets:[]};
 const proto=Node.prototype as any,previous=proto.decode;proto.decode=async function(){this.naturalWidth=width;this.naturalHeight=height;};
 const editor=mountGalleryFields(root as any,{value,index:1,onChange(){},resolveImage:()=>'/api/writer/content?image=old'} as any);
 edit(input(root,expected==='right'?'gallery-image-0-alt':'title'),'修改文字');await editor.prepare();expect(value.fields.presentation.arrangement).toBe(expected);expect(value.fields).not.toHaveProperty('galleryIndex');expect(value.fields.images[0]).not.toHaveProperty('width');editor.destroy();proto.decode=previous;
 }
});

it('图片decode尚未完成时自动保存等待真实尺寸，标题快速输入不先保存错误竖幅',async()=>{
 let done!:()=>void;const decoded=new Promise<void>(resolve=>{done=resolve;});
 vi.spyOn(Node.prototype,'decode').mockImplementation(async function(this:Node){await decoded;this.naturalWidth=1600;this.naturalHeight=900;});
 const {root,saved}=await open('gallery',{title:'旧横图',date:'2026-11-01',images:[{src:'./old.webp',alt:'旧图'}]},[],[],{galleryIndex:1});vi.useFakeTimers();
 edit(input(root,'title'),'快速新标题');await vi.advanceTimersByTimeAsync(2000);expect(saved).toEqual([]);
 done();await settle();expect(saved).toHaveLength(1);expect(saved[0].value.fields.presentation.arrangement).toBe('wide');expect(saved[0].value.fields.images[0]).not.toHaveProperty('width');
});

it('相册两张空图注全部上传保持顺序且重复触发不重传，之后仅补图库图注即可发布',async()=>{
 const uploaded:string[]=[];let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 const {root,saved,published}=await open('gallery',{title:'相册',date:'2026-11-01',images:[],draft:true},[],[],{},async blob=>{const key=await blob.text();uploaded.push(key);if(key==='a')await wait;return {sha256:key.repeat(64)};});
 const choose=root.all().find(n=>n.type==='file')!;(choose as any).files=[new Blob(['a']),new Blob(['b'])];choose.dispatchEvent(new Event('change'));await settle();
 find(root,'全部上传到相册').click();find(root,'全部上传到相册').click();await settle();expect(uploaded).toEqual(['a']);release();await settle();expect(uploaded).toEqual(['a','b']);
 find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.fields.images.map((x:any)=>[x.src,x.alt])).toEqual([['writer-asset:'+'a'.repeat(64),''],['writer-asset:'+'b'.repeat(64),'']]);
 expect(root.all().filter(n=>n.tagName==='LABEL'&&n.own==='图片说明')).toHaveLength(0);find(root,'发布').click();await settle();expect(published).toEqual([]);
 edit(input(root,'gallery-image-0-alt'),'第一张');edit(input(root,'gallery-image-1-alt'),'第二张');find(root,'发布').click();await settle();expect(published).toHaveLength(1);
});
it('相册批量上传失败保留剩余pending，重试不会重新上传已完成图片',async()=>{
 const uploaded:string[]=[];let fail=true;const {root,saved}=await open('gallery',{title:'相册',date:'2026-11-01',images:[],draft:true},[],[],{},async blob=>{const key=await blob.text();uploaded.push(key);if(key==='b'&&fail){fail=false;throw Error('测试断网');}return {sha256:key.repeat(64)};});
 const choose=root.all().find(n=>n.type==='file')!;(choose as any).files=[new Blob(['a']),new Blob(['b'])];choose.dispatchEvent(new Event('change'));await settle();find(root,'全部上传到相册').click();await settle();expect(uploaded).toEqual(['a','b']);expect(root.textContent).toContain('测试断网');
 find(root,'全部上传到相册').click();await settle();expect(uploaded).toEqual(['a','b','b']);find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.fields.images).toHaveLength(2);
});

it('相册批量上传期间切册，旧响应不写入新册且不继续上传旧pending',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;}),uploaded:string[]=[];
 const {root}=await open('gallery',{title:'旧册',date:'2026-11-01',images:[],draft:true},[],[],{},async blob=>{const key=await blob.text();uploaded.push(key);await wait;return {sha256:key.repeat(64)};});
 const choose=root.all().find(n=>n.type==='file')!;(choose as any).files=[new Blob(['a']),new Blob(['b'])];choose.dispatchEvent(new Event('change'));await settle();find(root,'全部上传到相册').click();await settle();find(root,'新相册').click();await settle();release();await settle();expect(uploaded).toEqual(['a']);expect(root.textContent).toContain('新建相册');expect(input(root,'gallery-image-0-alt')).toBeUndefined();expect(mounted!.getDraft()).toBeUndefined();
});
it('相册批量上传内容相同的文件按图源去重',async()=>{
 const {root,saved}=await open('gallery',{title:'相册',date:'2026-11-01',images:[],draft:true},[],[],{},async()=>({sha256:'a'.repeat(64)}));
 const choose=root.all().find(n=>n.type==='file')!;(choose as any).files=[new Blob(['a']),new Blob(['a'])];choose.dispatchEvent(new Event('change'));await settle();find(root,'全部上传到相册').click();await settle();find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.fields.images).toHaveLength(1);expect(saved.at(-1).value.assets).toHaveLength(1);
});

it('空册经手动或自动保存仍不预先固定构图，首张横图上传后固定wide',async()=>{
 for(const automatic of [false,true]){
 const {root,saved}=await open('gallery',{title:'空册',date:'2026-11-01',images:[],draft:true},[],[],{},async()=>({sha256:'c'.repeat(64)}));
 if(automatic)vi.useFakeTimers();edit(input(root,'title'),'保存空册');if(automatic){await vi.advanceTimersByTimeAsync(2000);}else{find(root,'保存草稿').click();await settle();}
 expect(saved.at(-1).value.fields).not.toHaveProperty('presentation');vi.useRealTimers();
 const choose=root.all().find(n=>n.type==='file')!;(choose as any).files=[new Blob(['w'])];choose.dispatchEvent(new Event('change'));await settle();find(root,'全部上传到相册').click();await settle();find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.fields.presentation.arrangement).toBe('wide');await mounted!.dispose();mounted=undefined;
 }
});
it('文章与项目仍要求上传前说明，相册空图注规则不放宽其他类型',async()=>{
 for(const kind of ['post','project']){let calls=0;const {root}=await open(kind,{title:'内容',images:[]},[],[],{},async()=>{calls++;return {sha256:'a'.repeat(64)};});const choose=root.all().find(n=>n.getAttribute('aria-label')==='选择配图')!;(choose as any).files=[new Blob(['a'])];choose.dispatchEvent(new Event('change'));await settle();find(root,'上传并添加').click();await settle();expect(calls).toBe(0);expect(root.textContent).toContain('请先填写图片说明');await mounted!.dispose();mounted=undefined;}
});
it('云端写作台独立上传文章封面，保存后可清除，正文保持原样',async()=>{
 const {root,saved}=await open('post',{title:'文章'},[],[],{},async()=>({sha256:'a'.repeat(64)}));
 const choose=input(root,'post-cover-upload');
 (choose as any).files=[new Blob(['a'])];choose.dispatchEvent(new Event('change'));await settle();
 const alt=root.all().find(n=>n.tagName==='LABEL'&&n.own==='封面说明（上传前必填）')!.children[0];
 edit(alt,'文章封面图');
 find(root,'上传为封面').click();await settle();
 find(root,'保存草稿').click();await settle();
 expect(saved.at(-1).value.fields).toMatchObject({cover:'writer-asset:'+'a'.repeat(64),coverAlt:'文章封面图'});
 expect(saved.at(-1).value.body).toBe('原有\r\n正文\n');
 find(root,'清除封面').click();find(root,'保存草稿').click();await settle();
 expect(saved.at(-1).value.fields).toMatchObject({cover:'',coverAlt:''});
});

it('空册主动选择完整编排后保存并上传横图仍保留明确选择',async()=>{
 const {root,saved}=await open('gallery',{title:'空册',date:'2026-11-01',images:[],draft:true},[],[],{},async()=>({sha256:'d'.repeat(64)}));find(root,'圈注 · 显影').click();find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.fields.presentation).toMatchObject({arrangement:'right',transition:'reveal'});
 const choose=root.all().find(n=>n.type==='file')!;(choose as any).files=[new Blob(['w'])];choose.dispatchEvent(new Event('change'));await settle();find(root,'全部上传到相册').click();await settle();find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.fields.presentation).toMatchObject({arrangement:'right',transition:'reveal'});
});

it('移除上传照片释放草稿资产关联和100张名额，缓存仍可读取且可再新增',async()=>{
 const {writerProof}=await import('../functions/api/_lib/writer-auth');const {createDraft,saveDraft}=await import('../functions/api/_lib/writer-drafts');const {readAsset}=await import('../functions/api/_lib/writer-assets');
 const session=await writerFixture();session.sqlite.exec((await import('node:fs')).readFileSync('migrations/0009_writer_gallery.sql','utf8'));const proof=await writerProof(session.request(),{id:session.owner,auth_version:0} as never);
 const assets=Array.from({length:100},(_,n)=>({sha256:(n+1).toString(16).padStart(64,'0'),alt:'图'+n})),extra='f'.repeat(64);
 for(const sha of [...assets.map(a=>a.sha256),extra])session.sqlite.prepare('INSERT INTO writer_assets(owner,sha256,width,height,bytes,size,created_at) VALUES(?,?,800,1200,?,1,1)').run(session.owner,sha,new Uint8Array([1]));
 const fields={title:'满额相册',date:'2026-11-01',images:assets.map(asset=>({src:'writer-asset:'+asset.sha256,alt:asset.alt,width:800,height:1200}))};
 const draft=await createDraft(session.db,proof,{kind:'gallery',key:'example',base:null,value:{fields,body:'',assets}});
 const {root,saved}=await open('gallery',fields,assets,[],{},async()=>({sha256:extra}));
 find(root,'移除图库项').click();expect(mounted!.getDraft()!.value.assets).toHaveLength(99);expect(mounted!.getDraft()!.value.assets[0].sha256).toBe(assets[1].sha256);for(let i=1;i<100;i++)find(root,'移除图库项').click();find(root,'保存草稿').click();for(let i=0;i<8;i++)await settle();expect(saved.at(-1).value.assets).toEqual([]);
 const empty=await saveDraft(session.db,proof,{id:draft.id,requestId:'a'.repeat(32),expectedRevision:1,value:saved.at(-1).value});expect(empty.value.assets).toEqual([]);expect(session.sqlite.prepare('SELECT count(*) AS n FROM writer_draft_assets WHERE draft_id=?').get(draft.id)?.n).toBe(0);
 expect(new Uint8Array((await readAsset(session.db,session.owner,assets[0].sha256)).bytes)).toEqual(new Uint8Array([1]));expect(session.sqlite.prepare('SELECT count(*) AS n FROM writer_assets').get()?.n).toBe(101);
 const choose=root.all().find(n=>n.type==='file')!;(choose as any).files=[new Blob(['w'])];choose.dispatchEvent(new Event('change'));await settle();find(root,'全部上传到相册').click();await settle();find(root,'保存草稿').click();await settle();expect(saved.at(-1).value.assets).toEqual([{sha256:extra,alt:''}]);
 await saveDraft(session.db,proof,{id:draft.id,requestId:'b'.repeat(32),expectedRevision:2,value:saved.at(-1).value});expect(session.sqlite.prepare('SELECT sha256 FROM writer_draft_assets WHERE draft_id=?').all(draft.id)).toEqual([{sha256:extra}]);
});
