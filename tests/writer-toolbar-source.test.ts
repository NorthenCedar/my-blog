// @vitest-environment happy-dom
import { afterEach,expect,it,vi } from 'vitest';
import { mountWriterBody } from '../src/scripts/writer/body-editor';

/* 2026-11-16 站主两件事：
   ① 「Markdown 源码写作的时候那些段落格式、加粗，斜体等等那些按钮都没用了。
       能改成之前那样吗，正文，章节目录，小标题都变成按钮，不用那个选项。」
   ② 「可视化编辑下如果最后一行是代码块，那么换行换不出去」（命令见 code-exit.ts 的单测）。 */

const noop = () => {};
const options = { onChange: noop, onImageFiles: noop, resolveImage: () => null, onError: (error: Error) => { throw error; } };

/* happy-dom 没有编辑命令：用 setRangeText 模拟 insertText，并把 input 事件补上（真实浏览器会自己发）。 */
function stubExecCommand() {
  document.execCommand = ((command: string, _ui?: boolean, value?: string) => {
    if (command !== 'insertText') return false;
    const area = document.activeElement as HTMLTextAreaElement | null;
    if (!area || typeof area.setRangeText !== 'function') return false;
    area.setRangeText(value ?? '', area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }) as typeof document.execCommand;
}

function mount(raw: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = mountWriterBody(host, raw, options);
  const find = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label);
  const area = host.querySelector('textarea')!;
  return { host, editor, find, area };
}

afterEach(() => { vi.restoreAllMocks(); });

it('段落格式是三个按钮，不再是下拉选项', () => {
  const { host, editor, find } = mount('甲');
  for (const label of ['正文', '章节标题', '小标题']) expect(find(label), `少了「${label}」按钮`).toBeTruthy();
  expect(host.querySelector('select.writer-block-type'), '段落格式还是下拉选项').toBeNull();
  const group = find('章节标题')!.parentElement!;
  expect(group.getAttribute('aria-label')).toBe('段落格式');
  editor.destroy();
});

it('源码模式下格式按钮仍然可用，直接改写 Markdown', () => {
  stubExecCommand();
  const { editor, find, area } = mount('这段要重点。');
  find('Markdown 源码')!.click();
  expect(find('加粗')!.parentElement!.hidden, '源码模式下格式按钮整排被藏了').toBe(false);
  area.focus();
  area.setSelectionRange(3, 5);
  area.dispatchEvent(new Event('select'));
  find('加粗')!.click();
  expect(area.value).toBe('这段要**重点**。');
  expect(editor.getMarkdown()).toBe('这段要**重点**。');
  editor.destroy();
});

it('源码模式下正文 / 章节标题 / 小标题互转', () => {
  stubExecCommand();
  const { editor, find, area } = mount('一行标题');
  find('Markdown 源码')!.click();
  area.focus();
  area.setSelectionRange(2, 2);
  find('章节标题')!.click();
  expect(area.value).toBe('## 一行标题');
  find('小标题')!.click();
  expect(area.value).toBe('### 一行标题');
  find('正文')!.click();
  expect(area.value).toBe('一行标题');
  editor.destroy();
});

it('源码模式下链接按钮插 Markdown 链接', () => {
  stubExecCommand();
  const { editor, find, host, area } = mount('看这里');
  find('Markdown 源码')!.click();
  area.focus();
  area.setSelectionRange(1, 3);
  find('链接')!.click();
  const url = host.querySelector('form input') as HTMLInputElement;
  url.value = 'https://example.com';
  (host.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(area.value).toBe('看[这里](' + new URL('https://example.com').href + ')');
  editor.destroy();
});