/** 第四版已替代旧的固定主栏/侧栏，契约改为自然阅读顺序与独立章节。 */
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const src=readFileSync('src/pages/about.astro','utf8');
const html=readFileSync('dist/about/index.html','utf8');
describe('关于页 · 分段阅读布局',()=>{
  it('社交、技术栈、语言、个人正文按自然阅读顺序排列',()=>{
    const indices=['social','technology','languages','personal'].map(id=>html.indexOf('id="'+id+'"'));
    expect(indices.every(i=>i>=0)).toBe(true);
    for(let i=1;i<indices.length;i++)expect(indices[i]).toBeGreaterThan(indices[i-1]);
  });
  it('三个章节提供滚动锚点，手机单列，没有锁滚动',()=>{
    expect(html.match(/data-motion-stop=/g)).toHaveLength(3);
    expect(src.includes('flex-direction:column')).toBe(true);
    expect(src.includes('min-height:110svh')).toBe(true);
    expect(src.includes('overflow-y:hidden')).toBe(false);
  });
  it('每段有独立标题，章节导航可以直接跳转',()=>{
    for(const id of ['profile-title','tech-title','lang-title'])expect(html.includes('id="'+id+'"')).toBe(true);
    for(const id of ['social','technology','languages'])expect(html.includes('data-chapter="'+id+'"')).toBe(true);
  });
  it('原正文继续通过内容组件渲染，简介从同一正文派生',()=>{
    expect(src.includes('<Content />')).toBe(true);
    expect(src.includes('entry?.body?')).toBe(true);
  });
  it('个人区透明，没有返回开场入口',()=>{
    expect(src).toMatch(/\.personal\{[^}]*background:transparent/);
    expect(html.includes('回到开场')).toBe(false);
    expect(src.includes('.scene-copy:before')).toBe(false);
  });
});
