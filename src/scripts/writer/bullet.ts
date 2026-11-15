type TextEdit={body:string;start:number;end:number};

/** 逐行切开源码：offset 是行首在原文里的位置，newline 原样保留（只认 CRLF / LF）。 */
function textLines(raw:string){
  const lines:{text:string;offset:number;newline:string}[]=[];
  for(const match of raw.matchAll(/([^\r\n]*)(\r?\n|$)/g)){
    if(!match[0]&&raw&&!raw.endsWith('\n'))continue;
    lines.push({text:match[1],offset:match.index??0,newline:match[2]});
  }
  return lines;
}

/** 围栏块内的行不参与行首编辑；沿用 CommonMark 的 ``` / ~~~ 记法。 */
function codeLines(texts:string[]){
  const flags:boolean[]=[];
  let fence:string|null=null;
  for(const [index,text] of texts.entries()){
    const marker=/^ {0,3}(`{3,}|~{3,})/.exec(text);
    if(fence){
      flags[index]=true;
      if(marker&&marker[1][0]===fence[0]&&marker[1].length>=fence.length&&/^[ \t]*$/.test(text.slice(marker[0].length)))fence=null;
    }else if(marker&&!(marker[1][0]==='`'&&text.slice(marker[0].length).includes('`'))){fence=marker[1];flags[index]=true;}
    else flags[index]=false;
  }
  return flags;
}

/**
 * 行首圆点：给选中的每一行加「- 」，整段都已有圆点时再次调用即取消。
 * 空行、围栏代码、缩进代码、标题、引用与表格原样保留——给它们加圆点只会把 Markdown 写坏。
 */
export function markdownBullet(raw:string,start:number,end:number):TextEdit{
  if(start===end&&!raw.trim())return {body:'- ',start:2,end:2};
  const lines=textLines(raw);
  const first=Math.max(0,lines.findLastIndex(line=>line.offset<=start));
  const last=Math.max(first,lines.findLastIndex(line=>line.offset<end||line.offset<=start));
  const code=codeLines(lines.map(line=>line.text));
  const targets:number[]=[];
  for(let index=first;index<=last;index++){
    const text=lines[index].text;
    if(!text.trim()||code[index]||/^\s*(?:[#<>|]|`{3,}|~{3,})/.test(text)||/^(?:(?: {0,3}>[ \t]?)+)?(?: {4}|\t)/.test(text))continue;
    targets.push(index);
  }
  if(!targets.length)throw Error('选中的行是空行、代码、标题或引用，圆点未改动。');
  const remove=targets.every(index=>/^- /.test(lines[index].text));
  const steps=new Map(targets.map(index=>[index,remove?-2:/^- /.test(lines[index].text)?0:2] as const));
  const body=lines.map((line,index)=>{
    const step=steps.get(index);
    if(step===undefined)return line.text+line.newline;
    if(remove)return line.text.slice(2)+line.newline;
    return (step?'- ':'')+line.text+line.newline;
  }).join('');
  const map=(position:number)=>{
    let delta=0;
    for(const [index,step] of steps)if(position>lines[index].offset)delta+=step;
    return Math.max(0,position+delta);
  };
  return {body,start:map(start),end:map(end)};
}