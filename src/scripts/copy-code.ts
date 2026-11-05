
import { onPage } from './page-lifecycle';
onPage(({document, addEventListener, setTimeout}) => {
// 全站唯一的客户端脚本。渐进增强：没有它，代码块照样可选可复制（只是没有那排工具栏）。
// 预算约束（docs/architecture.md §4）：发给浏览器的 JS < 1 KB。
const COPY = '复制';
const DONE = '已复制';

document.querySelectorAll<HTMLPreElement>('pre.astro-code').forEach((pre) => {
  const holder = document.createElement('div');
  holder.className = 'code-holder';

  const bar = document.createElement('div');
  bar.className = 'code-bar';

  const lang = document.createElement('span');
  lang.className = 'code-lang';
  lang.textContent = pre.dataset.language || 'text';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn';
  btn.textContent = COPY;
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(pre.innerText).then(() => {
      btn.textContent = DONE;
      setTimeout(() => (btn.textContent = COPY), 1200);
    });
  });

  bar.append(lang, btn);
  pre.replaceWith(holder);
  holder.append(bar, pre);
});

},"pre");
