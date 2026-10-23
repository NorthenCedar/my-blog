import { EditorState,type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Slice,Fragment } from 'prosemirror-model';
import { baseKeymap,setBlockType,toggleMark,wrapIn } from 'prosemirror-commands';
import { history,undo,redo,closeHistory } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { wrapInList,splitListItem,liftListItem,sinkListItem } from 'prosemirror-schema-list';
import { parseWriterMarkdown,serializeWriterMarkdown,visualMarkdownIssue,writerSchema as schema } from './markdown';
import { safeWriterImage,safeWriterLink } from './preview';
import { el,button,field } from './ui';

type Options={onChange:()=>void;onImageFiles:(files:File[])=>void;resolveImage:(source:string)=>string|null;onError:(error:Error)=>void};

/** 正文编辑边界：对外只有 Markdown，保存、恢复和发布不认识编辑器内部结构。 */
export function mountWriterBody(host:HTMLElement,initial:string,options:Options){
  let raw=initial,sourceMode=!!visualMarkdownIssue(initial),destroyed=false;
  let original={raw:initial,doc:parseWriterMarkdown(initial)};
  const modes=el('div','','writer-toolbar'),toolbar=el('div','','writer-toolbar writer-format'),visual=el('div'),source=el('textarea'),note=el('p','','writer-note');
  source.className='writer-body';source.value=raw;source.spellcheck=false;source.setAttribute('aria-label','正文 Markdown 源码');
  const visualButton=button('可视化编辑',()=>switchMode(false)),sourceButton=button('Markdown 源码',()=>switchMode(true));
  modes.append(visualButton,sourceButton);host.append(el('p','正文','writer-body-label'),modes,note,toolbar,visual,source);
  const block=el('select');block.className='writer-block-type';block.setAttribute('aria-label','正文与标题级别');
  for(const [value,label]of [['0','正文'],['2','章节标题（进入目录）'],['3','小标题（进入目录）']]){const option=el('option',label);option.value=value;block.append(option);}
  const blockLabel=el('label','段落格式','writer-block-label');blockLabel.append(block);toolbar.append(blockLabel);
  const controls:{button:HTMLButtonElement;command:Command;mark?:string}[]=[];
  function run(command:Command){
    if(destroyed||sourceMode)return false;
    if(view.composing){options.onError(Error('请先完成当前文字输入，再设置格式。'));return false;}
    // 每次工具栏操作独立撤销；普通输入继续由 history 合并。
    view.dispatch(closeHistory(view.state.tr));const applied=command(view.state,view.dispatch,view);view.focus();return applied;
  }
  function add(label:string,command:Command,mark?:string){const b=button(label,()=>run(command));b.addEventListener('mousedown',event=>event.preventDefault());controls.push({button:b,command,mark});toolbar.append(b);return b;}
  add('粗体',toggleMark(schema.marks.strong),'strong');add('斜体',toggleMark(schema.marks.em),'em');
  add('无序列表',wrapInList(schema.nodes.bullet_list));add('有序列表',wrapInList(schema.nodes.ordered_list));add('引用',wrapIn(schema.nodes.blockquote));
  const linkForm=el('form','','writer-link-form'),href=field('链接地址（https://…）','url'),text=field('显示文字（未选中文字时填写）');linkForm.hidden=true;
  const linkButton=button('链接',()=>{linkForm.hidden=!linkForm.hidden;if(!linkForm.hidden)href.input.focus();});linkButton.addEventListener('mousedown',e=>e.preventDefault());toolbar.append(linkButton);
  const insert=el('button','插入链接');insert.type='submit';linkForm.append(href.label,text.label,insert,button('取消',()=>{linkForm.hidden=true;view.focus();}));host.append(linkForm);
  linkForm.addEventListener('submit',event=>{
    event.preventDefault();const url=safeWriterLink(href.input.value.trim(),location.origin);
    if(!url||!href.input.value.trim()){options.onError(Error('请输入 HTTP、HTTPS 或邮件链接。'));return;}
    run((state,dispatch)=>{
      const {from,to,empty}=state.selection,mark=schema.marks.link.create({href:url});let tr=state.tr;
      if(empty){const label=text.input.value.trim()||url;tr=tr.insertText(label,from,to).addMark(from,from+label.length,mark);}
      else tr=tr.addMark(from,to,mark);
      dispatch?.(tr.scrollIntoView());return true;
    });linkForm.hidden=true;
  });
  add('移除链接',(state,dispatch)=>{dispatch?.(state.tr.removeMark(state.selection.from,state.selection.to,schema.marks.link));return !state.selection.empty;});
  add('撤销',undo);add('重做',redo);
  block.addEventListener('change',()=>run(setBlockType(block.value==='0'?schema.nodes.paragraph:schema.nodes.heading,block.value==='0'?undefined:{level:Number(block.value)})));

  const plugins=()=>[history(),keymap({
    'Mod-z':undo,'Mod-y':redo,'Mod-Shift-z':redo,'Mod-b':toggleMark(schema.marks.strong),'Mod-i':toggleMark(schema.marks.em),
    Enter:splitListItem(schema.nodes.list_item),'Mod-[':liftListItem(schema.nodes.list_item),'Mod-]':sinkListItem(schema.nodes.list_item),
  }),keymap(baseKeymap)];
  const view=new EditorView(visual,{
    state:EditorState.create({doc:original.doc,plugins:plugins()}),
    attributes:{class:'writer-visual','aria-label':'正文可视化编辑','role':'textbox','aria-multiline':'true',spellcheck:'false'},
    dispatchTransaction(transaction){
      if(destroyed)return;view.updateState(view.state.apply(transaction));
      if(transaction.docChanged){raw=serializeWriterMarkdown(view.state.doc,original);source.value=raw;options.onChange();}
      updateControls();
    },
    nodeViews:{image(node){
      const dom=el('span','','writer-inline-image'),resolved=options.resolveImage(node.attrs.src),safe=resolved?safeWriterImage(resolved,location.origin):null;
      dom.contentEditable='false';if(safe){const image=el('img');image.src=safe;image.alt=node.attrs.alt||'配图';image.draggable=false;dom.append(image);}else dom.textContent=`[配图：${node.attrs.alt||'待获取'}]`;
      return {dom};
    }},
    handlePaste(editor,event){
      const images=Array.from(event.clipboardData?.files??[]).filter(f=>f.type.startsWith('image/'));
      if(images.length){options.onImageFiles(images);return true;}
      // 外来 HTML 不进入文档；剪贴板文本不执行标签或请求图片。
      const value=event.clipboardData?.getData('text/plain')??'';
      if(value){
        if(editor.state.selection.$from.parent.type===schema.nodes.code_block)editor.dispatch(editor.state.tr.insertText(value));
        else{const paragraphs=value.split(/\r\n?|\n/).map(line=>schema.nodes.paragraph.create(null,line?schema.text(line):null));editor.dispatch(editor.state.tr.replaceSelection(new Slice(Fragment.fromArray(paragraphs),1,1)).scrollIntoView());}
        return true;
      }
      return !!event.clipboardData?.getData('text/html');
    },
    handleDrop(_editor,event,moved){
      if(moved)return false;
      const images=Array.from(event.dataTransfer?.files??[]).filter(f=>f.type.startsWith('image/'));
      if(images.length)options.onImageFiles(images);return true;
    },
    handleClick(_editor,_pos,event){if((event.target as Element).closest('a')){event.preventDefault();return true;}return false;},
  });
  function updateControls(){
    const state=view.state,{$from,$to}=state.selection;
    block.value=$from.parent=== $to.parent&&$from.parent.type===schema.nodes.heading?String($from.parent.attrs.level):'0';
    for(const control of controls){control.button.disabled=!control.command(state);if(control.mark)control.button.setAttribute('aria-pressed',String(state.selection.empty?!!schema.marks[control.mark].isInSet(state.storedMarks??$from.marks()):state.doc.rangeHasMark(state.selection.from,state.selection.to,schema.marks[control.mark])));}
  }
  function updateMode(){
    const issue=visualMarkdownIssue(raw);source.hidden=!sourceMode;visual.hidden=sourceMode;toolbar.hidden=sourceMode;linkForm.hidden=true;
    visualButton.disabled=!!issue;visualButton.setAttribute('aria-pressed',String(!sourceMode));sourceButton.setAttribute('aria-pressed',String(sourceMode));
    note.textContent=issue?`正文包含${issue}，请在源码模式编辑；原始内容会完整保留。`:'选中正文后设置格式。章节标题和小标题会自动进入发布页的本文目录。';
  }
  function switchMode(next:boolean){
    if(next===sourceMode)return;
    if(view.composing){options.onError(Error('请先完成当前文字输入，再切换编辑模式。'));return;}
    if(!next){if(visualMarkdownIssue(raw))return;
      // 只在源码实际变化时建立新状态，单纯来回切换不会清空撤销历史。
      if(serializeWriterMarkdown(view.state.doc,original)!==raw){original={raw,doc:parseWriterMarkdown(raw)};view.updateState(EditorState.create({doc:original.doc,plugins:plugins()}));}
    }
    sourceMode=next;updateMode();updateControls();if(sourceMode)source.focus();else view.focus();
  }
  source.addEventListener('input',()=>{raw=source.value;updateMode();options.onChange();});
  source.addEventListener('paste',event=>{const files=Array.from(event.clipboardData?.files??[]).filter(f=>f.type.startsWith('image/'));if(files.length){event.preventDefault();options.onImageFiles(files);}});
  updateMode();updateControls();
  return {
    getMarkdown:()=>raw,
    insertImage(src:string,alt:string){
      if(sourceMode){const start=source.selectionStart??raw.length,end=source.selectionEnd??start,md=`\n![${alt.replace(/[\\\[\]]/g,'\\$&')}](${src})\n`;source.setRangeText(md,start,end,'end');source.dispatchEvent(new Event('input',{bubbles:true}));return true;}
      return run((state,dispatch)=>{dispatch?.(state.tr.replaceSelectionWith(schema.nodes.image.create({src,alt})).scrollIntoView());return true;});
    },
    removeImage(src:string){
      if(sourceMode){
        // 特殊旧文中的原始图片引用也由源码编辑；删除资产时不得改写代码示例或视频。
        if(raw.includes(src)){options.onError(Error('请先在正文源码中移除这张图片的引用，再从上传列表移除配图。'));return false;}
      }else{
        const positions:{from:number;to:number}[]=[];view.state.doc.descendants((node,pos)=>{if(node.type===schema.nodes.image&&node.attrs.src===src)positions.push({from:pos,to:pos+node.nodeSize});});
        if(positions.length){const tr=closeHistory(view.state.tr);for(const p of positions.reverse())tr.delete(p.from,p.to);view.dispatch(tr);}
      }
      return true;
    },
    destroy(){destroyed=true;view.destroy();},
  };
}
