import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import PulseHeart from '../vendor/react-bits/PulseHeart';
import type { TalkLikeState } from './talks-likes';

export function mountTalkLike(button: HTMLButtonElement, state: TalkLikeState, activate: () => void) {
  const hadFocus = document.activeElement === button;
  const host = document.createElement('span');
  button.after(host);
  const root = createRoot(host);
  let locked = false;

  function render(next: TalkLikeState) {
    locked = next.liked || next.pending;
    root.render(createElement(PulseHeart, {
      liked: locked,
      count: (next.count ?? 0) + (next.pending ? 1 : 0),
      showCount: next.count !== undefined || next.pending,
      onChange: activate,
      label: next.liked ? '已点赞' : '点赞',
      size: 24,
      pillColor: 'var(--panel)',
      idleColor: 'var(--muted)',
      likedColor: 'var(--accent-ink)',
      textColor: 'var(--ink)',
    }));
  }

  // 原版是可反选按钮。本站点赞一次生效，沿用原来的服务端幂等约定。
  host.addEventListener('click', event => {
    if (!locked) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  flushSync(() => render(state));
  button.hidden = true;
  if (hadFocus) host.querySelector('button')?.focus({ preventScroll: true });

  return {
    render,
    dispose() {
      root.unmount();
      host.remove();
      button.hidden = false;
    },
  };
}
