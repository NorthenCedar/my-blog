/** B3 剥离点的真实文本（_tmp 前缀 = 临时证据） */
import { readFileSync } from 'node:fs';

const html = readFileSync('<博客仓库>\\dist\\index.html', 'utf8');
const i = html.indexOf('hudPct');
console.log('hudPct 之后 260 字（原样，不换行）:');
console.log(JSON.stringify(html.slice(i, i + 260)));
const j = html.indexOf('hud-right');
console.log('\nhud-right 开标签附近:');
console.log(JSON.stringify(html.slice(j - 30, j + 120)));
