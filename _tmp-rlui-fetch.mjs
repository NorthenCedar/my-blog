// Probe: fetch a batch of file paths via Contents API into a local mirror under _tmp-rlui/
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = '<博客仓库>/_tmp-rlui';
const paths = process.argv.slice(2);
if (!paths.length) { console.log('no paths'); process.exit(1); }

async function getOne(p) {
  const url = `https://api.github.com/repos/LBEILC/RhineLabUI/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'probe', Accept: 'application/vnd.github+json' } });
  const rl = res.headers.get('x-ratelimit-remaining');
  if (res.status !== 200) {
    return { p, status: res.status, rl, err: (await res.text()).slice(0, 200) };
  }
  const j = await res.json();
  const dst = ROOT + '/' + p;
  mkdirSync(dirname(dst), { recursive: true });
  if (j.content && j.encoding === 'base64') {
    const buf = Buffer.from(j.content, 'base64');
    writeFileSync(dst, buf);
    return { p, status: 200, rl, size: j.size, bytes: buf.length, sha: j.sha, rl2: rl };
  }
  if (j.download_url) {
    const r2 = await fetch(j.download_url, { headers: { 'User-Agent': 'probe' } });
    const ab = Buffer.from(await r2.arrayBuffer());
    writeFileSync(dst, ab);
    return { p, status: 200, rl, size: j.size, bytes: ab.length, sha: j.sha, viaRaw: r2.status, rl2: r2.headers.get('x-ratelimit-remaining') };
  }
  return { p, status: 200, rl, err: 'no content/download_url' };
}

for (const p of paths) {
  const r = await getOne(p);
  console.log(JSON.stringify(r));
}
