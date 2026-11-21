import { resolve } from 'node:path';
import { exportAudioAssets } from '../src/lib/audio-assets.mjs';
import { readBuildHtmlIndex } from '../src/lib/build-html-index.mjs';
import { writeBrowserSecurity } from '../src/lib/build-browser-security.mjs';
import { writeCommentTargets } from '../src/lib/comment-targets-build.mjs';
import { exportVideoAssets } from '../src/lib/video-assets.mjs';

// 媒体、留言目标和浏览器策略共用最终 HTML 的一次索引。
const htmlIndex = await readBuildHtmlIndex(resolve('dist'));
const audio = await exportAudioAssets({ htmlIndex });
console.log(`[audio] 已导出 ${audio.exported} 个被引用的音频原件`);
const video = await exportVideoAssets({ htmlIndex });
console.log(`[videos] 已导出 ${video.exported} 个已发布页面引用的视频`);
await writeCommentTargets({ htmlIndex });
await writeBrowserSecurity({ scripts: htmlIndex.scripts });
