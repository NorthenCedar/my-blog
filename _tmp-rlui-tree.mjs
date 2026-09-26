// Probe: fetch upstream LBEILC/RhineLabUI full git tree + write JSON + TSV listing
import { writeFileSync } from 'node:fs';

const OUT_JSON = '<博客仓库>/_tmp-rlui-tree.json';
const OUT_TSV = '<博客仓库>/_tmp-rlui-tree.txt';

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'node-fetch-probe',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = { _parseError: String(e), _raw: text.slice(0, 500) }; }
  return { status: res.status, headers: Object.fromEntries(res.headers), json };
}

const r = await getJson('https://api.github.com/repos/LBEILC/RhineLabUI/git/trees/HEAD?recursive=1');
console.log('HTTP', r.status);
console.log('ratelimit-remaining', r.headers['x-ratelimit-remaining']);
console.log('ratelimit-limit', r.headers['x-ratelimit-limit']);

if (!r.json || !r.json.tree) {
  console.log('NO TREE. keys=', r.json && Object.keys(r.json));
  console.log(JSON.stringify(r.json).slice(0, 1200));
  process.exit(1);
}

writeFileSync(OUT_JSON, JSON.stringify(r.json), 'utf8');
const tree = r.json.tree;
console.log('truncated=', r.json.truncated, 'entries=', tree.length);

const blobs = tree.filter(t => t.type === 'blob');
const trees = tree.filter(t => t.type === 'tree');
const totalBytes = blobs.reduce((a, b) => a + (b.size || 0), 0);
console.log('blobs=', blobs.length, 'trees=', trees.length, 'totalBlobBytes=', totalBytes);

const lines = blobs
  .slice()
  .sort((a, b) => (b.size || 0) - (a.size || 0))
  .map(b => `${String(b.size).padStart(9)}\t${b.path}`);
writeFileSync(OUT_TSV, `# LBEILC/RhineLabUI @ ${r.json.sha}\n# blobs=${blobs.length} totalBytes=${totalBytes}\n` + lines.join('\n') + '\n', 'utf8');
console.log('wrote', OUT_TSV);
