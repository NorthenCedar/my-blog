import { onPage } from './page-lifecycle';

const LIKE_STORE = 'nc-liked-talks';

export interface TalkLikeState {
  count?: number;
  liked: boolean;
  pending: boolean;
}

function readLiked(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LIKE_STORE) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((slug): slug is string => typeof slug === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeLiked(slugs: Set<string>) {
  try {
    localStorage.setItem(LIKE_STORE, JSON.stringify([...slugs].slice(-200)));
  } catch {
    // 浏览器禁止本地存储时，服务端仍然能识别重复点赞。
  }
}

onPage(({ document, IntersectionObserver, keep }) => {
  const liked = readLiked();
  const controller = new AbortController();
  const { signal } = controller;
  const entries = new Map<string, {
    button: HTMLButtonElement;
    state: TalkLikeState;
    render?: (state: TalkLikeState) => void;
  }>();
  keep(() => controller.abort());

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-like]')) {
    const slug = button.dataset.like!;
    const state: TalkLikeState = { liked: liked.has(slug), pending: false };
    entries.set(slug, { button, state });
    paint(slug);
    button.addEventListener('click', () => { void activate(slug); }, { signal });
  }

  function paint(slug: string) {
    const entry = entries.get(slug);
    if (!entry) return;
    const { button, state } = entry;
    button.disabled = state.pending;
    button.setAttribute('aria-pressed', String(state.liked));
    const label = state.liked ? '已点赞' : '点赞';
    button.setAttribute('aria-label', state.count === undefined ? label : label + '，' + state.count + ' 次');
    const count = button.querySelector('[data-like-count]');
    if (count && state.count !== undefined) count.textContent = String(state.count);
    entry.render?.(state);
  }

  async function activate(slug: string) {
    const state = entries.get(slug)?.state;
    if (!state || state.pending || state.liked) return;
    state.pending = true;
    paint(slug);
    try {
      const response = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
        signal,
      });
      if (!response.ok) return;
      const { count } = await response.json() as { count?: number };
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return;
      state.count = count;
      state.liked = true;
      liked.add(slug);
      writeLiked(liked);
    } catch {
      // 请求失败时回到原读数，可以重试。
    } finally {
      state.pending = false;
      if (!signal.aborted) paint(slug);
    }
  }

  const slugs = [...entries.keys()];
  fetch('/api/likes?slugs=' + encodeURIComponent(slugs.join(',')), { signal })
    .then(response => response.ok ? response.json() : null)
    .then((body: { likes?: Record<string, number> } | null) => {
      if (signal.aborted) return;
      for (const [slug, count] of Object.entries(body?.likes ?? {})) {
        const state = entries.get(slug)?.state;
        // 同期完成的点赞响应优先，旧的批量快照不能覆盖它。
        if (!state || state.count !== undefined) continue;
        state.count = count;
        paint(slug);
      }
    })
    .catch(() => { /* 批量计数失败仍可点赞。 */ });

  let view: Promise<typeof import('./talks-like-view')> | undefined;
  const observer = new IntersectionObserver(items => {
    for (const item of items) {
      if (!item.isIntersecting) continue;
      const button = item.target as HTMLButtonElement;
      observer.unobserve(button);
      const slug = button.dataset.like!;
      const entry = entries.get(slug)!;
      view ??= import('./talks-like-view');
      void view.then(({ mountTalkLike }) => {
        if (signal.aborted) return;
        const component = mountTalkLike(button, entry.state, () => { void activate(slug); });
        entry.render = component.render;
        keep(component.dispose);
      }).catch(() => { /* 点赞按钮可以继续使用服务端标记。 */ });
    }
  }, { rootMargin: '120px' });
  for (const { button } of entries.values()) observer.observe(button);
}, '[data-like]');
