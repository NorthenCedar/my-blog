// Probe: fetch one Contents API dir (rate-limit behaviour + large-file handling)
const url = 'https://api.github.com/repos/LBEILC/RhineLabUI/contents/src/boot-lettering-art.json';
const res = await fetch(url, { headers: { 'User-Agent': 'probe', Accept: 'application/vnd.github+json' } });
console.log('HTTP', res.status);
console.log('ratelimit-remaining', res.headers.get('x-ratelimit-remaining'));
const j = await res.json();
console.log('keys=', Object.keys(j));
console.log('size=', j.size, 'encoding=', j.encoding, 'contentLen=', j.content ? j.content.length : null);
console.log('download_url=', j.download_url);
console.log('sha=', j.sha);
if (j.content) {
  const buf = Buffer.from(j.content, 'base64');
  console.log('decodedBytes=', buf.length);
  console.log('head=', buf.slice(0, 400).toString('utf8'));
}
