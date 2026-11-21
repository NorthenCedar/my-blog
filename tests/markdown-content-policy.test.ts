import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, expect, it } from 'vitest';
import config from '../astro.config.mjs';

const options = { fileURL: pathToFileURL(resolve('markdown-policy-fixture.md')) };
let renderer: Awaited<ReturnType<typeof config.markdown.processor.createRenderer>>;

beforeAll(async () => {
  renderer = await config.markdown.processor.createRenderer(config.markdown);
});

it('保留作者视频、折叠说明、删除线、表格、语音和任务列表', async () => {
  const audio = `/audio/${'a'.repeat(64)}.mp3`;
  const result = await renderer.render(`## 标题

<details><summary>展开</summary><video controls playsinline preload="none"><source src="/videos/demo.mp4" type="video/mp4"></video></details>

<del>旧正文</del>

| 左 | 右 |
| :-- | --: |
| 甲 | 乙 |

!audio[声音](${audio})

- [x] 完成

<a href="/archive/" target="_blank">归档</a>

~~~
<custom-note>这是代码示例</custom-note>
~~~`, options);

  expect(result.code).toContain('<details><summary>展开</summary><video controls playsinline preload="none">');
  expect(result.code).toContain('<source src="/videos/demo.mp4" type="video/mp4">');
  expect(result.code).toContain('<del>旧正文</del>');
  expect(result.code).toContain('<table>');
  expect(result.code).toMatch(/<th[^>]*text-align:\s*right/);
  expect(result.code).toContain(`<audio controls preload="metadata" src="${audio}"`);
  expect(result.code).toContain('<input type="checkbox" checked disabled>');
  expect(result.code).toContain('target="_blank" rel="noopener"');
  expect(result.code).toContain('&lt;custom-note&gt;');
  expect(result.metadata.headings).toEqual([{ depth: 2, slug: '标题', text: '标题' }]);
});

it.each([
  ['<custom-note>普通说明</custom-note>', /不支持 <custom-note>/],
  ['<aside data-note="普通说明">正文</aside>', /dataNote 属性/],
  ['<a href="urn:isbn:9780131103627">书目</a>', /href 属性/],
])('白名单之外的正文记法在发布构建前报告规则与文件', async (body, reason) => {
  const build = renderer.render(body, options);
  await expect(build).rejects.toThrow('markdown-policy-fixture.md');
  await expect(build).rejects.toThrow(reason);
});
