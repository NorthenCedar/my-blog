import {parseDocument} from 'yaml';
import {validateAlbumFields} from './album-presentation.mjs';
export function parseAlbumHeader(header){
  const document=parseDocument(header,{schema:'core',uniqueKeys:true,stringKeys:true,prettyErrors:false});
  if(document.errors.length||document.warnings.length)throw new Error('相册 YAML 资料格式不正确');
  const value=document.toJS({maxAliasCount:0});
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('相册资料须为对象');
  return value;
}
export function readAlbumDocument(text){
  const match=/^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(text);
  if(!match||match.index!==0)throw new Error('相册缺少 frontmatter');
  const fields=parseAlbumHeader(match[1]);
  return validateAlbumFields(fields,{publish:fields.draft!==true});
}
