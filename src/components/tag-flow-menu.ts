import { createElement, Fragment } from 'react';
import FlowingMenu, { type FlowingMenuItem } from '../vendor/react-bits/FlowingMenu';

export type TagFlowMenuItem = Omit<FlowingMenuItem, 'marquee' | 'image'> & { bandText: string[] };

export function tagFlowMenu(items: TagFlowMenuItem[], hasPhotos: boolean, articles = false) {
  return createElement(FlowingMenu, {
    items: items.map(({ bandText, ...item }, row) => ({
      ...item,
      marquee: bandText.map((text, index) => {
        const photo = '--tag-flow-photo-' + row + '-' + index;
        return createElement(Fragment, { key: index },
          createElement('span', { className: 'tag-flow-title' }, text),
          hasPhotos && createElement('span', {
            className: 'flowing-menu__image tag-flow-photo',
            'data-tag-flow-photo': photo,
            style: { backgroundImage: 'var(' + photo + ', none)' },
          }),
        );
      }),
    })),
    ariaLabel: articles ? '标签下的文章' : '按标签浏览',
    textColor: 'var(--ink)',
    bgColor: 'transparent',
    dividers: false,
    intro: false,
    marqueeBgColor: 'var(--tag-flow-band)',
    marqueeTextColor: 'var(--paper)',
  });
}
