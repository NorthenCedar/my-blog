import { EditorState,type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Slice,Fragment } from 'prosemirror-model';
import { baseKeymap,setBlockType,toggleMark,wrapIn } from 'prosemirror-commands';
import { history,undo,redo,closeHistory } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { wrapInList,splitListItem,liftListItem,sinkListItem } from 'prosemirror-schema-list';
import { parseWriterMarkdown,serializeWriterMarkdown,visualMarkdownIssue,writerSchema as schema } from './markdown';
import { safeWriterImage,safeWriterLink } from './preview';
import { codeBlockCommand,codeLanguageCommand,markdownCodeBlock,markdownCodeLanguage } from './code-block';
import { markdownBullet } from './bullet';
import { markdownFormat,markdownLink,markdownUnlink,sourceFormatActive,type SourceFormat } from './source-format';
import { appendParagraph,padAfterCode } from './code-exit';
import { indentText,tabIndentCommand } from './indentation';
import { el,button,field } from './ui';

type Options={onChange:()=>void;onImageFiles:(files:File[])=>void;resolveImage:(source:string)=>string|null;onError:(error:Error)=>void};

/**
 * 表格源码 → 只读预览。
 * 单元格里的强调符号只用来**显示**（去掉 `**` 与反引号），原文完整存在节点属性里，
 * 保存时按原字节写回，所以这里怎么显示都不会改到源码。
 */
