import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {coverPresentation,type GalleryAlbum} from '../src/lib/gallery-stage';

const read=(p:string)=>readFileSync(p,'utf8');
const manifest=JSON.parse(read('public/gallery/manifest.json'));
const html=read('dist/gallery/index.html');
const covers=[...html.matchAll(/<section[^>]*data-gallery-album="([^"]+)"[\s\S]*?<\/section>/g)];
const fixture=(title='新册',id='new / 册'):GalleryAlbum=>({id,title,date:'2026-11-01',total:1,frames:[{alt:'封面',files:[{w:800,h:1184,url:'/small.webp'},{w:1280,h:1184,url:'/large.webp'}]}]});

describe('相册封面 · 内容模型',()=>{
  it('用真实 800 档判方向，大图档只负责封面来源，中文和特殊路径编码',()=>{
    const cover=coverPresentation(fixture(),0)!;
    expect(cover).toMatchObject({kind:'left',width:800,height:1184,src:'/large.webp',href:'/gallery/new%20%2F%20%E5%86%8C/'});
    expect(coverPresentation(fixture(),1)?.kind).toBe('right');
  });
  it('长标题按 Unicode 字符分行，不依赖现有相册名；空相册不生成假入口',()=>{
    expect(coverPresentation(fixture('直到大地变成一颗酸橙'),2)?.lines).toEqual(['直到大地','变成一颗','酸橙']);
    expect(coverPresentation(fixture('📷新相册'),0)?.lines).toEqual(['📷新','相册']);
    const empty=fixture();empty.frames=[];expect(coverPresentation(empty,0)).toBeNull();
  });
  it('横幅独立构图仍保留真实比例，不写死未来相册名称和数量',()=>{
    const album=fixture('另一片海','new-sea');album.frames[0].files[0].h=450;
    expect(coverPresentation(album,3)?.kind).toBe('wide');
    expect(coverPresentation(album,3)?.href).toBe('/gallery/new-sea/');
  });
});

describe('相册舞台 · 正式产物',()=>{
  it('显影板第一幕，原盘第二幕，每本相册自动生成一幕，只有一个 h1',()=>{
    const kinds=[...html.matchAll(/data-kind="([^"]+)"/g)].map(m=>m[1]);
    expect(kinds).toEqual(['develop','spiral',...manifest.albums.map(()=> 'album')]);
    expect(covers.map(m=>m[1])).toEqual(manifest.albums.map((a:GalleryAlbum)=>a.id));
    expect((html.match(/<h1\b/g)??[]).length).toBe(1);
    expect(html).toContain('gallery-inf-plate gallery-story');
    expect((html.match(/class="film-backdrop"/g)??[]).length).toBe(1);
    expect(html).not.toContain('class="gallery-inf"');
  });
  it('封面、分行册名和图注都是本册真链接，无 JS 时也能进入相册',()=>{
    expect(covers.length).toBeGreaterThan(0);
    covers.forEach((match,index)=>{
      const album=manifest.albums[index],seg=match[0],href=`/gallery/${encodeURIComponent(album.id)}/`;
      expect((seg.match(new RegExp('href="'+href+'"','g'))??[]).length).toBe(3);
      expect(seg).toContain(`${album.total} 张照片`);
      expect(seg).toContain(album.date.replaceAll('-','.'));
      expect(seg).toContain(`data-slide="${index+2}"`);
      expect(seg).toContain(`>${String(index+1).padStart(2,'0')}</span>`);
      const title=seg.match(/<h2[\s\S]*?<\/h2>/)![0].replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/<[^>]+>/g,'');
      expect(title).toBe(album.title);
      expect(seg).toContain('data-draw');
    });
  });
  it('全量原盘照片兼作显影素材；保留公共导航、明暗入口和站点统计',()=>{
    const total=manifest.albums.reduce((n:number,a:GalleryAlbum)=>n+a.total,0);
    expect((html.match(/data-sp-item="/g)??[]).length).toBe(total);
    expect((html.match(/data-bath-src(?:\s|>)/g)??[]).length).toBe(1);
    for(const hook of ['data-spiral','id="splb"','data-gallery-theme','data-gallery-site-meta','class="topbar','class="foot'])expect(html).toContain(hook);
    const page=read('src/pages/gallery/index.astro');
    expect(page).toContain('<SpiralPlate mode="embed" />');
    const script=read('src/scripts/gallery-stage.js');
    expect(script).toContain("import {getTheme,setTheme} from './theme'");
    expect(script).not.toMatch(/Jelly|typegpu|three/);
  });
  it('新主题声明限于相册页，新增根 token 不改变全站普通属性',()=>{
    const css=read('src/styles/gallery-stage.css');
    expect(css).toContain('body.gallery-story{color-scheme:light}');
    expect(css).toContain('html.dark body.gallery-story{color-scheme:dark}');
    const tokens=read('src/styles/tokens.css').split('/* 相册封面舞台：')[1];
    expect(tokens).toBeTruthy();
    for(const block of tokens.matchAll(/\{([^}]*)\}/g)){
      expect(block[1].split(';').filter(Boolean).every(declaration=>declaration.trim().startsWith('--'))).toBe(true);
    }
    expect(read('src/scripts/gallery-stage.js')).toContain('[data-notices][aria-expanded="true"]');
  });
});
