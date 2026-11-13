import { onPage } from './page-lifecycle';

const BLOCKS = '.post-body .prose pre.astro-code';
const PREVIEW_LINES = 6;

onPage(({ document, matchMedia, setTimeout, keep }) => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let nextId = 0;
  for (const pre of document.querySelectorAll<HTMLPreElement>(BLOCKS)) {
    if (pre.parentElement?.classList.contains('code-holder')) continue;

    const holder = document.createElement('div');
    holder.className = 'code-holder';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    const lang = document.createElement('span');
    lang.className = 'code-lang';
    lang.textContent = pre.dataset.language || 'text';
    const actions = document.createElement('div');
    actions.className = 'code-actions';

    const lines = pre.querySelectorAll(':scope > code > .line');
    if (lines.length > PREVIEW_LINES) {
      const lastVisible = lines[PREVIEW_LINES - 1];
      const rest = document.createElement('span');
      rest.className = 'code-rest';
      do {
        rest.id = `post-code-rest-${++nextId}`;
      } while (document.getElementById(rest.id));
      // 连同 Shiki 行间的换行符一起移动，展开和复制都保留原始换行与缩进。
      while (lastVisible.nextSibling) rest.append(lastVisible.nextSibling);
      lastVisible.after(rest);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'code-fold-btn';
      toggle.setAttribute('aria-controls', rest.id);
      let expanded = false;
      let animation: Animation | undefined;
      const update = () => {
        rest.hidden = !expanded;
        rest.inert = !expanded;
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? '收起' : `展开全部（${lines.length} 行）`;
      };
      const finish = () => {
        if (!animation) return;
        rest.hidden = !expanded;
        animation.cancel();
        animation = undefined;
      };
      update();
      toggle.addEventListener('click', () => {
        const animate = !reduceMotion.matches && typeof pre.animate === 'function';
        // 连续点按从当时的高度接续，避免先跳到上一段动画的终点。
        const from = animate ? pre.offsetHeight : 0;
        finish();
        expanded = !expanded;
        update();
        if (!animate) return;
        const to = pre.offsetHeight;
        if (from === to) return;

        // 收起时在过渡期间继续绘制余下行，到终点再隐藏。
        rest.hidden = false;
        const motion = pre.animate(
          { height: [`${from}px`, `${to}px`] },
          {
            duration: expanded ? 460 : 380,
            easing: 'cubic-bezier(.38,.08,.24,1)',
            fill: 'both',
          },
        );
        animation = motion;
        motion.onfinish = () => { if (animation === motion) finish(); };
      });
      reduceMotion.addEventListener('change', finish);
      keep(finish);
      actions.append(toggle);
    }

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn';
    copy.textContent = '复制';
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(pre.textContent ?? '').then(() => {
        copy.textContent = '已复制';
        setTimeout(() => (copy.textContent = '复制'), 1200);
      });
    });

    actions.append(copy);
    bar.append(lang, actions);
    pre.replaceWith(holder);
    holder.append(bar, pre);
  }
}, BLOCKS);