function tablePreview(text:string):HTMLElement{
  const table=el('table','','writer-raw-table');
  const split=(line:string)=>{
    const body=line.trim().replace(/^\|/,'').replace(/\|$/,'');
    const cells:string[]=[];
    let cell='';
    for(let i=0;i<body.length;i++){
      const char=body[i];
      if(char==='\\'&&body[i+1]==='|'){cell+='|';i++;continue;}
      if(char==='|'){cells.push(cell);cell='';continue;}
      cell+=char;
    }
    cells.push(cell);
    return cells.map(value=>value.trim());
  };
  const plain=(value:string)=>value.replace(/`([^`]*)`/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1');
  const rows=text.split(/\r?\n/).filter(line=>line.trim()!=='');
  const align=/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;
  const head=split(rows[0]??'');
  const body=align.test(rows[1]??'')?rows.slice(2):rows.slice(1);
  const headRow=el('tr');
  for(const value of head){const th=el('th');th.textContent=plain(value);th.title=value;headRow.append(th);}
  const thead=el('thead');thead.append(headRow);table.append(thead);
  const tbody=el('tbody');
  for(const line of body){
    const tr=el('tr');
    for(const value of split(line)){const td=el('td');td.textContent=plain(value);td.title=value;tr.append(td);}
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

/** 正文编辑边界：对外只有 Markdown，保存、恢复和发布不认识编辑器内部结构。 */
export function mountWriterBody(host:HTMLElement,initial:string,options:Options){
  let raw=initial,sourceMode=!!visualMarkdownIssue(initial),destroyed=false;
  let original={raw:initial,doc:parseWriterMarkdown(initial)};
  const modes=el('div','','writer-toolbar'),toolbar=el('div','','writer-toolbar writer-format'),visual=el('div'),source=el('textarea'),note=el('p','','writer-note');
  source.className='writer-body';source.value=raw;source.spellcheck=false;source.setAttribute('aria-label','正文 Markdown 源码');
  const visualButton=button('可视化编辑',()=>switchMode(false)),sourceButton=button('Markdown 源码',()=>switchMode(true));
  const codeTools=el('div','','writer-toolbar'),language=el('select');language.className='writer-code-language';language.setAttribute('aria-label','代码语言');
  for(const [value,label]of [['python','Python'],['c','C'],['cpp','C++'],['javascript','JavaScript'],['typescript','TypeScript'],['json','JSON'],['bash','Bash / Shell'],['text','纯文本']]){const option=el('option',label);option.value=value;language.append(option);}
  let preferredLanguage='python';
  function showLanguage(value:string){
    if(!Array.from(language.options).some(option=>option.value===value)){const option=el('option',value);option.value=value;language.append(option);}
    language.value=value;
  }
  const codeButton=button('代码块',()=>{if(sourceMode)editSourceCode('insert');else run(codeBlockCommand(language.value));});
  codeButton.addEventListener('mousedown',event=>event.preventDefault());
  const sourceParagraph=button('转为正文',()=>editSourceCode('paragraph'));
  sourceParagraph.addEventListener('mousedown',event=>event.preventDefault());
  const languageLabel=el('label','代码语言','writer-block-label');languageLabel.append(language);codeTools.append(codeButton,languageLabel,sourceParagraph);
  // 圆点两种模式都能用：可视化里是列表，源码里直接写「- 」，所以放在常驻的这排工具上。
  const bulletButton=button('圆点',()=>{if(sourceMode)editSourceBullet();else run(wrapInList(schema.nodes.bullet_list));});
  bulletButton.title='给选中的每一行加上「- 」圆点；整段都有圆点时再次点击取消';bulletButton.addEventListener('mousedown',event=>event.preventDefault());codeTools.append(bulletButton);
  modes.append(visualButton,sourceButton);host.append(el('p','正文','writer-body-label'),modes,note,codeTools,toolbar,visual,source);
  /* 站主 2026-11-16：段落格式不再用下拉选项，正文 / 章节标题 / 小标题各给一个按钮，
     可视化与 Markdown 源码两种模式都点得到（源码模式走 source-format 的纯函数）。 */
  const blockButtons:{level:0|2|3;button:HTMLButtonElement}[]=[];
  const blockGroup=el('div','','writer-block-group');
  blockGroup.setAttribute('role','group');blockGroup.setAttribute('aria-label','段落格式');
  for(const [level,label]of [[0,'正文'],[2,'章节标题'],[3,'小标题']] as const){
    const control=button(label,()=>{
      if(sourceMode){editSourceFormat(level===0?'h0':level===2?'h2':'h3');return;}
      run(setBlockType(level===0?schema.nodes.paragraph:schema.nodes.heading,level===0?undefined:{level}));
    });
    control.title=level===0?'设为正文段落（去掉标题）':`设为${label}，会进入本文目录`;
    control.addEventListener('mousedown',event=>event.preventDefault());
    blockButtons.push({level,button:control});blockGroup.append(control);
  }
  toolbar.append(blockGroup);
  const controls:{button:HTMLButtonElement;command:Command;mark?:string;format?:SourceFormat;source?:()=>void}[]=[];
  function run(command:Command){
    if(destroyed||sourceMode)return false;
    if(view.composing){options.onError(Error('请先完成当前文字输入，再设置格式。'));return false;}
    // 每次工具栏操作独立撤销；普通输入继续由 history 合并。
    view.dispatch(closeHistory(view.state.tr));const applied=command(view.state,view.dispatch,view);view.focus();return applied;
  }
  function add(label:string,command:Command,mark?:string,format?:SourceFormat,sourceAction?:()=>void){
    const b=button(label,()=>{
      if(destroyed)return;
      if(sourceMode){if(sourceAction)sourceAction();else if(format)editSourceFormat(format);return;}
      run(command);
    });
    b.addEventListener('mousedown',event=>event.preventDefault());controls.push({button:b,command,mark,format,source:sourceAction});toolbar.append(b);return b;
  }
  add('加粗',toggleMark(schema.marks.strong),'strong','strong');add('斜体',toggleMark(schema.marks.em),'em','em');add('删除线',toggleMark(schema.marks.strike),'strike','strike');
  add('无序列表',wrapInList(schema.nodes.bullet_list),undefined,'bullet');add('有序列表',wrapInList(schema.nodes.ordered_list),undefined,'ordered');add('引用',wrapIn(schema.nodes.blockquote),undefined,'quote');
  const linkForm=el('form','','writer-link-form'),href=field('链接地址（https://…）','url'),text=field('显示文字（未选中文字时填写）');linkForm.hidden=true;
  const linkButton=button('链接',()=>{linkForm.hidden=!linkForm.hidden;if(!linkForm.hidden)href.input.focus();});linkButton.addEventListener('mousedown',e=>e.preventDefault());toolbar.append(linkButton);
  const insert=el('button','插入链接');insert.type='submit';linkForm.append(href.label,text.label,insert,button('取消',()=>{linkForm.hidden=true;view.focus();}));host.append(linkForm);
  linkForm.addEventListener('submit',event=>{
    event.preventDefault();const url=safeWriterLink(href.input.value.trim(),location.origin);
    if(!url||!href.input.value.trim()){options.onError(Error('请输入 HTTP、HTTPS 或邮件链接。'));return;}
    if(sourceMode){
      // 源码模式直接改写 Markdown：有选中文字就包成 [文字](地址)。
      try{applySourceEdit(markdownLink(source.value,source.selectionStart,source.selectionEnd,url,text.input.value.trim()||undefined));}
      catch(error){options.onError(error instanceof Error?error:Error(String(error)));}
      linkForm.hidden=true;href.input.value='';text.input.value='';return;
    }
    run((state,dispatch)=>{
      const {from,to,empty}=state.selection,mark=schema.marks.link.create({href:url});let tr=state.tr;
      if(empty){const label=text.input.value.trim()||url;tr=tr.insertText(label,from,to).addMark(from,from+label.length,mark);}
      else tr=tr.addMark(from,to,mark);
      dispatch?.(tr.scrollIntoView());return true;
    });linkForm.hidden=true;
  });
  add('移除链接',(state,dispatch)=>{dispatch?.(state.tr.removeMark(state.selection.from,state.selection.to,schema.marks.link));return !state.selection.empty;},undefined,undefined,()=>{
    try{applySourceEdit(markdownUnlink(source.value,source.selectionStart,source.selectionEnd));}
    catch(error){options.onError(error instanceof Error?error:Error(String(error)));}
  });
  // 源码模式的撤销/重做交给 textarea 自己的撤销栈（工具栏改写也是用 execCommand 落盘的）。
  const sourceHistory=(action:'undo'|'redo')=>()=>{
    if(source.selectionStart===source.selectionEnd&&!source.value)return;
    source.focus();document.execCommand(action);
  };
  add('撤销',undo,undefined,undefined,sourceHistory('undo'));
  add('重做',redo,undefined,undefined,sourceHistory('redo'));
  language.addEventListener('change',()=>{
    preferredLanguage=language.value;
    if(sourceMode)editSourceCode('language');else if(codeLanguageCommand(language.value)(view.state))run(codeLanguageCommand(language.value));
  });
  let sourceComposing=false;
  source.addEventListener('compositionstart',()=>{sourceComposing=true;});source.addEventListener('compositionend',()=>{sourceComposing=false;});
  function updateSourceControls(){
    if(!sourceMode)return;
    const current=markdownCodeLanguage(source.value,source.selectionStart,source.selectionEnd);
    codeButton.setAttribute('aria-pressed',String(current!==null));sourceParagraph.disabled=current===null;
    showLanguage(current??preferredLanguage);
  }
  for(const event of ['select','keyup','click'])source.addEventListener(event,updateSourceControls);
  function applySourceEdit(result:{body:string;start:number;end:number}){
    if(result.body===source.value)return;
    const before=source.value,direction=source.selectionDirection,top=source.scrollTop,left=source.scrollLeft;
    let from=0,to=before.length,tail=result.body.length;
    while(from<to&&from<tail&&before[from]===result.body[from])from++;
    while(to>from&&tail>from&&before[to-1]===result.body[tail-1]){to--;tail--;}
    source.focus();source.setSelectionRange(from,to);
    // 原生事务触发 input，沿用既有保存流程并保留 Ctrl+Z/Y。
    document.execCommand('insertText',false,result.body.slice(from,tail));
    if(source.value!==result.body)throw Error('当前浏览器未能完成编辑操作，请保留正文后重试。');
    source.setSelectionRange(result.start,result.end,direction);source.scrollTop=top;source.scrollLeft=left;
  }
  source.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||event.ctrlKey||event.metaKey||event.altKey||source.readOnly||source.disabled||sourceComposing||event.isComposing||event.keyCode===229)return;
    event.preventDefault();
    try{applySourceEdit(indentText(source.value,source.selectionStart,source.selectionEnd,event.shiftKey));}
    catch(error){options.onError(error instanceof Error?error:Error(String(error)));}
  });
  function editSourceBullet(){
    if(sourceComposing){options.onError(Error('请先完成当前文字输入，再设置格式。'));return;}
    try{applySourceEdit(markdownBullet(source.value,source.selectionStart,source.selectionEnd));}
    catch(error){options.onError(error instanceof Error?error:Error(String(error)));}
  }
  function editSourceFormat(format:SourceFormat){
    if(sourceComposing){options.onError(Error('请先完成当前文字输入，再设置格式。'));return;}
    try{applySourceEdit(markdownFormat(source.value,source.selectionStart,source.selectionEnd,format));}
    catch(error){options.onError(error instanceof Error?error:Error(String(error)));}
  }
  function editSourceCode(action:'insert'|'language'|'paragraph'){
    if(sourceComposing){options.onError(Error('请先完成当前文字输入，再设置代码格式。'));return;}
    try{
      const result=markdownCodeBlock(source.value,source.selectionStart,source.selectionEnd,language.value,action);
      applySourceEdit(result);
    }catch(error){options.onError(error instanceof Error?error:Error(String(error)));}
  }

  // 光标在代码块里时怎么出去：站主 2026-11-16「正常换行用 ENTER，跳到外面用其他键」
  // ⇒ Enter 不抢（代码块里就是老实换行、列表里续行），跳出只认 Ctrl / ⌘ + Enter，
  // 点在块下方空白也落到同一个命令上。
  const padAfter=(editor:EditorView)=>{
    const command=appendParagraph();return command(editor.state,editor.dispatch,editor);
  };
  const plugins=()=>[history(),keymap({
    'Mod-z':undo,'Mod-y':redo,'Mod-Shift-z':redo,'Mod-b':toggleMark(schema.marks.strong),'Mod-i':toggleMark(schema.marks.em),'Mod-Shift-x':toggleMark(schema.marks.strike),
    // Enter 只做列表续行：代码块里 Enter 就是老实换行（站主 2026-11-16 的要求）。
    Enter:splitListItem(schema.nodes.list_item),
    // 跳出代码块只认这个组合键，光标在哪种块里、哪一行都能用。
    'Mod-Enter':(state,dispatch)=>padAfterCode()(state,dispatch)||padAfter(view),
    'Mod-[':liftListItem(schema.nodes.list_item),'Mod-]':sinkListItem(schema.nodes.list_item),
    Tab:tabIndentCommand(),'Shift-Tab':tabIndentCommand(true),
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
    },raw_block(node){
      // 只读小块：前后正文照常编辑，这一块保持原样（表格渲染成表格，HTML 露原文）。
      const dom=el('div','','writer-raw-block');
      dom.contentEditable='false';dom.dataset.kind=node.attrs.kind as string;
      dom.append(el('span',node.attrs.kind==='table'?'表格 · 只读（原文完整保留）':'视频 / HTML · 只读（原文完整保留）','writer-raw-label'));
      if(node.attrs.kind==='table')dom.append(tablePreview(node.attrs.text as string));
      else{const pre=el('pre','','writer-raw-source');pre.textContent=node.attrs.text as string;dom.append(pre);}
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
    handleClick(editor,pos,event){
      if((event.target as Element).closest('a')){event.preventDefault();return true;}
      // 点在正文末尾下方那片空白：最后一块是代码块 / 只读块时没有可落笔的位置，补一个空段落。
      const last=editor.state.doc.lastChild;
      if(pos>=editor.state.doc.content.size&&last&&(last.type===schema.nodes.code_block||last.type===schema.nodes.raw_block))return padAfter(editor);
      return false;
    },
  });
  function updateControls(){
    const state=view.state,{$from,$to}=state.selection;
    const inCode=$from.sameParent($to)&&$from.parent.type===schema.nodes.code_block;
    const level=$from.parent=== $to.parent&&$from.parent.type===schema.nodes.heading?Number($from.parent.attrs.level):0;
    // 源码模式没有编辑器状态可问，直接问那几行 Markdown 的写法。
    const marks=sourceMode?sourceFormatActive(source.value,source.selectionStart,source.selectionEnd):null;
    for(const entry of blockButtons)entry.button.setAttribute('aria-pressed',String(sourceMode?marks?.[entry.level===0?'h0':entry.level===2?'h2':'h3']??false:level===entry.level));
    codeButton.disabled=!sourceMode&&!codeBlockCommand(preferredLanguage)(state);codeButton.setAttribute('aria-pressed',String(!sourceMode&&inCode));
    const current=inCode?String($from.parent.attrs.params??'').split(/\s/)[0]||'text':preferredLanguage;
    if(!sourceMode)showLanguage(current);
    for(const control of controls){
      if(sourceMode){
        // 源码模式：只要这个按钮有对应的 Markdown 改写就能用。
        const usable=!!(control.format||control.source);control.button.disabled=!usable;
        control.button.setAttribute('aria-pressed',String(!!control.format&&!!marks?.[control.format]));
      }else{
        control.button.disabled=!control.command(state);
        if(control.mark)control.button.setAttribute('aria-pressed',String(state.selection.empty?!!schema.marks[control.mark].isInSet(state.storedMarks??$from.marks()):state.doc.rangeHasMark(state.selection.from,state.selection.to,schema.marks[control.mark])));
      }
    }
    updateSourceControls();
  }
  function updateMode(){
    const issue=visualMarkdownIssue(raw);source.hidden=!sourceMode;visual.hidden=sourceMode;linkForm.hidden=true;
    // 格式按钮在两种模式都留着（源码模式改写 Markdown 文本），不再整排藏起来。
    toolbar.hidden=false;
    sourceParagraph.hidden=!sourceMode;
    updateSourceControls();
    visualButton.disabled=!!issue;visualButton.setAttribute('aria-pressed',String(!sourceMode));sourceButton.setAttribute('aria-pressed',String(sourceMode));
    let frozen=0;view.state.doc.descendants(node=>{if(node.type===schema.nodes.raw_block)frozen++;});
    const hint=frozen?'表格与视频以只读小块保留（原文一个字节都不会改），要改它们请切到源码模式。':'';
    note.textContent=(issue?`正文包含${issue}，请在源码模式编辑；原始内容会完整保留。`:hint+'选中正文后设置格式。代码块可直接输入或粘贴代码，Ctrl / ⌘ + Enter 继续正文；章节标题和小标题会进入本文目录。')+' Tab 缩进四个空格，Shift+Tab 减少缩进。';
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
    /** 插入一条语音行 `!audio[说明](src)`：源码与视觉模式都按文本插入，发布前脚本会再按行匹配。 */
    insertAudio(src:string,label:string){
      const line=`!audio[${label.replace(/[\\\[\]]/g,'\\$&')}](${src})`;
      if(sourceMode){const start=source.selectionStart??raw.length,end=source.selectionEnd??start;source.setRangeText(`\n${line}\n`,start,end,'end');source.dispatchEvent(new Event('input',{bubbles:true}));return true;}
      return run((state,dispatch)=>{dispatch?.(state.tr.insertText(`\n${line}\n`).scrollIntoView());return true;});
    },
    /** 通用插入：`block` 为真时把 Markdown 片段解析成块、插到当前段落之后；带原始 HTML 的附件行强制走源码。 */
    insertText(markdown:string,block=false){
      if(sourceMode||(block&&markdown.includes('<'))){
        if(!sourceMode)switchMode(true);
        const start=source.selectionStart??raw.length,end=source.selectionEnd??start;
        source.setRangeText(markdown,start,end,'end');source.dispatchEvent(new Event('input',{bubbles:true}));return true;
      }
      if(!block)return run((state,dispatch)=>{dispatch?.(state.tr.insertText(markdown).scrollIntoView());return true;});
      const fragment=parseWriterMarkdown(markdown.trim()).content;
      return run((state,dispatch)=>{
        const selection=state.selection,after=selection.$from.depth?selection.$from.after(1):selection.from;
        dispatch?.(state.tr.insert(after,fragment).scrollIntoView());return true;
      });
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
