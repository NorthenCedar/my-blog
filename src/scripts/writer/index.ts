import { writerApi } from './api';
import { createRecoveryStore } from './recovery';
import { mountWriterEditor } from './editor';
import { el,button,errorText } from './ui';
import { getTheme,setTheme } from '../theme';
let themeMounted=false;
export async function mountWriter(root:HTMLElement){
  if(!themeMounted){document.querySelector('[data-writer-theme]')?.addEventListener('click',()=>setTheme(getTheme()==='dark'?'light':'dark'));themeMounted=true;}
  root.replaceChildren(el('p','正在确认站主身份…'));
  let session:{user:{id:string;nickname:string};capabilities:{publish:boolean}};
  function failure(error:unknown){root.replaceChildren();const message=el('section','','writer-auth'),account=el('a','打开账户页登录');account.href='/account/';account.target='_blank';account.rel='noopener';message.append(el('h2','登录后继续写作'),el('p',errorText(error)),account,el('p','登录完成后，返回这里重新确认。','writer-note'),button('我已登录，重新确认',()=>mountWriter(root)));root.append(message);}
  try{session=await writerApi('/session');}catch(error){failure(error);return;}
  let factory:IDBFactory|undefined;try{factory=window.indexedDB;}catch{}
  const recovery=createRecoveryStore(factory);
  try{await recovery.clearOtherUsers(session.user.id);}catch{}
  const editor=mountWriterEditor(root,writerApi,recovery,{user:session.user,publish:session.capabilities.publish});
  let disposed=false;
  async function clearIdentity(){if(disposed)return;disposed=true;window.removeEventListener('storage',identityChanged);document.removeEventListener('visibilitychange',visible);await editor.dispose();try{await recovery.clearUser(session.user.id);}catch{}await recovery.close();failure(Error('账户状态已改变，已清理本设备上的原账户编辑副本，请重新确认身份'));}
  function identityChanged(event:StorageEvent){
    if(event.key!=='nc-account-change'||!event.newValue)return;
    try{const [action,userId]=JSON.parse(event.newValue);if(['logout','delete'].includes(action)||userId&&userId!==session.user.id)void clearIdentity();}catch{}
  }
  async function visible(){if(document.hidden||disposed)return;try{const next=await writerApi('/session');if(next.user.id!==session.user.id)await clearIdentity();}catch(error){if((error as {status?:number}).status===403)await clearIdentity();else editor.showError(error);}}
  window.addEventListener('storage',identityChanged);document.addEventListener('visibilitychange',visible);
}
