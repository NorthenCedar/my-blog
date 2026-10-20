import { exportVideoAssets } from '../src/lib/video-assets.mjs';

// Astro 完成静态页面后，再按实际引用导出原件，避免把草稿素材带上线。
const { exported } = await exportVideoAssets();
console.log(`[videos] 已导出 ${exported} 个已发布页面引用的视频`);
