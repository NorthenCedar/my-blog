import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // 站点正式地址（2026-09-25 绑定自有域名 northcedar.top）。
  // 换域名时只改这一行 —— robots.txt、sitemap、canonical 全都从它派生。
  site: 'https://northcedar.top',
  integrations: [sitemap()],
  markdown: {
    // 用 CSS 变量接管代码块配色（design-spec.md：黑底白字），
    // 这样 Shiki 输出的是变量引用，我们能在 prose.css 里覆盖，不必写自定义主题 JSON。
    shikiConfig: { theme: 'css-variables' },
  },
  image: {
    // 让正文里的图片自动带 srcset/sizes。不加这条，短文那三张 2133px 宽的原图
    // 会被整张传下去（实测浪费约 560 KB），而显示宽度只有 578px。
    layout: 'constrained',
  },
});
