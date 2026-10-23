export const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
export function button(text:string,action:()=>unknown,className=''){const b=el('button',text,className);b.type='button';b.addEventListener('click',()=>{void action();});return b;}
export function field(title:string,type='text',wide=false){const label=el('label',title,'writer-field'+(wide?' wide':'')),input=el('input');input.type=type;label.append(input);return {label,input};}
export function download(name:string,bytes:BlobPart,type='application/json'){const url=URL.createObjectURL(new Blob([bytes],{type})),link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const errorText=(error:unknown)=>error instanceof Error?error.message:'操作未完成，输入仍保留，请稍后重试';
export const SAVE_LABELS={saved:'已保存到云端',unsaved:'有未保存的编辑',saving:'正在保存…',device:'连接中断，仅保存在本设备',error:'保存未完成，请保留输入后重试',conflict:'云端已有更新，当前输入已保留',reauth:'登录已过期，请保留输入后重新登录'};
