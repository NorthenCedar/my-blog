# 标签区与留言页的无限符号素材

## 标签区：交互百褶无限环

2026-10-19 起，`src/components/TagsPlate.astro` 在标签总览和具体标签页复用 `PleatedInfinity.astro`，保留原关于页的点击疏密波和淡绿色反馈。陶瓷金属图片已移除。

2026-10-20 暗色环体改为石墨黑，点击脉冲改为橙色，与当前关于页共用 `--fin-body-dark` / `--fin-glow-dark`。随后为每片薄片添加常驻橙色细边辉光，点击时局部增强；静态后备图同步显示为黑灰与淡橙投影。源图片保持原样；亮色仍为暖白薄片与淡绿色反馈，常驻辉光强度为零。

百褶环由原生 WebGL 绘制，静态后备图继续使用 `src/assets/about/plates/pleated-infinity.webp`；颜色、浓度与对比度由 `tokens.css` 的 `--pleat-*` 控制。

## 留言页：机械环

`mechanical-ring.webp` 来自 RhinE 项目 `theme/assets/render/ring/ring-day.png`，保留原始 1400 × 900 画布及透明通道，仅转换为 WebP（质量 85）。`ring.json` 是同一模型导出的光槽轨迹，其中第四个分量表示该点是否可见。

2026-10-20 亮色显示改为亮银外壳与绿色光槽：仅在日间图片上应用 `tokens.css` 的 `--ring-day-filter`（色相旋转、降低饱和度、小幅增强反差），源图片保持原样。亮色显示浓度 0.48，流光为短小暖白光芯与淡绿光晕；夜间原图不应用此滤镜。

2026-10-20 补入 `mechanical-ring-night.webp`，直接采用原项目的 `ring-night.png`。保留 2800 × 1800 画布与 alpha，无损转换为 WebP，不调色、不重画。构建时生成 700 / 1400 宽度的响应式 WebP（质量 95）。夜间原图包含深色金属外壳、橙色光槽、透明护罩和银白反光；组件按站内 `html.dark` 选择日间／夜间图片，不再给日间图片套调色滤镜。

- 夜间素材固定版本：`9eb0c72fa28fcf547455ee49bb04c9c83c848819`。
- 原图：https://github.com/ericzhang12111-cell/RhinE/blob/9eb0c72fa28fcf547455ee49bb04c9c83c848819/theme/assets/render/ring/ring-night.png
- 原文件 Git blob：`86563d21009bccb6bdbc8b691d76422ec88c8d37`。
- 原实现：https://github.com/ericzhang12111-cell/RhinE/blob/9eb0c72fa28fcf547455ee49bb04c9c83c848819/theme/js/lib/ring.js
- 原项目也是以 Blender 静态渲染图叠加光槽脉冲，并非浏览器实时计算环境反射。本站保留这一构成，夜间流光采用原版橙色光晕和暖白光芯；MIT 许可同下。

- 作者项目：https://github.com/ericzhang12111-cell/RhinE
- 用户提供的视频：https://www.bilibili.com/video/BV1mYpK6WEPn/
- 获取日期：2026-10-16，main 分支；原许可全文保存在 `public/licenses/rhine-mechanical-ring.txt`，随站点发布。
- 原图：https://raw.githubusercontent.com/ericzhang12111-cell/RhinE/main/theme/assets/render/ring/ring-day.png
- 轨迹：https://raw.githubusercontent.com/ericzhang12111-cell/RhinE/main/theme/assets/render/ring/ring.json

本站在构建期将可见轨迹输出为 SVG，CSS 以整圈累计长度推动光点。数据不包含浏览器脚本；生产页面只读取本站构建资产，不请求作者服务器，也不加载作者的播放器、主题脚本或字体。

由 `src/components/MechanicalRing.astro` 用于留言页。素材和许可继续保留在本目录；标签区不叠加此环的光槽轨迹。


### 2026-11-06：原图恢复

站主明确要求保留原作，本站撤回自行按轨迹重建的网格，恢复本目录原有渲染图及轨迹，图片文件没有改写。日间仅按原draw.js的accentShift/hueMatrix等价方式换为指定黄绿，不改图像结构与明暗；夜间原图不调色。CSS只允许小幅倾斜与12度内平面转动，不提供侧背面。原实现参考https://github.com/ericzhang12111-cell/RhinE/blob/f3a6fb2ef4c848586922fbde1acec83281d82287/theme/js/lib/draw.js 。
