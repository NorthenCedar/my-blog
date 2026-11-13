/** 相册内容只从清单进入；首图比例和清单位次决定当前封面的构图。 */
import {resolvePresentation,albumTitleLines} from './album-presentation.mjs';
export {coverStrokes} from './album-cover-art.mjs';
export interface GalleryFile {w:number;actualW?:number;h:number;url:string}
export interface GalleryAlbum {id:string;title:string;date:string;total:number;cover?:string;presentation?:Record<string,string>;frames:{src?:string;alt:string;files:GalleryFile[]}[]}
export function coverPresentation(album:GalleryAlbum,index:number){
  const frame=album.frames.find(frame=>frame.src===album.cover)??album.frames[0];if(!frame)return null;
  const small=frame.files.reduce((a,b)=>b.w<a.w?b:a),large=frame.files.reduce((a,b)=>b.w>a.w?b:a);
  const configured=resolvePresentation({...album,width:small.actualW??small.w,height:small.h},index),kind=configured.arrangement;
  return {kind,lines:albumTitleLines(album.title),src:large.url,thumbnail:small.url,width:small.actualW??small.w,height:small.h,alt:frame.alt,transition:configured.transition,stroke:configured.stroke,weight:configured.weight,href:`/gallery/${encodeURIComponent(album.id)}/`};
}
