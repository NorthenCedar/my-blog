import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {coverPresentation,type GalleryAlbum} from '../src/lib/gallery-stage';

const read=(p:string)=>readFileSync(p,'utf8');
const manifest=JSON.parse(read('public/gallery/manifest.json'));
const html=read('dist/gallery/index.html');
const covers=[...html.matchAll(/<li[^>]*data-gallery-album="([^"]+)"[\s\S]*?<\/li>/g)];
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

describe('相册总览 · 正式产物',()=>{
  it('每本已发布相册都有目录入口，弧形封面位于第二幕',()=>{
    expect(covers.map(m=>m[1])).toEqual(manifest.albums.map((a:GalleryAlbum)=>a.id));
    expect((html.match(/<h1\b/g)??[]).length).toBe(1);
    expect(html).toContain('gallery-inf-plate gallery-story');
    if (manifest.albums.length > 1) expect(html).toMatch(/data-cover-arc[^>]*hidden/);
  });
  it('每项使用本册所选封面和真实网址，无 JS 时也能进入相册',()=>{
    expect(covers.length).toBeGreaterThan(0);
    covers.forEach((match,index)=>{
      const album=manifest.albums[index],seg=match[0],href=`/gallery/${encodeURIComponent(album.id)}/`;
      expect(seg).toContain(`href="${href}"`);
      expect(seg).toContain(`${album.total} 张照片`);
      expect(seg).toContain(`src="${coverPresentation(album,index)?.thumbnail}"`);
      expect(seg).toContain('data-album-title');
    });
  });
  it('显影盘在弧形封面之前，从清单取横幅照片而不预载整册',()=>{
    const bath=html.indexOf('data-bath-frames=');
    expect(bath).toBeGreaterThan(-1);
    expect(bath).toBeLessThan(html.indexOf('data-cover-arc'));
    expect(html).toMatch(/data-slide="0" data-kind="develop"/);
    expect(html).toMatch(/data-slide="1" data-kind="arc"/);
    expect(html).toContain('data-advance');
    expect(html).toContain('href="/gallery/spiral/"');
    expect(html).not.toContain('data-sp-item=');
    expect(html).not.toContain('data-bath-src');
    for(const hook of ['class="topbar','class="foot'])expect(html).toContain(hook);
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

describe('相册 · 换页样式', () => {
  it.each([
    ['src/pages/gallery/index.astro', ['styles/gallery-stage.css', 'vendor/react-bits/CircularGallery.css']],
    ['src/pages/gallery/[album].astro', ['vendor/react-bits/DomeGallery.css', 'vendor/react-bits/InfiniteMenu.css']],
  ])('%s 把舞台与展览样式交给页面响应', (page, styles) => {
    const frontmatter = read(page).split(/^---\s*$/m)[1];
    for (const style of styles) {
      expect(frontmatter).toContain(`import '../../${style}';`);
    }
  });
});
