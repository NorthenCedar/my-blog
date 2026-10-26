# 关于页背景素材

`fin-static-light.webp` 与 `fin-static-dark.webp` 是当前 `fin-scene.ts` 原场景导出的同姿态静态帧，1320×800，保留透明背景。使用原几何、材质、灯光和后处理；亮暗两版分别使用站点对应主题的色板，没有通过图片反色代替暗色渲染。用于手机、减少动态效果和场景无法启动时的背景。

更新当前三维装置的形状或材质时，应重新导出这两帧。导出时固定场景推进到装配完成后的同一时刻，切换色板并用 `render(0)` 保持姿态，再由现有 sharp 编码为 WebP。

以下为历史素材：

`pleated-infinity.webp` 为原生几何生成的透明静态后备图，与正式页面的 216 片立体环共用 `src/scripts/pleated-core.ts`，使用时间零的固定视角。不是视频截图。

重建：`node scripts/gen-pleated-fallback.mjs`。脚本使用已有构建依赖 esbuild 与 sharp，不增加站点运行时依赖。

`moon-main.webp` 是此前月相底纹的历史素材，目前关于页不再引用或加载。
