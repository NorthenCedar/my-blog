import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readLanguageStats } from '../src/lib/lang-stats';

describe('源码语言统计使用实际文件字节并排除非项目源码', () => {
  let root: string;
  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'northcedar-language-')));
    const files: Record<string, string> = {
      'src/Page.astro': '界', 'src/client.ts': '12345', 'src/base.css': '12',
      'src/data.json': '{}', 'content/pages/about.md': '正文',
      'functions/api/example.ts': 'ab', 'tests/example.test.ts': 'x',
      'scripts/example.js': '1234', 'scripts/example.mjs': '123',
      'scripts/check.py': 'pass', 'migrations/0001.sql': 'select 1;',
      'src/vendor/other.js': '第三方'.repeat(100), 'node_modules/other.js': '依赖'.repeat(100),
      'dist/other.js': '构建副本'.repeat(100), 'scripts/__pycache__/check.py': '缓存'.repeat(100),
      'scripts/_tmp-probe.js': '探针'.repeat(100), 'src/_tmp-fixture/file.ts': '临时夹具'.repeat(100),
      'functions/api/_generated/comment-targets.json': '构建生成物'.repeat(100),
      'src/photo.png': '不是代码'.repeat(100),
    };
    for (const [file, value] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), value);
    }
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => {
    // 只删除本测试创建且未被替换的独立临时目录。
    if (realpathSync(root) !== root) throw new Error('临时统计目录已变化');
    rmSync(root, { recursive: true, force: true });
  });

  it('统计中文 UTF-8、多目录同类文件、Python 与 SQL，不计临时或第三方副本', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const rows = readLanguageStats();
    expect(Object.fromEntries(rows.map(row => [row.name, row.bytes]))).toEqual({
      Astro: 3, TypeScript: 8, CSS: 2, Markdown: 6, JavaScript: 7, JSON: 2, Python: 4, SQL: 9,
    });
    expect(rows.reduce((sum, row) => sum + row.bytes, 0)).toBe(41);
    expect(rows[0]).toEqual({ name: 'SQL', bytes: 9, pct: 22 });
  });

  it('只改源码也会在下次读取时更新数字，不保留旧快照', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const file = join(root, 'src/client.ts');
    try {
      const before = readLanguageStats().find(row => row.name === 'TypeScript')!.bytes;
      writeFileSync(file, '1234567890');
      expect(readLanguageStats().find(row => row.name === 'TypeScript')!.bytes).toBe(before + 5);
    } finally { writeFileSync(file, '12345'); }
  });
});

describe.skipIf(!existsSync('dist/about/index.html'))('首页和关于页展示同一次构建的统计', () => {
  it('语言、字节数、比例和总量一致，避免关于页继续显示手填旧值', () => {
    const home = readFileSync('dist/index.html', 'utf8');
    const about = readFileSync('dist/about/index.html', 'utf8');
    const detail = home.match(/<dl\b[^>]*class="langbar-detail"[^>]*>([\s\S]*?)<\/dl>/)![1];
    const homeRows = [...detail.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>\s*<dd[^>]*>([^<]+)<\/dd>/g)]
      .map(([, name, bytes, pct]) => ({ name, bytes, pct }));
    const aboutRows = [...about.matchAll(/<li\b[^>]*class="lang-row"[^>]*>([\s\S]*?)<\/li>/g)].map(([, html]) => ({
      name: html.match(/class="lang-name"[^>]*>([^<]+)</)![1],
      bytes: html.match(/class="lang-bytes"[^>]*>([^<]+)</)![1],
      pct: html.match(/class="lang-pct"[^>]*>([^<]+)</)![1],
    }));
    expect(homeRows.length).toBeGreaterThan(0);
    expect(aboutRows).toEqual(homeRows);
    const total = homeRows.reduce((sum, row) => sum + Number(row.bytes.replace(/[^\d]/g, '')), 0);
    expect(about.match(/class="lang-total"[^>]*>[\s\S]*?<b[^>]*>([^<]+)</)![1]).toBe(`${total.toLocaleString('en-US')} B`);
  });
});
