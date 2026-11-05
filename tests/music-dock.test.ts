import {describe,expect,it} from 'vitest';
import {chooseMusicDock} from '../src/scripts/music-dock';
const overlap=(a:any,b:any)=>a.left<b.left+b.width&&a.left+a.width>b.left&&a.top<b.top+b.height&&a.top+a.height>b.top;
const size={width:280,height:60};
describe('横条固定停靠',()=>{
  it('给文章底部阅读尺留出完整间隔',()=>{
    const ruler={left:0,top:748,width:1280,height:52};
    const p=chooseMusicDock(1280,800,size,[ruler])!;
    expect(p.left).toBe(988);expect(p.top+size.height).toBeLessThanOrEqual(ruler.top-12);
  });
  it('相册底部工具栏与窄屏固定按钮都不能被覆盖',()=>{
    for(const width of [320,390,768,1280]){
      const obstacles=[{left:12,top:720,width:width-24,height:56},{left:width-80,top:640,width:68,height:48}];
      const p=chooseMusicDock(width,800,size,obstacles)!;
      expect(p).not.toBeNull();for(const box of obstacles)expect(overlap({...p,...size},box)).toBe(false);
      expect(p.left).toBeGreaterThanOrEqual(12);expect(p.left+size.width).toBeLessThanOrEqual(width-12);
    }
  });
  it('尊重四侧安全区；无处可放时让普通页面入口接管',()=>{
    const p=chooseMusicDock(390,844,size,[],{left:0,right:8,top:20,bottom:34})!;
    expect(p.left+280).toBe(370);expect(p.top+60).toBe(798);
    expect(chooseMusicDock(320,100,size,[{left:0,top:30,width:320,height:70}])).toBeNull();
  });
});
