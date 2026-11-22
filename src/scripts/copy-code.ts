import { onPage } from './page-lifecycle';

const BLOCKS = '.post-body .prose pre.astro-code';
const PREVIEW_LINES = 6;
const SYNC_BLOCKS = 6;
const BATCH_SIZE = 8;

onPage(({ document, window, matchMedia, setTimeout, keep }) => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let nextId = 0;
  let live = true;
  keep(() => { live = false; });

  const yieldToMain = (): Promise<void> => {
    const win = window as Window & { scheduler?: { yield?: () => Promise<void> } };
    if (typeof win.scheduler?.yield === 'function') return win.scheduler.yield();
    return new Promise((resolve) => setTimeout(resolve, 0));
  };

  const enhance = (pre: HTMLPreElement) => {
    if (!pre.isConnected || pre.parentElement?.classList.contains('code-holder')) return;

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
  };

  const pres = [...document.querySelectorAll<HTMLPreElement>(BLOCKS)];
  const syncCount = Math.min(SYNC_BLOCKS, pres.length);
  for (let i = 0; i < syncCount; i++) enhance(pres[i]);

  if (pres.length > syncCount) {
    // 长文章首屏外代码块分批处理，避免切页瞬间连续改写几十段代码把主线程卡住。
    void (async () => {
      for (let i = syncCount; i < pres.length && live; i++) {
        if ((i - syncCount) % BATCH_SIZE === 0) {
          await yieldToMain();
          if (!live) return;
        }
        enhance(pres[i]);
      }
    })();
  }
}, BLOCKS);
