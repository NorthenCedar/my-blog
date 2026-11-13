import { getViteConfig } from 'astro/config';

export default getViteConfig({
  /* ★ 2026-11-13：与长驻 dev server 的依赖预打包缓存隔离（见 astro.config.mjs 顶部说明）。
     共用 `node_modules/.vite/deps` 时，跑一次测试就会把 dev 页面里
     @hugeicons/* / vgpu 的 504 Outdated Optimize Dep 打出来。 */
  cacheDir: 'node_modules/.vite-vitest',
  test: { include: ['tests/**/*.test.ts'] },
});
