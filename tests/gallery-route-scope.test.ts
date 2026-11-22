// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
const mount = vi.hoisted(() => vi.fn());
vi.mock('../src/scripts/gallery-overview-view', () => ({ mountGalleryOverview: mount }));
afterEach(()=>{
  document.dispatchEvent(new Event('astro:before-swap'));
  document.body.replaceChildren(); document.body.className='';
  history.replaceState(null, '', '/gallery/');
  mount.mockReset(); vi.restoreAllMocks(); vi.resetModules();
});
it('相册控制器不能把造物台的阶段按钮认成相册入口，也不能阻止后续页面挂载',async()=>{
  document.body.className='forge-page';document.body.innerHTML='<button data-stage="0">构想</button><canvas id="forge-scene"></canvas>';
  await expect(import('../src/scripts/gallery-stage.js')).resolves.toBeDefined();
  const {onPage}=await import('../src/scripts/page-lifecycle');const mount=vi.fn();onPage(mount,'body.forge-page');expect(mount).toHaveBeenCalledTimes(1);
  expect(document.documentElement.classList.contains('gallery-stage-ready')).toBe(false);
});

async function gallery(hash = '', saved = {}) {
  history.replaceState(saved, '', `/gallery/${hash}`);
  document.body.className = 'gallery-story';
  document.body.innerHTML = `
    <div class="bath" data-bath></div>
    <div data-stage tabindex="-1">
      <section data-slide="0" data-kind="develop" data-title="显影板"><button data-advance>前往弧形</button></section>
      <section data-slide="1" data-kind="arc" data-title="弧形封面" data-gallery-overview>
        <div data-cover-arc hidden>
          <div data-cover-canvas></div><button data-cover-prev>上一本</button>
          <a data-cover-current href="/gallery/a/"><b data-cover-title>甲册</b><span data-cover-count>1 张</span></a>
          <button data-cover-next>下一本</button>
        </div>
        <ul data-arc-fallback>
          <li><a data-album-link href="/gallery/a/"><img src="/a-thumb.webp" alt="甲册"><b data-album-title>甲册</b><span data-album-count>1 张</span></a></li>
          <li><a data-album-link href="/gallery/b/"><img src="/b-thumb.webp" alt="乙册"><b data-album-title>乙册</b><span data-album-count>2 张</span></a></li>
        </ul>
      </section>
      <section data-slide="2" data-kind="album" data-title="甲册"><a class="cover-link" href="/gallery/a/"><img src="/a-thumb.webp" data-cover-src="/a-large.webp" alt="甲册"></a></section>
      <section data-slide="3" data-kind="album" data-title="乙册"><a class="cover-link" href="/gallery/b/"><img src="/b-thumb.webp" data-cover-src="/b-large.webp" alt="乙册"></a></section>
    </div>
    <button data-prev>上一页</button><button data-next>下一页</button>`;
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const dispose = vi.fn();
  mount.mockReturnValue(dispose);
  await import('../src/scripts/gallery-stage.js');
  await import('../src/scripts/gallery-overview');
  const by = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const paint = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    for (const [id, callback] of [...frames]) if (frames.delete(id)) callback(0);
    await vi.dynamicImportSettled();
  };
  return { by, paint, dispose, next: () => by('[data-next]').click(), prev: () => by('[data-prev]').click() };
}

it('轻触显影幕按钮只翻到封面，同一次触摸的补发点击不会打开相册', async () => {
  const { by } = await gallery();
  const advance = by('[data-advance]');
  const album = by('[data-album-link]');
  const open = vi.fn((event: Event) => event.preventDefault());
  album.addEventListener('click', open);
  const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(advance);
  const touch = (target: HTMLElement, type: string) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 550,
  }));

  const turnToCovers = () => {
    hit.mockReturnValue(advance);
    touch(advance, 'pointerdown');
    touch(advance, 'pointerup');
    expect(by('[data-stage]').dataset.active).toBe('1');
    hit.mockReturnValue(album);
  };

  const click = (detail: number) => album.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  turnToCovers();
  expect(click(1)).toBe(false);
  expect(open).not.toHaveBeenCalled();

  by('[data-prev]').click();
  turnToCovers();
  click(0);
  touch(album, 'pointerdown');
  touch(album, 'pointerup');
  click(1);
  expect(open).toHaveBeenCalledTimes(2);
});

it('显影首幕与快速翻到最后一幕时只升级真正停留的封面', async () => {
  const f = await gallery();
  const source = (index: number) => f.by<HTMLImageElement>(`[data-slide="${index}"] .cover-link img`).getAttribute('src');
  await f.paint();
  expect(f.by('[data-stage]').dataset.active).toBe('0');
  expect([source(2), source(3)]).toEqual(['/a-thumb.webp', '/b-thumb.webp']);
  expect(mount).not.toHaveBeenCalled();
  f.next(); f.next(); f.next();
  await f.paint();
  expect([source(2), source(3)]).toEqual(['/a-thumb.webp', '/b-large.webp']);
  expect(mount).not.toHaveBeenCalled();
});

it('弧形深链显示普通目录到首帧，卸载后忽略迟到回调，再入恢复相册', async () => {
  const f = await gallery('#gallery-overview', { galleryOverview: { cover: '/gallery/b/' } });
  const arc = f.by('[data-cover-arc]');
  const list = f.by('[data-arc-fallback]');
  expect(f.by('[data-stage]').dataset.active).toBe('1');
  expect(arc.hidden).toBe(true);
  expect(list.hidden).toBe(false);
  await f.paint();
  expect(mount).toHaveBeenCalledOnce();
  const options = mount.mock.calls[0][1];
  expect(options.restoredIndex).toBe(1);
  expect(list.hidden).toBe(false);
  options.onReady(vi.fn());
  expect(list.hidden).toBe(true);
  f.next();
  await vi.waitFor(() => expect(f.dispose).toHaveBeenCalledOnce());
  options.onReady(vi.fn());
  expect(list.hidden).toBe(false);
  f.prev();
  await f.paint();
  expect(mount).toHaveBeenCalledTimes(2);
  expect(mount.mock.calls[1][1].restoredIndex).toBe(1);
});
