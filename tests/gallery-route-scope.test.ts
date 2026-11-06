// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{document.body.replaceChildren();document.body.className='';vi.resetModules();});
it('相册控制器不能把造物台的阶段按钮认成相册入口，也不能阻止后续页面挂载',async()=>{
  document.body.className='forge-page';document.body.innerHTML='<button data-stage="0">构想</button><canvas id="forge-scene"></canvas>';
  await expect(import('../src/scripts/gallery-stage.js')).resolves.toBeDefined();
  const {onPage}=await import('../src/scripts/page-lifecycle');const mount=vi.fn();onPage(mount,'body.forge-page');expect(mount).toHaveBeenCalledTimes(1);
  expect(document.documentElement.classList.contains('gallery-stage-ready')).toBe(false);
});
