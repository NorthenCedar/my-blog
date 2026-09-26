/**
 * 后端端到端验收（_tmp 前缀 = 临时证据）：点赞 / 统计 / 访问中间件，全打在**本地** wrangler pages dev 上。
 * 用法：node _tmp-api-check.mjs [baseUrl]   默认 http://127.0.0.1:8788
 */
const BASE = (process.argv[2] ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};
const j = async (path, init) => {
  const r = await fetch(BASE + path, init);
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, body, headers: r.headers };
};
const post = (path, data) =>
  j(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

// 等服务起来
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(BASE + '/api/stats');
    if (r.ok) break;
  } catch {
    /* 还没起来 */
  }
  await sleep(1000);
}

console.log('=== ① 点赞：批量查询 ===');
const slugA = 'talk-' + Math.random().toString(36).slice(2, 10);
const slugB = 'talk-' + Math.random().toString(36).slice(2, 10);
const list0 = await j(`/api/likes?slugs=${slugA},${slugB}`);
check('新条目的赞数是 0（且批量返回两条）', JSON.stringify(list0.body), JSON.stringify({ likes: { [slugA]: 0, [slugB]: 0 } }));

console.log('\n=== ② 点赞：点一下 ===');
const p1 = await post('/api/likes', { slug: slugA });
check('第一次点赞 counted=true 且 count=1', `${p1.status}/${p1.body.counted}/${p1.body.count}`, '201/true/1');
const p2 = await post('/api/likes', { slug: slugA });
check('同 IP 再点：幂等（counted=false，count 仍是 1）', `${p2.status}/${p2.body.counted}/${p2.body.count}`, '200/false/1');
const fromOtherIp = await fetch(BASE + '/api/likes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
  body: JSON.stringify({ slug: slugA }),
});
const other = await fromOtherIp.json();
check('换一个 IP 点赞：count 变 2', `${other.counted}/${other.count}`, 'true/2');
const list1 = await j(`/api/likes?slugs=${slugA},${slugB}`);
check('批量查询能看到新计数', JSON.stringify(list1.body), JSON.stringify({ likes: { [slugA]: 2, [slugB]: 0 } }));

console.log('\n=== ③ 点赞：脏输入要被挡住 ===');
const bad1 = await post('/api/likes', { slug: 'articles-hello' });
check('非说说 slug 被拒', `${bad1.status}`, '400');
const bad2 = await post('/api/likes', { slug: 'talk-../etc' });
check('非法字符被拒', `${bad2.status}`, '400');
const bad3 = await post('/api/likes', {});
check('缺 slug 被拒', `${bad3.status}`, '400');
const bad4 = await j('/api/likes?slugs=talk-ok,../../etc,articles-x');
check('批量里的脏值被静默丢弃（只回合法的）', JSON.stringify(bad4.body), JSON.stringify({ likes: { 'talk-ok': 0 } }));

console.log('\n=== ④ 访问统计：中间件计数 ===');
const before = (await j('/api/stats')).body;
console.log(`  计数前: PV=${before.pv} UV=${before.uv}`);
const page1 = await fetch(BASE + '/archive/', { headers: { Accept: 'text/html' } });
const setCookie = page1.headers.get('set-cookie') ?? '';
const vid = (setCookie.match(/nc_vid=([a-z0-9]+)/) ?? [, ''])[1];
check('首次访问文档：发访客号 cookie', /nc_vid=[a-z0-9]{16}/.test(setCookie) ? 'true' : setCookie || '(无)', 'true');
await sleep(400);
const after1 = (await j('/api/stats')).body;
check('PV +1', after1.pv - before.pv, '1');
check('UV +1', after1.uv - before.uv, '1');

// 同一个访客再访问两页：PV +2、UV 不变
await fetch(BASE + '/about/', { headers: { Accept: 'text/html', Cookie: `nc_vid=${vid}` } });
const r3 = await fetch(BASE + '/talks/', { headers: { Accept: 'text/html', Cookie: `nc_vid=${vid}` } });
check('带 cookie 再访问：不再发 Set-Cookie', (r3.headers.get('set-cookie') ?? '(无)'), '(无)');
await sleep(400);
const after2 = (await j('/api/stats')).body;
check('同访客再看两页：PV +2', after2.pv - after1.pv, '2');
check('同访客再看两页：UV 不变', after2.uv - after1.uv, '0');

console.log('\n=== ⑤ 不该计的不能计 ===');
const beforeSkip = (await j('/api/stats')).body;
await fetch(BASE + '/_astro/' + '', { headers: { Accept: 'text/html' } }).catch(() => {});
await fetch(BASE + '/api/likes?slugs=talk-x', { headers: { Accept: 'text/html' } }); // /api/ 不算
await fetch(BASE + '/not-found-page-xyz/', { headers: { Accept: 'text/html' } }); // 404 不算
const cssRes = await fetch(BASE + '/archive/', { headers: { Accept: 'text/css' } }); // 非文档不算
await cssRes.text().catch(() => {});
await sleep(500);
const afterSkip = (await j('/api/stats')).body;
check('接口调用 / 404 / 非文档请求都没有被计数', afterSkip.pv - beforeSkip.pv, '0');

console.log(`\n=== ${fails === 0 ? 'ALL PASS：后端接口符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
