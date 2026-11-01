/** 相册内容只从清单进入；首图比例和清单位次决定当前封面的构图。 */
export interface GalleryFile {w:number;h:number;url:string}
export interface GalleryAlbum {id:string;title:string;date:string;total:number;frames:{alt:string;files:GalleryFile[]}[]}
export function coverPresentation(album:GalleryAlbum,index:number){
  const frame=album.frames[0];if(!frame)return null;
  const small=frame.files.reduce((a,b)=>b.w<a.w?b:a),large=frame.files.reduce((a,b)=>b.w>a.w?b:a);
  const kind=small.w/small.h>1.2?'wide':index%2?'right':'left';
  const characters=Array.from(album.title),length=characters.length<=4?2:4;
  const lines=characters.length<=2?[album.title]:Array.from({length:Math.ceil(characters.length/length)},(_,i)=>characters.slice(i*length,(i+1)*length).join(''));
  return {kind,lines,src:large.url,width:small.w,height:small.h,alt:frame.alt,href:`/gallery/${encodeURIComponent(album.id)}/`};
}
export const coverStrokes={
  left:{main:'M76 494 C186 518 366 463 447 487 C534 514 493 579 618 618 C804 674 1129 645 1268 474',echo:'M86 508 C242 543 377 486 459 505',corner:'M883 77 Q1033 45 1158 88 L1190 208'},
  right:{main:'M1294 440 C1192 474 988 478 882 464 C765 448 787 587 642 625 C436 679 157 652 107 459',echo:'M1280 454 C1160 490 971 493 887 480',corner:'M183 78 Q127 85 124 140 L111 237'},
  wide:{main:'M79 548 C247 581 377 528 491 546 C668 572 880 671 1205 591 Q1273 562 1287 511',echo:'M86 562 C239 596 367 545 479 563',corner:'M785 156 Q1061 109 1272 168 L1287 278'}
};
