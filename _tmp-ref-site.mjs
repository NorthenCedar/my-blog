/** 参考站结构读取（_tmp 前缀 = 临时证据）：抓导航链接 + 四个目标页的内容摘要 */
import { mkdirSync, writeFileSync } from 'node:fs';

const SITE = 'http://blog.ayeez.cn';
const OUT = '<博客仓库>\\_tmp-ref';
mkdirSync(OUT, { recursive: true });

const get = async (u) => {
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 'ERR', text: String(e.cause?.code ?? e.message) };
  }
};
const jina = async (u) => {
  const r = await get('https://r.jina.ai/' + u);
  return r.text;
};

const home = await get(SITE + '/');
console.log('首页:', home.status, home.text.length, '字节');
writeFileSync(OUT + '/home.html', home.text);

const links = [];
for (const m of home.text.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,24}?)<\/a>/g)) {
  const text = m[2].replace(/<[^>]*>/g, '').trim();
  if (text) links.push([m[1], text]);
}
const seen = new Set();
console.log('--- 首页链接 ---');
for (const [h, t] of links) {
  const k = h + '|' + t;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log('  ' + t.padEnd(10) + ' → ' + h);
}

// 找四个目标页的真实路径
const want = ['友链', '说说', '留言', '日志', '关于', '归档'];
console.log('--- 目标页路径 ---');
const found = {};
for (const [h, t] of links) {
  for (const w of want) if (t.includes(w) && !found[w]) found[w] = h.replace(SITE, '');
}
console.log('  ' + JSON.stringify(found));

for (const [name, path] of Object.entries(found)) {
  const raw = await get(SITE + path);
  const md = await jina(SITE + path);
  writeFileSync(`${OUT}/${name}.html`, raw.text);
  writeFileSync(`${OUT}/${name}.md`, md);
  console.log(`\n=== ${name} ${path} → ${raw.status} · html ${raw.text.length}B · jina ${md.length}B ===`);
  // 摘要：前 1200 字（去掉多余空行）
  const clean = md.replace(/\n{3,}/g, '\n\n').slice(0, 1400);
  console.log(clean);
}
