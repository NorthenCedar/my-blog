# 标签区与留言页的无限符号素材

## 标签区：陶瓷金属无限符号

`ceramic-infinity.webp` 是站主于 2026-10-16 选用的 AI 生成设计稿，以莱茵生命的科研工业视觉为灵感；不是官方素材。由内置 imagegen 生成 1774 × 887 的透明 PNG，再保留透明通道缩至 1600 × 800、转换为 WebP（质量 85）。仅做尺寸与格式优化，不改构图或配色。

生成提示词要点：单个横向立体无限符号；宽扁、带柔和倒角的连续带状结构，中心交叉有明确前后遮挡；暖白哑光陶瓷外壳、拉丝钛金属内沿、深灰接缝与少量铜色嵌线；精密实验仪器气质，克制的分段和刻槽；接近正面的轻微三分之四视角、左上方柔光；完整轮廓与透明背景、双环内部透空；无文字、无虹彩、无玻璃材质、无复杂线圈。

由 `src/components/TagsPlate.astro` 用于标签总览及具体标签页，图片浓度由 `--tags-plate-opacity` 独立控制。原始生成稿保存在本次会话的生成图片目录，本站只引用仓库内 WebP。

## 留言页：机械环

`mechanical-ring.webp` 来自 RhinE 项目 `theme/assets/render/ring/ring-day.png`，保留原始 1400 × 900 画布及透明通道，仅转换为 WebP（质量 85）。`ring.json` 是同一模型导出的光槽轨迹，其中第四个分量表示该点是否可见。

- 作者项目：https://github.com/ericzhang12111-cell/RhinE
- 用户提供的视频：https://www.bilibili.com/video/BV1mYpK6WEPn/
- 获取日期：2026-10-16，main 分支；原许可全文保存在 `public/licenses/rhine-mechanical-ring.txt`，随站点发布。
- 原图：https://raw.githubusercontent.com/ericzhang12111-cell/RhinE/main/theme/assets/render/ring/ring-day.png
- 轨迹：https://raw.githubusercontent.com/ericzhang12111-cell/RhinE/main/theme/assets/render/ring/ring.json

本站在构建期将可见轨迹输出为 SVG，CSS 以整圈累计长度推动光点。数据不包含浏览器脚本；生产页面只读取本站构建资产，不请求作者服务器，也不加载作者的播放器、主题脚本或字体。

由 `src/components/MechanicalRing.astro` 用于留言页。素材和许可继续保留在本目录；标签区已改用上面的独立设计图，不再叠加此环的光槽轨迹。
