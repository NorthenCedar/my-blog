import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// 只接受经过核验的官方 4.3.0 源码；升级上游时必须重新审查，不能悄悄覆盖新版本。
const ORIGINAL_SHA256 = 'ede1cc404a492fa348eb9d97a3007a0d72aa717bd22cd86a56bd0824c19729ca';
const require = createRequire(new URL('../package.json', import.meta.url));
const astroRequire = createRequire(require.resolve('astro/package.json'));
const installedPath = astroRequire.resolve('http-cache-semantics');
const manifest = JSON.parse(readFileSync(join(dirname(installedPath), 'package.json'), 'utf8'));
if (manifest.name !== 'http-cache-semantics' || manifest.version !== '4.3.0') {
  throw new Error('缓存包版本与已审查的官方 4.3.0 不符，停止应用补丁');
}

const reviewed = readFileSync(new URL('../vendor/http-cache-semantics/index.js', import.meta.url));
const installed = readFileSync(installedPath);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Git 在 Windows 上可能转换换行；行为与字符都须相同，换行差异不影响幂等性。
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const wanted = normalize(reviewed);
const current = normalize(installed);
if (sha256(current) === sha256(wanted)) {
  console.log('HTTP 缓存补丁已核验');
} else {
  if (sha256(current) !== ORIGINAL_SHA256) {
    throw new Error('缓存包源码 SHA256 不符，停止应用补丁');
  }
  writeFileSync(installedPath, wanted);
  if (sha256(normalize(readFileSync(installedPath))) !== sha256(wanted)) {
    throw new Error('缓存补丁写后校验失败');
  }
  console.log('HTTP 缓存补丁已应用并核验');
}
