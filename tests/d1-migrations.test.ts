import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { migrateDatabase } from '../scripts/migrate-d1.mjs';

const migrationDirectory = new URL('../migrations/', import.meta.url);
const migrations = new Map(readdirSync(migrationDirectory)
  .filter(name => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map(name => [name, readFileSync(new URL(name, migrationDirectory), 'utf8')]));

function atomic(db: DatabaseSync, operation: () => void) {
  db.exec('BEGIN');
  try {
    operation();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function runManually(db: DatabaseSync, versions: number[]) {
  for (const [name, sql] of migrations) {
    if (versions.includes(Number(name.slice(0, 4)))) atomic(db, () => db.exec(sql));
  }
}

function appliedMigrations(db: DatabaseSync) {
  return db.prepare('SELECT name FROM d1_migrations ORDER BY name').all().map(row => row.name);
}

// 模拟 Wrangler 逐文件执行并在同一事务记账，业务表和触发器使用仓库的真实 SQL。
function run(db: DatabaseSync, files = migrations) {
  migrateDatabase({
    query: (sql: string) => db.prepare(sql).all(),
    execute: (sql: string) => atomic(db, () => db.exec(sql)),
    apply() {
      db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`);
      const applied = new Set(appliedMigrations(db));
      for (const [name, sql] of files) {
        if (applied.has(name)) continue;
        atomic(db, () => {
          db.exec(sql);
          db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
        });
      }
    },
  });
}

function seedAccount(db: DatabaseSync) {
  db.exec(`INSERT INTO visitor_accounts (id, username, nickname, password_hash, recovery_hash, created_at)
    VALUES ('owner','local-owner','本地账户','fake-password','fake-recovery','2026-11-01');
    INSERT INTO visitor_sessions VALUES ('test-token','owner',0,987654321);
  `);
}

function seedReaderData(db: DatabaseSync) {
  seedAccount(db);
  db.exec(`INSERT INTO comments VALUES (41,'old-page','读者','旧评论','2026-11-01','comment-hash');
    INSERT INTO replies VALUES (52,'old-page',41,'','来访者','旧回复','2026-11-02','reply-hash');
    INSERT INTO comment_authors VALUES ('comment',41,'owner');
    INSERT INTO reply_targets VALUES (52,'comment',41);
    INSERT INTO likes VALUES ('talk-old',3);
    INSERT INTO like_votes VALUES ('talk-old','like-hash');
    INSERT INTO pageviews VALUES (200,'2026-11-02','old-visitor','2026-11-02T09:40:00.000Z');
    INSERT INTO pageviews VALUES (201,'2026-11-03','old-visitor','2026-11-03T09:40:00.000Z');
    INSERT INTO reply_notices VALUES (11,'owner','old-page',41,52,'来访者',NULL,'旧回复','2026-11-02',123);
    INSERT INTO reply_notices VALUES (91,'owner','old-page',41,53,'来访者',NULL,'已删除','2026-11-02',NULL);
    DELETE FROM reply_notices WHERE id=91;
    INSERT INTO writer_audio VALUES ('owner','clip','wav',X'005249464680FF',7,123);
  `);
}

function seedDraft(db: DatabaseSync, kind: string) {
  db.exec("INSERT INTO writer_usage (owner) VALUES ('owner')");
  db.prepare(`INSERT INTO writer_drafts
    (id,owner,kind,target_key,revision,base_json,value_json,payload_bytes,published_revision,created_at,updated_at)
    VALUES ('draft','owner',?,'existing',5,'{}','{}',4,2,123,456)`).run(kind);
  db.exec(`INSERT INTO writer_assets (owner,sha256,width,height,bytes,size,created_at)
    VALUES ('owner','asset',2,3,X'007fff',3,123);
    INSERT INTO writer_draft_assets (draft_id,owner,sha256,position) VALUES ('draft','owner','asset',7);
  `);
}

const readerTables = ['comments', 'replies', 'comment_authors', 'reply_targets', 'likes', 'like_votes',
  'pageviews', 'visitor_accounts', 'visitor_sessions', 'reply_notices', 'writer_audio'];

function snapshot(db: DatabaseSync, tables: string[]) {
  return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

function expectMigrationComplete(db: DatabaseSync) {
  expect(appliedMigrations(db)).toEqual([...migrations.keys()]);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  const changes = db.prepare('SELECT total_changes() AS count').get();
  run(db);
  expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(changes);
  expect(appliedMigrations(db)).toEqual([...migrations.keys()]);
}

it('空库按版本建齐写作台、站主提醒和语音表，重跑不重复改库', () => {
  using db = new DatabaseSync(':memory:');

  run(db);

  seedAccount(db);
  seedDraft(db, 'gallery');
  db.exec(`INSERT INTO reply_notices (user_id,slug,parent_id,actor_name,excerpt,created_at)
    VALUES ('owner','new-page',32,'读者','新留言','2026-11-02');
    INSERT INTO writer_audio VALUES ('owner','new-clip','wav',X'00',1,123);`);
  expect(db.prepare('SELECT draft_count, image_bytes, total_bytes FROM writer_usage').get())
    .toEqual({ draft_count: 1, image_bytes: 3, total_bytes: 7 });
  expectMigrationComplete(db);
});

it('接续 0001–0006 和先执行过 0012 的旧初始化，保留评论、账户、提醒、统计和语音', () => {
  using db = new DatabaseSync(':memory:');
  runManually(db, [1, 2, 3, 4, 5, 6, 12]);
  seedReaderData(db);
  const existing = snapshot(db, readerTables);

  run(db);

  expect(snapshot(db, readerTables)).toEqual(existing);
  const row = db.prepare(`INSERT INTO reply_notices (user_id,slug,parent_id,actor_name,excerpt,created_at)
    VALUES ('owner','old-page',41,'读者','新留言','2026-11-02') RETURNING id, reply_id`).get();
  expect(row).toEqual({ id: 92, reply_id: null });
  expectMigrationComplete(db);
});

it.each([
  [[1, 2, 3, 4, 5, 6, 7, 8, 12], 'forge'],
  [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12], 'gallery'],
] as const)('接续手工迁移 %j，保留 %s 草稿、素材、用量和读取状态', (versions, kind) => {
  using db = new DatabaseSync(':memory:');
  runManually(db, [...versions]);
  seedReaderData(db);
  seedDraft(db, kind);
  if (kind === 'gallery') {
    db.exec(`INSERT INTO reply_notices VALUES (12,'owner','old-page',41,NULL,'读者',NULL,'旧留言','2026-11-03',456)`);
  }
  const tables = [...readerTables, 'writer_drafts', 'writer_usage', 'writer_assets', 'writer_draft_assets'];
  const existing = snapshot(db, tables);

  run(db);

  expect(snapshot(db, tables)).toEqual(existing);
  expect(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='reply_notices'").get()).toEqual({ seq: 91 });
  expectMigrationComplete(db);
});

it.each([
  ['CREATE TABLE writer_0008_drafts AS SELECT * FROM writer_drafts', /未完成的迁移暂存表.*writer_0008_drafts/],
  ['DROP TRIGGER writer_job_added', /迁移结构不完整.*writer_job_added/],
  ['DROP INDEX idx_reply_notices_comment', /无法识别旧库的提醒表结构/],
] as const)('遇到历史表重建残留或结构不完整时停止（%s）', (sql, message) => {
  using db = new DatabaseSync(':memory:');
  runManually(db, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  seedReaderData(db);
  seedDraft(db, 'gallery');
  db.exec(sql);
  const schemaVersion = db.prepare('PRAGMA schema_version').get();
  const existing = snapshot(db, [...readerTables, 'writer_drafts', 'writer_assets', 'writer_usage']);

  expect(() => run(db)).toThrow(message);

  expect(db.prepare('PRAGMA schema_version').get()).toEqual(schemaVersion);
  expect(snapshot(db, [...readerTables, 'writer_drafts', 'writer_assets', 'writer_usage'])).toEqual(existing);
});

it('后续迁移失败时回滚该文件，修复后从失败处接续', () => {
  using db = new DatabaseSync(':memory:');
  const first = '9000_create_first.sql';
  const second = '9001_create_second.sql';
  const files = new Map([...migrations,
    [first, 'CREATE TABLE first_probe (value TEXT); INSERT INTO first_probe VALUES (\'kept\');'],
    [second, 'CREATE TABLE second_probe (value TEXT); INSERT INTO missing_table VALUES (\'fail\');'],
  ]);

  expect(() => run(db, files)).toThrow(/no such table: missing_table/);
  expect(appliedMigrations(db)).toEqual([...migrations.keys(), first]);
  expect(db.prepare('SELECT value FROM first_probe').all()).toEqual([{ value: 'kept' }]);
  expect(db.prepare("SELECT name FROM sqlite_schema WHERE name='second_probe'").get()).toBeUndefined();

  files.set(second, "CREATE TABLE second_probe (value TEXT); INSERT INTO second_probe VALUES ('retried');");
  run(db, files);

  expect(appliedMigrations(db)).toEqual([...files.keys()]);
  expect(db.prepare('SELECT value FROM first_probe').all()).toEqual([{ value: 'kept' }]);
  expect(db.prepare('SELECT value FROM second_probe').all()).toEqual([{ value: 'retried' }]);
});
