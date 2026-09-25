import { fileURLToPath } from 'node:url';
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
  vite: {
    resolve: {
      // 修 `astro sync` / `astro build` 的
      //   GenerateContentTypesError: require is not defined @ picomatch/index.js:6
      //
      // astro sync 的临时 Vite server 写死了「不预打包 + 不外部化」
      // （node_modules/astro/dist/core/sync/index.js:184-191：
      //   optimizeDeps: { noDiscovery: true }, ssr: { external: [] }，
      //   且以 command: 'build' 创建，所以 optimizeDeps.include 也不生效；
      //   实测把 ssr.external 改成 ['picomatch'] 同样无效）。
      // 而 Vite 8 的 SSR module runner 只执行 ESM、不提供 require，
      // picomatch 4.x 又是纯 CJS —— 内联即炸。
      // 这里把它 alias 到一个 ESM 外壳，壳内用 createRequire 在运行时加载真包。
      alias: {
        picomatch: fileURLToPath(new URL('./scripts/picomatch-esm-shim.mjs', import.meta.url)),
      },
    },
  },
});
