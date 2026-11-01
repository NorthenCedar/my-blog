import {describe,it,expect} from 'vitest';
import {recommendPresentation,resolvePresentation,validateAlbumFields,validateAlbumKey} from '../src/lib/album-presentation.mjs';
import {coverPresentation} from '../src/lib/gallery-stage';
const fields=()=>({title:'相册',date:'2026-11-01',images:[{src:'./a.jpg',alt:'第一张'},{src:'./b.jpg',alt:'第二张'}]});
describe('相册配置与旧资料兼容',()=>{
  it('草稿可暂缺标题和照片，发布时必须有有效内容；不接受路径穿越或假日期',()=>{
    expect(()=>validateAlbumFields({draft:true,images:[]})).not.toThrow();
    expect(()=>validateAlbumFields({draft:true,images:[]},{publish:true})).toThrow();
    for(const date of ['2026-02-30','bad'])expect(()=>validateAlbumFields({...fields(),date},{publish:true})).toThrow();
    for(const src of ['../a.jpg','./../a.jpg','/secret.jpg','https://x/a.jpg','./sub/a.jpg'])expect(()=>validateAlbumFields({...fields(),images:[{src,alt:'图'}]})).toThrow();
    expect(()=>validateAlbumFields({...fields(),images:[{src:'writer-asset:'+'a'.repeat(64),alt:'图'}]},{publish:true})).not.toThrow();
  });
  it('旧中文网址可继续使用，拒绝系统名、分隔符和路由保留字',()=>{
    expect(validateAlbumKey('直到大地变成一颗酸橙')).toBe('直到大地变成一颗酸橙');
    for(const key of ['../x','a/b','a\\b','spiral','index','CON','nul','a.','a ','a%2fb'])expect(()=>validateAlbumKey(key)).toThrow();
  });
  it('封面必须在本册中，重复源图和未知展示值报错，未知内容字段保留',()=>{
    const value={...fields(),cover:'./b.jpg',layout:'wall',custom:{keep:true},presentation:{arrangement:'wide',transition:'reveal',stroke:'loop',weight:'bold',future:'keep'}};
    expect(validateAlbumFields(value,{publish:true})).toBe(value);
    expect(()=>validateAlbumFields({...value,cover:'./c.jpg'})).toThrow();
    expect(()=>validateAlbumFields({...value,images:[value.images[0],value.images[0]]})).toThrow();
    for(const layout of ['unknown','scatterx'])expect(()=>validateAlbumFields({...value,layout})).toThrow();
    expect(()=>validateAlbumFields({...value,presentation:{stroke:'<script>'}})).toThrow();
  });
  it('自动推荐是明确配置，保存后不随其他相册位置、标题或封面比例漂移',()=>{
    const saved=recommendPresentation({title:'新相册',width:500,height:800},1);
    expect(saved.arrangement).toBe('right');
    expect(resolvePresentation({title:'不同标题',width:1400,height:500,presentation:saved},0)).toEqual(saved);
    expect(recommendPresentation({title:'横幅',width:1400,height:800},0).arrangement).toBe('wide');
  });
  it('选封面不改照片顺序，真实像素判方向，新字段透传到正式封面',()=>{
    const frame=(src:string,w:number,h:number)=>({src,alt:src,files:[{w:800,actualW:w,h,url:src+'-800'},{w:1280,actualW:w,h,url:src+'-1280'}]});
    const album={id:'册',title:'新相册',date:'2026-11-01',total:2,frames:[frame('./a.jpg',800,1000),frame('./b.jpg',600,900)],cover:'./b.jpg',presentation:{arrangement:'right',transition:'perspective',stroke:'corner',weight:'regular'}};
    expect(coverPresentation(album,0)).toMatchObject({src:'./b.jpg-1280',alt:'./b.jpg',kind:'right',width:600,height:900,transition:'perspective',stroke:'corner',weight:'regular'});
    expect(album.frames[0].src).toBe('./a.jpg');
    delete (album as any).presentation;expect(coverPresentation(album,0)?.kind).toBe('left');
  });
});
