import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const DIST=join(process.cwd(),'dist'),hasDist=existsSync(join(DIST,'gallery/index.html'));
const ALBUM_SRC=readFileSync('src/pages/gallery/[album].astro','utf8');
const ALBUMS=JSON.parse(readFileSync('public/gallery/manifest.json','utf8')).albums;
// 手风琴入口已由封面舞台替代；此处只保留单册路由的构建守卫。
describe('相册页 · 动态路由的守卫', () => {
  it('★★ 相册名撞保留字（spiral / index）时在**构建期**报错，不许静默覆盖', () => {
    /* Astro 7.3.5 实测：静态路由 + 动态路由产出同一路径时**没有任何检测**
       ⇒ 两个页面先后写同一个 index.html，谁后写谁生效 ⇒ **静默少一页**。
       所以保留字表必须存在，且 `getStaticPaths` 里必须真的 throw。 */
    expect(ALBUM_SRC, '缺保留字表（spiral 会被相册名顶掉）').toMatch(/['"]spiral['"]/);
    expect(ALBUM_SRC, '没有在 getStaticPaths 里守卫 ⇒ 撞车时会静默覆盖').toMatch(
      /getStaticPaths\(\)[\s\S]{0,600}?throw new Error/,
    );
    /* 反向正对照：现有三个相册**都没有**撞上保留字（否则构建就该红了） */
    expect(ALBUMS.some((a) => a.id === 'spiral')).toBe(false);
    expect(ALBUMS.some((a) => a.id === 'index')).toBe(false);
  });

  it('★ 一册一页：每册都真的生成了自己的页面', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    for (const a of ALBUMS) {
      expect(existsSync(join(DIST, 'gallery', a.id, 'index.html')), `/gallery/${a.id}/ 没生成`).toBe(true);
    }
    /* 正对照：螺旋盘那页还在（动态路由没有把它顶掉） */
    expect(existsSync(join(DIST, 'gallery', 'spiral', 'index.html')), '/gallery/spiral/ 被动态路由顶掉了').toBe(true);
  });
});
