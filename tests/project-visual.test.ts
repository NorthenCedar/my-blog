import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ProjectVisual from '../src/components/ProjectVisual.astro';
import ProjectGallery from '../src/components/ProjectGallery.astro';

const image = {src:'/fixture-cover.webp',width:800,height:600,format:'webp'};
const images = [0,1,2].map(i=>({src:image,darkSrc:image,alt:`作品角度 ${i+1}`}));
const project = (effect:string) => ({id:'fixture',data:{title:'作品',visual:'image',effect,images,preview:{}}});

describe('真实图片组件复用动效模板', () => {
  it('叠片使用三张实图和各自的暗色替图，单图模板只展示主封面', async () => {
    const container=await AstroContainer.create();
    const stack=await container.renderToString(ProjectVisual,{props:{project:project('stack')}});
    expect([...stack.matchAll(/class="project-shot"/g)]).toHaveLength(3);
    expect([...stack.matchAll(/<img\b/g)]).toHaveLength(6);
    const single=await container.renderToString(ProjectVisual,{props:{project:project('zoom')}});
    expect([...single.matchAll(/class="project-shot"/g)]).toHaveLength(1);
    expect(single).toContain('alt="作品角度 1"');
    expect(single).toContain('data-effect="zoom"');
  });
  it('项目详情保留全部图片与说明，不被封面的模板截断', async () => {
    const container=await AstroContainer.create();
    const gallery=await container.renderToString(ProjectGallery,{props:{images}});
    expect([...gallery.matchAll(/<figure\b/g)]).toHaveLength(3);
    for(const picture of images) expect(gallery).toContain(`<figcaption>${picture.alt}</figcaption>`);
  });
});
