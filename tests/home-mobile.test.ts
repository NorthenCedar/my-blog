import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const home = readFileSync('src/pages/index.astro', 'utf8');
const initializer = home.match(/<script\b[^>]*data-home-stack-init\b[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';

// 只替换浏览器边界；执行首页实际的同步初始化脚本，检查 open 的可观察状态。
function openHome(width: number) {
  const details = { tagName: 'DETAILS', open: true };
  const queries: { media: EventTarget & { matches: boolean }; max: number; min: number }[] = [];
  const matchMedia = (query: string) => {
    const max = Number(query.match(/max-width\s*:\s*([\d.]+)px/)?.[1] ?? Infinity);
    const min = Number(query.match(/min-width\s*:\s*([\d.]+)px/)?.[1] ?? 0);
    const media = Object.assign(new EventTarget(), { matches: width >= min && width <= max });
    queries.push({ media, max, min });
    return media;
  };
  runInNewContext(initializer, {
    document: { currentScript: { previousElementSibling: details } },
    window: { matchMedia },
    matchMedia,
  });
  return {
    details,
    resize(nextWidth: number) {
      for (const { media, max, min } of queries) {
        const matches = nextWidth >= min && nextWidth <= max;
        if (matches !== media.matches) {
          media.matches = matches;
          media.dispatchEvent(new Event('change'));
        }
      }
    },
  };
}

describe('首页技术栈的手机折叠', () => {
  it('767px 初次初始化即收起服务端展开的明细', () => {
    expect(openHome(767).details.open).toBe(false);
  });

  it('768px 保持明细直接展开', () => {
    expect(openHome(768).details.open).toBe(true);
  });

  it('手机手动展开后，同一断点内调整宽度仍保留阅读状态', () => {
    const view = openHome(390);
    view.details.open = true;
    view.resize(600);
    expect(view.details.open).toBe(true);
  });

  it('从手机跨到桌面会展开，再回到手机会收起', () => {
    const view = openHome(767);
    view.details.open = false;
    view.resize(768);
    expect(view.details.open).toBe(true);
    view.resize(767);
    expect(view.details.open).toBe(false);
  });
});
