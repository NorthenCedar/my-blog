// @vitest-environment happy-dom
import { expect,it } from 'vitest';
import { mountWriterBody } from '../src/scripts/writer/body-editor';

/* 2026-11-16 站主：「本地写作台和云端写作台都加一个一键加「- 」圆点的按钮」。
   本地那侧在 blog-desk 的 ui/app.js + _test_bullet_format.cjs；这里守云端：
   ① 按钮必须挂在**两种模式都常驻**的那排工具上（可视化与 Markdown 源码都看得见），
      否则源码模式下就点不到；
   ② 源码模式下的改写规则是纯函数 markdownBullet（见 tests/writer-bullet.test.ts）。 */

const noop = () => {};
const options = { onChange: noop, onImageFiles: noop, resolveImage: () => null, onError: (error: Error) => { throw error; } };

function mount(raw: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = mountWriterBody(host, raw, options);
  const find = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label);
  return { host, editor, find };
}

it('圆点按钮在常驻工具排上，两种模式都看得见', () => {
  const { editor, find } = mount('甲\n乙');
  const bullet = find('圆点');
  expect(bullet, '没有「圆点」按钮').toBeTruthy();
  expect(bullet!.hidden).toBe(false);
  expect(bullet!.title).toContain('- ');
  /* 圆点与格式按钮分属两排；源码模式下两排都还在，但圆点不该被挪到会变的那排。 */
  const modeRow = bullet!.parentElement!;
  const bold = find('加粗')!;
  expect(bold.parentElement === modeRow, '圆点被放进了源码模式会隐藏的那排').toBe(false);
  find('Markdown 源码')!.click();
  expect(bullet!.hidden, '源码模式下圆点按钮被藏了').toBe(false);
  expect(modeRow.hidden, '源码模式下圆点所在那排被藏了').toBe(false);
  editor.destroy();
});