/**
 * picomatch ESM shim —— 修 `astro sync` / `astro build` 的
 *   GenerateContentTypesError: require is not defined @ picomatch/index.js:6
 *
 * 为什么要它（2026-09-25 实测排查）：
 *   1. `astro sync` 会起一个临时 Vite dev server 来加载 `src/content.config.ts`，
 *      它写死了 `optimizeDeps: { noDiscovery: true }` 与 `ssr: { external: [] }`
 *      —— 见 node_modules/astro/dist/core/sync/index.js:184-191，
 *      即「不预打包 + 不外部化」，所有依赖都必须被内联。
 *      （该 server 以 command: 'build' 创建，所以 optimizeDeps.include 也不生效；
 *        实测把那里改成 ssr.external: ['picomatch'] 同样无效。）
 *   2. Vite 8 的 SSR module runner 只执行 ESM：内联的模块里没有 `require`
 *      （grep 全 dist 已无 __vite_ssr_require__ 之类的 CJS 兜底）。
 *   3. picomatch 4.x 是纯 CJS（package.json 只有 "main": "index.js"，
 *      没有 "type"、没有 "exports"），被内联后必然 `require is not defined`。
 *      链路：astro 的 glob() loader → tinyglobby(ESM) → import picomatch(CJS)。
 *
 * 这个文件是 ESM，可以被 Vite 正常内联；真正的 CJS 包用 createRequire 在**运行时**
 * 交给 Node 自己加载（Node 加载 CJS 没有任何问题）。
 *
 * 它只是把模块形态换了个壳，导出与 picomatch 原包完全一致（default 即那个函数）。
 * 上游修好后（astro 不再写死 ssr.external: []，或 picomatch 出 ESM 入口）
 * 删掉本文件与 astro.config.mjs 里对应的 resolve.alias 即可。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const picomatch = require('picomatch');

export default picomatch;
