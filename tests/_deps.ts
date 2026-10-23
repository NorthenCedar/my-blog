/**
 * 运行时依赖的**白名单**（唯一一份）。
 *
 * 这条规矩原来是「运行时只有 astro / @astrojs/rss / @astrojs/sitemap，不许再加」，
 * 并且被**逐字抄在 8 个测试文件里**（fracture / gallery-inf / gallery-plate /
 * gallery-spiral / guestbook-plate / reading-rule / tags-crosshair / talks-float）——
 * 于是"改一次规矩"要改 8 处，漏一处就变成两份互相矛盾的规格书。
 *
 * 2026-10-17 站主拍板：把 Jelly Slider 主题开关的渲染器（Software Mansion 原版
 * WebGPU 光追实现）作为**许可的例外**收进站里。与其把 3 个名字改成 8 个名字再抄 8 遍，
 * 改成**单一白名单**：
 *   · 断言语义没变，仍是「**恰好是这一张清单**」—— 多一条、少一条都会红；
 *   · 加依赖只改这一个文件，而改的时候一定会看见下面这段理由。
 *
 * ⚠ 加依赖之前先问三句：
 *   ① 能不能进 devDependencies（只在构建期用）？
 *   ② 站上真的需要它吗，能不能不进仓库？
 *   ③ 它进不进访客的下载路径（那个 chunk 多大）？
 *   运行时依赖每多一条，访客要下的字节和不设防的供应链就多一分。
 *
 * 每个依赖的**现状**（2026-10-17 实测）：
 *   · 骨架三条 — 一直都有。
 *   · `unplugin-typegpu` — Vite 插件，构建期把 `'use gpu'` 函数转成 TypeGPU 的调用。
 *     语义上属于 devDependencies，但 `@astrojs/sitemap` 这条构建期集合同样住在
 *     `dependencies` 里 ⇒ 沿用仓库现状，不动（免得改出"CF 上装不到"的风险）。
 *   · 其余四条 — 只被 `src/vendor/jelly-slider/**` 用到，且只在**关于页**被加载。
 *   · `postprocessing` / `n8ao`（2026-10-18 站主拍板，为了关于页那个立体 ∞ 的
 *     后处理：色调映射 + AO）。**原版 rhine-lock 还用了 drei，本仓不需要** ——
 *     场景里只有一台雕塑，没有可复用的模型/环境组件。
 *     n8ao 是 **WASM**（803 KB），走**独立文件同源加载**（不是 base64 内联）：
 *     内联会让体积涨到 ~1.1 MB（+37%）且整个 bundle 下完才能开始编译，
 *     独立文件则能边下边编、独立缓存。实测**同一道规则下 B 全面优于 A**，
 *     零第三方的约束已于同日撤除（见 AGENTS.md §3 开头）。
 */
export const RUNTIME_DEPS_ALLOWED = [
  // 站点骨架
  '@astrojs/rss',
  '@astrojs/sitemap',
  'astro',
  // Jelly Slider 主题开关的渲染器（2026-10-17）
  '@typegpu/noise',
  '@typegpu/sdf',
  // 立体 ∞ 的后处理（2026-10-18）：色调映射 / 辉光 / AO
  'n8ao',
  'postprocessing',
  'typegpu',
  'unplugin-typegpu',
  'wgpu-matrix',
  // 云端写作：只在 Functions / runner 保留式解析内容，不进入访客脚本。
  'yaml',
  // 仅私密 /write/ 可视化编辑器加载；保存格式仍是 Markdown。
  'markdown-it',
  'prosemirror-commands',
  'prosemirror-history',
  'prosemirror-keymap',
  'prosemirror-markdown',
  'prosemirror-model',
  'prosemirror-schema-list',
  'prosemirror-state',
  'prosemirror-view',
].sort();
