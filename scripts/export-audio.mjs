import { exportAudioAssets } from '../src/lib/audio-assets.mjs';

// 与 export-videos.mjs 同一纪律：Astro 出完静态页面后，只导出**被发布页面引用**的音频，
// 草稿和没人听的试录不会跟着上线。
const { exported } = await exportAudioAssets();
console.log(`[audio] 已导出 ${exported} 个被引用的音频原件`);