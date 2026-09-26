// Probe: read local UTF-8 files reliably (PowerShell Get-Content mangled CJK)
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2);
for (const f of files) {
  const buf = readFileSync(f);
  const txt = buf.toString('utf8');
  const lines = txt.split(/\r?\n/);
  console.log(`===== ${f} (bytes=${buf.length}, lines=${lines.length}) =====`);
  const limit = Number(process.env.HEAD || 0);
  console.log((limit ? lines.slice(0, limit) : lines).join('\n'));
  console.log('');
}
