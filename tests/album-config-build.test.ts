import {describe,it,expect} from 'vitest';
import {readAlbumDocument} from '../src/lib/album-source.mjs';
import {readAlbumOptions} from '../src/lib/album-options.mjs';
import {coverMotion} from '../src/scripts/gallery-cover-motion.mjs';
import {coverArtwork,mobileArtwork} from '../src/lib/album-cover-art.mjs';
import {gallerySchema} from '../src/lib/schema';
describe('写作台输出进入构建的真实契约',()=>{
  it('支持JSON字段、行内图片数组、文件名空格、冒号图注和混合行尾',()=>{
    const text='---\r\n"title": "新册: 午后"\r\n"date": "2026-11-01"\n"layout": "wall"\r\n"cover": "./my photo.jpg"\r\n"images": [{"src":"./my photo.jpg","alt":"窗边: 光与影","credit":"作者"}]\r\n"presentation": {"arrangement":"wide","transition":"reveal","stroke":"loop","weight":"regular"}\r\n---\r\n正文不参与配置解析';
    const value=readAlbumDocument(text);expect(value.title).toBe('新册: 午后');expect(value.images[0].alt).toBe('窗边: 光与影');expect(value.images[0].credit).toBe('作者');
    expect(readAlbumOptions(text.split('---')[1])).toMatchObject({layout:'wall',cover:'./my photo.jpg',presentation:{stroke:'loop'}});
  });
  it('公开册严格验证，未完成草稿可进入内容集合但不要求图注与日期完整',()=>{
    expect(readAlbumDocument('---\n"draft": true\nimages: []\n---\n')).toEqual({draft:true,images:[]});
    expect(gallerySchema.safeParse({draft:true,images:[]}).success).toBe(true);
    expect(()=>readAlbumDocument('---\ntitle: 错误\ndate: 2026-02-30\nimages: []\n---')).toThrow();
    expect(()=>readAlbumDocument('---\ntitle: a\ntitle: b\n---')).toThrow();
    expect(()=>readAlbumDocument('---\nimages: &x [*x]\n---')).toThrow();
  });
  it('三种动作可以反向且都回到无遮罩的终态，常规旧值保持一致',()=>{
    for(const type of ['slide','reveal','perspective']){
      const forward=coverMotion(type,1),reverse=coverMotion(type,-1);
      expect(forward.enter).not.toEqual(reverse.enter);expect(forward.visible).toEqual(reverse.visible);expect(forward.visible.opacity).toBe('1');expect(forward.visible.clipPath).toBe('inset(0% 0% 0% 0%)');
    }
    expect(coverMotion().enter.transform).toBe('translateX(7%) scale(.99)');
  });
  it('三套笔势在桌面与手机都不同，输入不作为可执行路径',()=>{
    expect(new Set(['arc','loop','corner'].map(stroke=>coverArtwork(stroke).main)).size).toBe(3);
    expect(new Set(['arc','loop','corner'].map(stroke=>mobileArtwork(stroke).main)).size).toBe(3);
    expect(coverArtwork('<script>')).toEqual(coverArtwork('arc'));
  });
});
