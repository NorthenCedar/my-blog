import { AllSelection,TextSelection,type Command } from 'prosemirror-state';
import { closeHistory } from 'prosemirror-history';

type Change={at:number;remove:number;insert:string};

/** 位置使用编辑器的 UTF-16 偏移；仅改空格，原有 CRLF、空行和 Tab 保留。 */
export function indentText(body:string,start:number,end:number,outdent=false,wholeLines=false){
  const changes:Change[]=[];
  if(!outdent&&!wholeLines&&!/[\r\n]/.test(body.slice(start,end))){
    changes.push({at:start,remove:end-start,insert:'    '});
  }else{
    let first=start;
    while(first>0&&!/[\r\n]/.test(body[first-1]))first--;
    const breaks=/\r\n|\r|\n/g;breaks.lastIndex=first;
    let at=first;
    while(true){
      const remove=outdent?/^ {0,4}/.exec(body.slice(at))![0].length:0;
      if(!outdent||remove)changes.push({at,remove,insert:outdent?'':'    '});
      const next=breaks.exec(body);
      if(!next||next.index+next[0].length>=end)break;
      at=next.index+next[0].length;
    }
  }
  const map=(position:number)=>{
    let delta=0;
    for(const change of changes){
      if(position<change.at)break;
      if(position<change.at+change.remove)return change.at+delta+change.insert.length;
      delta+=change.insert.length-change.remove;
    }
    return position+delta;
  };
  let updated=body;
  for(const change of changes.slice().reverse())updated=updated.slice(0,change.at)+change.insert+updated.slice(change.at+change.remove);
  return {body:updated,start:map(start),end:map(end),changes};
}

/** 按文本行编辑事务，跨段落也不重建节点，图片、标记及列表层级不会丢失。 */
export function tabIndentCommand(outdent=false):Command{
  return (state,dispatch,view)=>{
    if(view?.composing)return false;
    const selection=state.selection instanceof AllSelection
      ?TextSelection.between(state.doc.resolve(0),state.doc.resolve(state.doc.content.size)):state.selection;
    if(!(selection instanceof TextSelection))return false;
    const {from,to,$from,$to}=selection;
    if(!$from.parent.isTextblock)return false;
    const same=$from.sameParent($to);
    const text=$from.parent.textBetween(0,$from.parent.content.size,'',node=>node.type.name==='hard_break'?'\n':'\ufffc');
    const localFrom=$from.parentOffset,localTo=$to.parentOffset;
    const single=same&&!/[\r\n]/.test(text.slice(localFrom,localTo));
    // 单行替换只针对文字，不能用 Tab 把选中的行内图片删掉。
    if(!outdent&&single&&text.slice(localFrom,localTo).includes('\ufffc'))return false;
    const changes:Change[]=[];
    if(!outdent&&single)changes.push({at:from,remove:to-from,insert:'    '});
    else state.doc.descendants((node,pos)=>{
      if(!node.isTextblock)return;
      const start=pos+1,end=start+node.content.size;
      if(selection.empty?start>$from.pos||end<$from.pos:to<=start||from>end)return false;
      const value=node.textBetween(0,node.content.size,'',leaf=>leaf.type.name==='hard_break'?'\n':'\ufffc');
      const result=indentText(value,Math.max(0,from-start),Math.min(value.length,to-start),outdent,true);
      for(const change of result.changes)changes.push({...change,at:start+change.at});
      return false;
    });
    if(dispatch&&changes.length){
      const tr=closeHistory(state.tr);
      for(const change of changes.sort((a,b)=>b.at-a.at)){
        // 行首空格不继承强调，避免 Markdown 将其排出标记；行内和代码格式继续保留。
        const place=state.doc.resolve(change.at);
        const prefix=place.parent.textBetween(0,place.parentOffset,'',leaf=>leaf.type.name==='hard_break'?'\n':'\ufffc');
        const suffix=place.parent.textBetween(place.parentOffset+change.remove,place.parent.content.size,'',leaf=>leaf.type.name==='hard_break'?'\n':'\ufffc');
        const atLineStart=!prefix||/[\r\n]$/.test(prefix);
        const atLineEnd=!suffix||/^[\r\n]/.test(suffix);
        const marks=(state.storedMarks??place.marks()).filter(mark=>(!atLineStart&&!atLineEnd)||mark.type.name==='code');
        if(change.insert)tr.replaceWith(change.at,change.at+change.remove,state.schema.text(change.insert,marks));
        else tr.delete(change.at,change.at+change.remove);
      }
      tr.setSelection(!outdent&&single?TextSelection.create(tr.doc,from+4)
        :TextSelection.create(tr.doc,tr.mapping.map(selection.anchor,1),tr.mapping.map(selection.head,1)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
