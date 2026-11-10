import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import typegpu from 'unplugin-typegpu/vite';
import { createVideoDevPlugin } from './src/lib/video-assets.mjs';
import { createAudioDevPlugin } from './src/lib/audio-assets.mjs';
import { withPreservedIndent } from './src/lib/markdown-preserve-indent.mjs';
import { withAudioMarkup } from './src/lib/markdown-audio.mjs';
import { satteri } from '@astrojs/markdown-satteri';

export default defineConfig({
  // 站点正式地址（2026-09-25 绑定自有域名 northcedar.top）。
  // 换域名时只改这一行 —— robots.txt、sitemap、canonical 全都从它派生。
  site: 'https://northcedar.top',
  integrations: [sitemap({ filter: page => !['/account/', '/avatar-sources/', '/write/'].includes(new URL(page).pathname) })],
  markdown: {
    // 用 CSS 变量接管代码块配色（design-spec.md：黑底白字），
    // 这样 Shiki 输出的是变量引用，我们能在 prose.css 里覆盖，不必写自定义主题 JSON。
    shikiConfig: { theme: 'css-variables' },
    // ★ 2026-11-04：保住段落续行的行首缩进。CommonMark 在**解析阶段**就把续行开头的
    //   空格当缩进吃掉了（mdast 里已经查不到），所以只能包一层处理器、在喂给解析器
    //   之前把行首 1–3 个空格换成不换行空格；换行本身由 prose.css 的 pre-wrap 保住。
    // ★ 2026-11-10：音频条。`!audio[说明](/audio/<hash>.mp3)` 这一行在**解析前**
    //   换成播放器骨架（理由同下一条：这层包装只拿得到源码字符串）。
    //   套在缩进处理器**外面** —— 它吐出来的 `<div …>` 以 `<` 开头，
    //   缩进处理器正会跳过这类行，两者不会互相踩。
    processor: withAudioMarkup(withPreservedIndent(satteri())),
  },
  image: {
    // 让正文里的图片自动带 srcset/sizes。不加这条，短文那三张 2133px 宽的原图
    // 会被整张传下去（实测浪费约 560 KB），而显示宽度只有 578px。
    layout: 'constrained',
  },
  vite: {
    plugins: [
      createVideoDevPlugin(),
      createAudioDevPlugin(),
      // ★ 2026-10-17：Jelly Slider 主题开关（原版 WebGPU 实现，src/vendor/jelly-slider/）。
      //   TypeGPU 的 'use gpu' 函数体必须在构建时抽取 shader 源码；
      //   没有这个插件，运行时报 "Missing metadata for tgpu.fn function body"。
      typegpu(),
    ],
    build: {
      // ★ 2026-09-30：修「玻璃层在产物里只剩 -webkit- 前缀」。
      //
      // 现象：源码里成对写的
      //     backdrop-filter: blur(10px);
      //     -webkit-backdrop-filter: blur(10px);
      //  构建后产物里**只剩 -webkit- 那条**，标准 backdrop-filter 被删掉。
      //  v10.6 玻璃层三条规则（.tier-head / .index a::before / .pod）全中招。
      //
      // 真凶不是 lightningcss（那只在 cssMinify=false 时兜底），
      //  而是 **Vite 默认的 esbuild CSS 压缩**：它按 build.cssTarget 做前缀降级，
      //  默认目标是「较老的浏览器」，于是判定「标准属性无覆盖，用前缀版替换掉」。
      //
      // 为什么必须修：-webkit-backdrop-filter 是厂商前缀、不是规范属性。
      //  现在 Chrome/Safari 确实认它，但这是**在赌**：一旦目标浏览器判定变化、
      //  或 Firefox（只认标准属性）访问，玻璃会成片静默消失，且不报任何错。
      //
      // 修法：把 cssTarget 提到「支持标准 backdrop-filter 的现代基线」，
      //  esbuild 就会两条都保留（体积代价：三个属性名）。
      // 基线依据：Chrome 76+ / Safari 9+（前缀）/ Firefox 103+ 支持标准 backdrop-filter。
      // 这里取一个宽松的现代基线，不追求兼容远古浏览器。
      cssTarget: ['chrome111', 'edge111', 'firefox113', 'safari16'],
    },
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
      alias: [
        {
          find: 'picomatch',
          replacement: fileURLToPath(new URL('./scripts/picomatch-esm-shim.mjs', import.meta.url)),
        },
        /* ★ 2026-10-18：关于页那个立体 ∞ 要用 n8ao（AO），而 n8ao 有一行
           `import { Pass } from "three/examples/jsm/postprocessing/Pass.js"`。
           ★★ 这里为什么必须用**数组式** alias（而不是原来那个对象式）：
             Vite 的 alias 对 `find` 字符串做的是**前缀匹配**，不是精确匹配。
             原来只写了 `three: …/three.module.min.js`，于是
             `three/examples/jsm/postprocessing/Pass.js` 被吸成
             `…/three.module.min.js/examples/jsm/postprocessing/Pass.js`
             ⇒ UNLOADABLE_DEPENDENCY「系统找不到指定的路径」（实测踩过一次）。
           解法：把长路径写在**前面**（Vite 取最长匹配优先），指向本仓 vendor 化的那一份；
           `three` 留在后面兜住裸 `three`。 */
        {
          find: 'three/examples/jsm/postprocessing/Pass.js',
          replacement: fileURLToPath(
            new URL('./src/vendor/three-examples/postprocessing/Pass.js', import.meta.url),
          ),
        },
        /* ★ 2026-09-30：真 3D DNA（站主拍板「用 three.js，接受破例」）。
           三个 vendor 文件（three.module.min.js / GLTFLoader.js / BufferGeometryUtils.js）
           都放在 src/vendor/ 下 —— **不能**放 public/：
           tests/build-output.test.ts 断言产物 JS 必须匹配 /^dist\/_astro\//，
           从 public/ 直拷出来的 .js 会被判成「手拷进来」。
           GLTFLoader 内部写的是裸说明符 `from 'three'`，所以这里给它一个别名指到 vendor。 */
        {
          find: 'three',
          replacement: fileURLToPath(new URL('./src/vendor/three.module.min.js', import.meta.url)),
        },
      ],
    },
  },
});
