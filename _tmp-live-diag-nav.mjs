/** 线上现状诊断（_tmp 前缀 = 临时证据）：导航在不在、首页有没有、HTML 缓存策略 */
const SITE = 'https://northcedar.top';
const get = async (p) => {
  const r = await fetch(SITE + p, { headers: { 'user-agent': 'Mozilla/5.0', 'cache-control': 'no-cache' } });
  return { status: r.status, headers: Object.fromEntries(r.headers), html: await r.text() };
};
const has = (h, s) => h.includes(s);

for (const p of ['/', '/about/', '/links/', '/talks/', '/guestbook/', '/log/']) {
  const r = await get(p);
  const nav = has(r.html, 'aria-label="主导航"');
  const drawer = has(r.html, 'navpanel');
  const items = ['友链', '说说', '留言', '日志'].filter((l) => has(r.html, `>${l}</a>`));
  console.log(`--- ${p}  HTTP ${r.status}  ${(r.html.length / 1024).toFixed(1)} KB`);
  console.log(`    横排导航=${nav}  抽屉=${drawer}  新项命中=[${items.join(' ')}]`);
  console.log(`    cache-control: ${r.headers['cache-control'] ?? '(无)'}  cf-cache-status: ${r.headers['cf-cache-status'] ?? '(无)'}  etag: ${(r.headers['etag'] ?? '(无)').slice(0, 24)}  age: ${r.headers['age'] ?? '-'}`);
}

// 首页顶部区域实际有什么
const home = await get('/');
const top = home.html.slice(home.html.indexOf('<body'), home.html.indexOf('<body') + 1200);
console.log('\n首页 <body> 开头 1200 字（看有没有导航/抽屉）:');
console.log(top.replace(/></g, '>\n<').split('\n').filter((l) => l.includes('<nav') || l.includes('navtog') || l.includes('hud') || l.includes('class="').valueOf()).slice(0, 14).join('\n'));
