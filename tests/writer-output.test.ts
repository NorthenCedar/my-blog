import { expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsClosure } from './_writer-output';
it('写作台静态外壳无私密内容、不索引，独立脚本不进入访客页闭包',()=>{
  const path=join('dist','write','index.html'),html=readFileSync(path,'utf8'),sitemap=readFileSync('dist/sitemap-0.xml','utf8');
  expect(html).toContain('name="robots"');expect(html).toContain('noindex');expect(sitemap).not.toContain('/write/');
  expect(html).not.toMatch(/未发布私密哨兵|WRITER_GITHUB_TOKEN|WRITER_RUNNER_SECRET/);
  const writer=jsClosure(path),home=jsClosure('dist/index.html');
  expect(writer.code).toContain('/api/writer');expect(writer.files.length).toBeGreaterThan(0);
  expect(home.files.some(f=>writer.files.includes(f)&&readFileSync(f,'utf8').includes('/api/writer'))).toBe(false);
  expect(home.code).not.toContain('northcedar-writer-recovery');expect(home.code).not.toContain('maxAliasCount');
  expect(writer.code).not.toContain('maxAliasCount');expect(writer.code).not.toContain('WebGPURenderer');
  expect(html).not.toContain('cr-disc');
});
