# 标签区与留言页的无限符号素材

## 标签区：交互百褶无限环

2026-10-19 起，`src/components/TagsPlate.astro` 在标签总览和具体标签页复用 `PleatedInfinity.astro`，保留原关于页的点击疏密波和淡绿色反馈。陶瓷金属图片已移除。

百褶环由原生 WebGL 绘制，静态后备图继续使用 `src/assets/about/plates/pleated-infinity.webp`；颜色、浓度与对比度由 `tokens.css` 的 `--pleat-*` 控制。

## 留言页：机械环

`mechanical-ring.webp` 来自 RhinE 项目 `theme/assets/render/ring/ring-day.png`，保留原始 1400 × 900 画布及透明通道，仅转换为 WebP（质量 85）。`ring.json` 是同一模型导出的光槽轨迹，其中第四个分量表示该点是否可见。

- 作者项目：https://github.com/ericzhang12111-cell/RhinE
- 用户提供的视频：https://www.bilibili.com/video/BV1mYpK6WEPn/
- 获取日期：2026-10-16，main 分支；原许可全文保存在 `public/licenses/rhine-mechanical-ring.txt`，随站点发布。
- 原图：https://raw.githubusercontent.com/ericzhang12111-cell/RhinE/main/theme/assets/render/ring/ring-day.png
- 轨迹：https://raw.githubusercontent.com/ericzhang12111-cell/RhinE/main/theme/assets/render/ring/ring.json

本站在构建期将可见轨迹输出为 SVG，CSS 以整圈累计长度推动光点。数据不包含浏览器脚本；生产页面只读取本站构建资产，不请求作者服务器，也不加载作者的播放器、主题脚本或字体。

由 `src/components/MechanicalRing.astro` 用于留言页。素材和许可继续保留在本目录；标签区不叠加此环的光槽轨迹。
