import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const forge = '0008_writer_forge.sql';
const gallery = '0009_writer_gallery.sql';
const ownerNotices = '0010_owner_notices.sql';

const writerVersions = new Map([
  ["'post','talk'", []],
  ["'post','talk','project','forge'", [forge]],
  ["'post','talk','project','forge','gallery'", [forge, gallery]],
]);

const writerObjects = {
  table: ['writer_draft_assets', 'writer_jobs', 'writer_job_assets', 'writer_save_receipts',
    'writer_usage', 'writer_assets', 'writer_requests'],
  index: ['writer_drafts_owner', 'writer_draft_asset_lookup', 'writer_one_active_job',
    'writer_jobs_draft', 'writer_job_asset_lookup', 'writer_receipts_draft'],
  trigger: ['writer_draft_added', 'writer_draft_changed', 'writer_draft_removed', 'writer_asset_added',
    'writer_asset_removed', 'writer_job_added', 'writer_job_reserve_changed', 'writer_job_removed'],
};

const noticeObjects = {
  index: ['idx_reply_notices_user_created', 'idx_reply_notices_unread'],
  trigger: ['reply_notices_reply_deleted', 'reply_notices_thread_deleted'],
};

function requireObjects(schema, objects) {
  for (const [type, names] of Object.entries(objects)) {
    const missing = names.filter(name => schema.get(name)?.type !== type);
    if (missing.length) throw new Error(`旧库的迁移结构不完整（缺少或类型不匹配的对象为 ${missing.join('、')}）`);
  }
}

function legacyWriterMigrations(schema, applied) {
  const drafts = schema.get('writer_drafts');
  if (!drafts || (applied.has(forge) && applied.has(gallery))) return [];

  // 0008 和 0009 改了同一张表的类型约束。已有相册草稿时重放 0008 会违反约束。
  const check = drafts.sql?.match(/\bCHECK\s*\(\s*kind\s+IN\s*\(([^)]*)\)\s*\)/i);
  const kinds = check?.[1].replace(/\s/g, '');
  const completed = writerVersions.get(kinds);
  if (drafts.type !== 'table' || !completed) throw new Error('无法识别旧库的草稿类型约束');
  if (completed.length) requireObjects(schema, writerObjects);
  return completed;
}

function legacyNoticeMigrations(schema, applied) {
  const notices = schema.get('reply_notices');
  if (!notices || applied.has(ownerNotices)) return [];

  const reply = notices.sql?.match(/\breply_id\s+INTEGER\s*(NOT\s+NULL)?\s*,/i);
  const index = schema.get('idx_reply_notices_comment');
  if (notices.type === 'table' && reply) {
    if (reply[1] && !index) return [];
    if (!reply[1] && index?.type === 'index' && index.tbl_name === 'reply_notices' &&
        /\bCREATE\s+UNIQUE\b.*\(\s*user_id\s*,\s*parent_id\s*\)\s+WHERE\s+reply_id\s+IS\s+NULL\s*$/is.test(index.sql ?? '')) {
      requireObjects(schema, noticeObjects);
      return [ownerNotices];
    }
  }
  throw new Error('无法识别旧库的提醒表结构和站主提醒索引');
}

export function migrateDatabase({ query, execute, apply }) {
  const schema = new Map(query(`SELECT name, type, tbl_name, sql FROM sqlite_schema
    WHERE name GLOB 'writer_*' OR name GLOB 'reply_notices*' OR name GLOB 'idx_reply_notices_*'
      OR name IN ('owner_notices_0010_sequence', 'd1_migrations')`).map(row => [row.name, row]));
  const remnants = [...schema.keys()].filter(name => /^(writer_000[89]_|reply_notices_0010$|owner_notices_0010_sequence$)/.test(name));
  if (remnants.length) throw new Error(`旧库有未完成的迁移暂存表（${remnants.join('、')}）。请核对历史备份和库结构后再重试。`);

  const applied = new Set(schema.has('d1_migrations') ? query('SELECT name FROM d1_migrations').map(row => row.name) : []);
  const legacy = [...legacyWriterMigrations(schema, applied), ...legacyNoticeMigrations(schema, applied)]
    .filter(name => !applied.has(name));
  if (legacy.length) {
    // 按 Wrangler 的默认记账结构补记已完成的表重建。其余历史 SQL 都可安全重放。
    execute(`CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    INSERT INTO d1_migrations (name) VALUES ${legacy.map(name => `('${name}')`).join(', ')}
    ON CONFLICT(name) DO NOTHING;`);
  }
  apply(legacy);
}

function main() {
  const { values: { local, remote, 'persist-to': persistTo } } = parseArgs({ options: {
    local: { type: 'boolean' }, remote: { type: 'boolean' }, 'persist-to': { type: 'string' },
  } });
  if (Boolean(local) === Boolean(remote) || (persistTo !== undefined && (!local || !persistTo))) {
    throw new Error('请选择 --local 或 --remote。只有 --local 可以带 --persist-to <目录>。');
  }

  const require = createRequire(import.meta.url);
  const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const target = ['beishan-comments', local ? '--local' : '--remote', '--config', join(root, 'wrangler.toml')];
  if (persistTo) target.push('--persist-to', resolve(persistTo));

  function runWrangler(action, options, capture = false) {
    const result = spawnSync(process.execPath, [wrangler, 'd1', ...action, ...target, ...options], {
      cwd: root, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      if (result.stdout) process.stderr.write(result.stdout);
      throw new Error(`Wrangler ${action.join(' ')} 执行失败${result.signal ? `（${result.signal}）` : ''}`);
    }
    return result.stdout;
  }

  function execute(sql) {
    const results = JSON.parse(runWrangler(['execute'], ['--command', sql, '--json'], true));
    if (!Array.isArray(results) || !results.length || results.some(result => !result.success)) {
      throw new Error('Wrangler 未返回成功的 D1 查询结果');
    }
    return results[0].results;
  }

  migrateDatabase({ query: execute, execute, apply(legacy) {
    if (legacy.length) console.log(`已补记手工完成的迁移（${legacy.join('、')}）`);
    runWrangler(['migrations', 'apply'], []);
  } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error('D1 迁移停止。', error.message);
    process.exitCode = 1;
  }
}
