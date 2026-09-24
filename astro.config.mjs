import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // 部署在 Cloudflare Pages，先用免费子域；换域名只改这一行
  site: 'https://beishan-notes.pages.dev',
  integrations: [sitemap()],
  markdown: {
    // 用 CSS 变量接管代码块配色（design-spec.md：黑底白字），
    // 这样 Shiki 输出的是变量引用，我们能在 prose.css 里覆盖，不必写自定义主题 JSON。
    shikiConfig: { theme: 'css-variables' },
  },
});
