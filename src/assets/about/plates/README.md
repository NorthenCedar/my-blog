# 关于页百褶环

`pleated-infinity.webp` 为原生几何生成的透明静态后备图，与正式页面的 216 片立体环共用 `src/scripts/pleated-core.ts`，使用时间零的固定视角。不是视频截图。

重建：`node scripts/gen-pleated-fallback.mjs`。脚本使用已有构建依赖 esbuild 与 sharp，不增加站点运行时依赖。

`moon-main.webp` 是此前月相底纹的历史素材，目前关于页不再引用或加载。
