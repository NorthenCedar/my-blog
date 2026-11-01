import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';

const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));

function legacyDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0001_comments.sql', '0002_likes_and_visits.sql', '0003_replies.sql', '0004_visitor_accounts.sql', '0005_reply_targets.sql', '0006_reply_notices.sql', '0007_cloud_writer.sql', '0008_writer_forge.sql']) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  sqlite.exec(`INSERT INTO visitor_accounts(id,username,nickname,password_hash,recovery_hash,created_at)
    VALUES('owner','writer','站主','password','recovery','2026-10-23');
    INSERT INTO writer_usage(owner) VALUES('owner');`);
  return sqlite;
}

function insertDraft(sqlite: DatabaseSync, id: string, kind: string, owner = 'owner') {
  const base = '{"original":"原始字节\\n","unknown":{"n":1}}';
  const value = '{"fields":{"title":"草稿"},"body":"正文\\n","assets":[]}';
  sqlite.prepare(`INSERT INTO writer_drafts(id,owner,kind,target_key,revision,base_json,value_json,payload_bytes,published_revision,created_at,updated_at)
    VALUES(?,?,?,?,9,?,?,?,4,1720000000000,1730000000000)`)
    .run(id, owner, kind, kind === 'forge' ? 'forge' : id, base, value, Buffer.byteLength(base) + Buffer.byteLength(value));
}

function migrate(sqlite: DatabaseSync) {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec(readFileSync('migrations/0009_writer_gallery.sql', 'utf8'));
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/** 比较原始字段（包括 BLOB、JSON 空白和 NULL），并覆盖所有业务表及索引/触发器。 */
function snapshot(sqlite: DatabaseSync) {
  const schema = sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all()
    .map(row => ({ ...row, sql: typeof row.sql === 'string' ? row.sql.replace(/\s+/g, ' ').trim() : row.sql }));
  const data = Object.fromEntries(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({ name }) => [
    String(name), sqlite.prepare(`SELECT * FROM "${String(name).replaceAll('"', '""')}"`).all()
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]));
  return { schema, data };
}

const states = ['queued', 'dispatch_unknown', 'validating', 'ready', 'pushed', 'deployed', 'conflict', 'failed', 'cancelled', 'deployment_failed'];

function insertJob(sqlite: DatabaseSync, id: string, owner: string, draft: string, state: string, n: number) {
  const json = JSON.stringify({ revision: 9, value: { body: `不可变快照 ${n}\n`, unknown: [null, { original: true }] }, base: { sha: `base-${n}` } }, null, 2);
  sqlite.prepare(`INSERT INTO writer_jobs(id,owner,draft_id,revision,request_id,snapshot_json,payload_bytes,reserve_bytes,state,
    owner_auth_version,owner_session_hash,lease_hash,lease_expires,run_id,commit_sha,code,version,created_at,updated_at)
    VALUES(?,?,?,9,?,?,?,?,?,7,?,?,?,?,?,?,13,1720000000001,1730000000002)`)
    .run(id, owner, draft, `request-${id}`, json, Buffer.byteLength(json), n % 2 ? 262144 : 0, state,
      `session-${n}`, n % 2 ? `lease-${n}` : null, n % 2 ? 1740000000000 + n : null,
      n % 3 ? `run-${n}` : null, n % 2 ? 'a'.repeat(40) : null, n % 2 ? `code-${n}` : null);
}

function populatedLegacyDatabase() {
  const sqlite = legacyDatabase();
  for (const [n, state] of states.entries()) {
    const owner = n ? `owner-${n}` : 'owner';
    if (n) {
      sqlite.prepare(`INSERT INTO visitor_accounts(id,username,nickname,password_hash,recovery_hash,created_at)
        VALUES(?,?,?,?,?,'2026-10-23')`).run(owner, `writer-${n}`, `站主 ${n}`, `password-${n}`, `recovery-${n}`);
      sqlite.prepare('INSERT INTO writer_usage(owner) VALUES(?)').run(owner);
    }
    sqlite.prepare("UPDATE visitor_accounts SET bio=?,avatar='custom',avatar_blob=?,avatar_version=?,auth_version=7 WHERE id=?")
      .run(`简介 ${n}`, new Uint8Array([0, 255, n, 1]), `avatar-${n}`, owner);
    sqlite.prepare('INSERT INTO visitor_sessions(token_hash,user_id,auth_version,expires_at) VALUES(?,?,7,1740000000000)')
      .run(`session-${n}`, owner);
    insertDraft(sqlite, `post-${n}`, 'post', owner);
    insertDraft(sqlite, `talk-${n}`, 'talk', owner);
    sqlite.prepare('UPDATE writer_drafts SET revision=?,published_revision=?,created_at=?,updated_at=? WHERE id=?')
      .run(n + 1, n, 1720000000000 + n, 1730000000000 + n, `talk-${n}`);
    if (n % 2) sqlite.prepare("UPDATE writer_drafts SET base_json='null',payload_bytes=4+length(CAST(value_json AS BLOB)) WHERE id=?").run(`talk-${n}`);
    for (const [position, bytes] of [new Uint8Array([0, 255, n, 128]), new Uint8Array([9, 0, 127])].entries()) {
      sqlite.prepare('INSERT INTO writer_assets(owner,sha256,width,height,bytes,size,created_at) VALUES(?,?,1920,1,?,?,?)')
        .run(owner, `sha-${position}`, bytes, bytes.length, 1720000000010 + n);
      sqlite.prepare('INSERT INTO writer_draft_assets(draft_id,owner,sha256,position) VALUES(?,?,?,?)')
        .run(`post-${n}`, owner, `sha-${position}`, position * 3);
    }
    // 一个素材同时被草稿和发布快照引用，关联位置不连续，不能靠重新推导恢复。
    sqlite.prepare("INSERT INTO writer_draft_assets(draft_id,owner,sha256,position) VALUES(?,?,'sha-0',7)").run(`talk-${n}`, owner);
    insertJob(sqlite, `job-${n}`, owner, `post-${n}`, state, n);
    sqlite.prepare("INSERT INTO writer_job_assets(job_id,owner,sha256,position) VALUES(?,?,'sha-1',5)").run(`job-${n}`, owner);
    sqlite.prepare("INSERT INTO writer_job_assets(job_id,owner,sha256,position) VALUES(?,?,'sha-0',0)").run(`job-${n}`, owner);
    sqlite.prepare('INSERT INTO writer_save_receipts(owner,request_id,draft_id,payload_hash,revision,created_at) VALUES(?,?,?,?,?,?)')
      .run(owner, `save-${n}`, `post-${n}`, `payload-${n}`, 9, 1720000000020 + n);
    sqlite.prepare('INSERT INTO writer_requests(id,owner) VALUES(?,?)').run(`pending-${n}`, owner);
  }
  // 第一个账户已经有 100 份草稿；恢复时若重复运行计数触发器，会立刻越额。
  for (let n = 0; n < 98; n++) insertDraft(sqlite, `extra-${n}`, n % 2 ? 'talk' : 'post');
  sqlite.exec(`INSERT INTO comments(id,slug,name,body,created_at,ip_hash) VALUES(41,'post/original','读者','旧评论','2026-10-20','hash-1');
    INSERT INTO replies(id,slug,parent_id,reply_to,name,body,created_at,ip_hash) VALUES(52,'post/original',41,'读者','站主','旧回复','2026-10-21','hash-2');
    INSERT INTO comment_authors(kind,comment_id,user_id) VALUES('comment',41,'owner'),('reply',52,'owner-1');
    INSERT INTO reply_targets(reply_id,target_kind,target_id) VALUES(52,'comment',41);
    INSERT INTO reply_notices(id,user_id,slug,parent_id,reply_id,actor_name,actor_user_id,excerpt,created_at,read_at)
      VALUES(63,'owner','post/original',41,52,'站主','owner-1','旧回复','2026-10-21',1730000000012);
    INSERT INTO visitor_rate_limits(scope,key_hash,window_start,hits) VALUES('login','rate-hash',1730000000000,8);
    INSERT INTO likes(slug,count) VALUES('talk/old',17);
    INSERT INTO like_votes(slug,ip_hash) VALUES('talk/old','vote-hash');
    INSERT INTO pageviews(id,day,vid,created_at) VALUES(74,'2026-10-21','visitor-id','2026-10-21');`);
  return sqlite;
}

/** 仅用于在每条语句之间注入失败；触发器 BEGIN/END 作为一条 SQLite 语句。 */
function migrationStatements() {
  const statements: string[] = [];
  let buffer = '', trigger = false;
  for (const line of readFileSync('migrations/0009_writer_gallery.sql', 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('--')) continue;
    buffer += `${line}\n`;
    if (/^CREATE TRIGGER\b/i.test(line.trim())) trigger = true;
    if (line.trim().endsWith(';') && (!trigger || /^END;$/i.test(line.trim()))) {
      statements.push(buffer);
      buffer = '';
      trigger = false;
    }
  }
  expect(buffer.trim()).toBe('');
  return statements;
}

it('0009 将已执行 0008 的数据库扩展为五种草稿类型', () => {
  const sqlite = legacyDatabase();
  expect(() => insertDraft(sqlite, 'before', 'gallery')).toThrow(/CHECK constraint failed/);
  insertDraft(sqlite, 'old-post', 'post');
  insertDraft(sqlite, 'old-talk', 'talk');
  migrate(sqlite);
  insertDraft(sqlite, 'new-project', 'project');
  insertDraft(sqlite, 'new-gallery', 'gallery');
  insertDraft(sqlite, 'new-forge', 'forge');
  expect(sqlite.prepare('SELECT kind FROM writer_drafts ORDER BY id').all()).toEqual([
    { kind: 'forge' }, { kind: 'gallery' }, { kind: 'project' }, { kind: 'post' }, { kind: 'talk' },
  ]);
  expect(() => insertDraft(sqlite, 'invalid', 'page')).toThrow(/CHECK constraint failed/);
  expect(sqlite.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('完整保留旧草稿、所有任务状态/租约/快照、素材关联、回执、用量及非 writer 数据和结构', () => {
  const sqlite = populatedLegacyDatabase();
  const before = snapshot(sqlite);
  expect(before.data.writer_drafts).toHaveLength(118);
  expect(before.data.writer_jobs).toHaveLength(10);
  expect(sqlite.prepare("SELECT draft_count FROM writer_usage WHERE owner='owner'").get()).toEqual({ draft_count: 100 });
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  migrate(sqlite);
  const after = snapshot(sqlite);
  expect(after.data).toEqual(before.data);
  expect(after.schema).toEqual(before.schema.map(row => row.type === 'table' && row.name === 'writer_drafts'
    ? { ...row, sql: String(row.sql).replace("kind IN ('post','talk','project','forge')", "kind IN ('post','talk','project','forge','gallery')") }
    : row));
  expect(sqlite.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('成功后重复执行仍保留新旧五类草稿、发布任务和原用量，无暂存表残留', () => {
  const sqlite = populatedLegacyDatabase();
  migrate(sqlite);
  insertDraft(sqlite, 'new-project', 'project', 'owner-1');
  insertDraft(sqlite, 'new-forge', 'forge', 'owner-1');
  insertDraft(sqlite, 'new-gallery', 'gallery', 'owner-1');
  insertJob(sqlite, 'project-job', 'owner-1', 'new-project', 'deployed', 11);
  sqlite.exec("INSERT INTO writer_draft_assets(draft_id,owner,sha256,position) VALUES('new-project','owner-1','sha-0',4)");
  sqlite.exec("INSERT INTO writer_job_assets(job_id,owner,sha256,position) VALUES('project-job','owner-1','sha-1',8)");
  const before = snapshot(sqlite);
  migrate(sqlite);
  migrate(sqlite);
  expect(snapshot(sqlite)).toEqual(before);
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('每条迁移语句后外键始终开启且无悬空；任何阶段失败都能原子回滚全部数据及结构', () => {
  const statements = migrationStatements();
  expect(statements.length).toBeGreaterThan(20);
  for (let failAfter = 0; failAfter <= statements.length; failAfter++) {
    const sqlite = populatedLegacyDatabase();
    const before = snapshot(sqlite);
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const sql of statements.slice(0, failAfter)) {
        sqlite.exec(sql);
        expect(sqlite.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
        expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      }
      expect(() => sqlite.exec('SELECT * FROM writer_0009_injected_failure')).toThrow(/no such table/);
    } finally {
      sqlite.exec('ROLLBACK');
    }
    expect(snapshot(sqlite), `第 ${failAfter} 条语句后失败`).toEqual(before);
    expect(sqlite.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  }
});

it('重建后草稿、图片、任务及预留额度的增改删触发器继续精确记账', () => {
  const sqlite = legacyDatabase();
  insertDraft(sqlite, 'original', 'post');
  migrate(sqlite);
  const initial = sqlite.prepare('SELECT * FROM writer_usage').get()!;
  insertDraft(sqlite, 'project', 'project');
  const payloadBytes = Number(sqlite.prepare("SELECT payload_bytes FROM writer_drafts WHERE id='project'").get()!.payload_bytes);
  expect(sqlite.prepare('SELECT * FROM writer_usage').get()).toEqual({
    ...initial, draft_count: 2, total_bytes: Number(initial.total_bytes) + payloadBytes,
  });
  sqlite.exec("UPDATE writer_drafts SET value_json=value_json||' ',payload_bytes=payload_bytes+1 WHERE id='project'");
  sqlite.exec("INSERT INTO writer_assets(owner,sha256,width,height,bytes,size,created_at) VALUES('owner','picture',1,1,X'00ff80',3,17)");
  insertJob(sqlite, 'job', 'owner', 'project', 'queued', 1);
  const jobBytes = Number(sqlite.prepare("SELECT payload_bytes FROM writer_jobs WHERE id='job'").get()!.payload_bytes);
  expect(sqlite.prepare('SELECT * FROM writer_usage').get()).toEqual({
    ...initial, draft_count: 2, image_bytes: 3, total_bytes: Number(initial.total_bytes) + payloadBytes + 1 + 3 + jobBytes + 262144,
  });
  sqlite.exec("UPDATE writer_jobs SET reserve_bytes=19 WHERE id='job'");
  expect(sqlite.prepare('SELECT total_bytes FROM writer_usage').get()).toEqual({ total_bytes: Number(initial.total_bytes) + payloadBytes + 1 + 3 + jobBytes + 19 });
  sqlite.exec("INSERT INTO writer_draft_assets(draft_id,owner,sha256,position) VALUES('project','owner','picture',0)");
  sqlite.exec("INSERT INTO writer_job_assets(job_id,owner,sha256,position) VALUES('job','owner','picture',0)");
  sqlite.exec("INSERT INTO writer_save_receipts(owner,request_id,draft_id,payload_hash,revision,created_at) VALUES('owner','save','project','hash',9,17)");
  // 草稿删除仍级联删除任务、两种图片关联及保存回执，任务预留也一起释放。
  sqlite.exec("DELETE FROM writer_drafts WHERE id='project'");
  for (const table of ['writer_jobs', 'writer_draft_assets', 'writer_job_assets', 'writer_save_receipts']) {
    expect(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  }
  expect(sqlite.prepare('SELECT * FROM writer_usage').get()).toEqual({ ...initial, image_bytes: 3, total_bytes: Number(initial.total_bytes) + 3 });
  sqlite.exec("DELETE FROM writer_assets WHERE sha256='picture'");
  expect(sqlite.prepare('SELECT * FROM writer_usage').get()).toEqual(initial);
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('保留原有额度、JSON、字节数、版本、任务状态/唯一索引和外键限制', () => {
  const sqlite = populatedLegacyDatabase();
  migrate(sqlite);
  const before = snapshot(sqlite);
  expect(() => insertDraft(sqlite, 'over-count', 'project')).toThrow(/writer_count_quota/);
  expect(() => sqlite.exec("UPDATE writer_drafts SET revision=0 WHERE id='post-1'")).toThrow(/CHECK constraint/);
  expect(() => sqlite.exec("UPDATE writer_drafts SET base_json='invalid' WHERE id='post-1'")).toThrow(/CHECK constraint/);
  expect(() => sqlite.exec("UPDATE writer_drafts SET value_json='invalid' WHERE id='post-1'")).toThrow(/CHECK constraint/);
  expect(() => sqlite.exec("UPDATE writer_drafts SET payload_bytes=0 WHERE id='post-1'")).toThrow(/CHECK constraint/);
  expect(() => sqlite.exec("UPDATE writer_jobs SET state='other' WHERE id='job-1'")).toThrow(/CHECK constraint/);
  expect(() => sqlite.exec("UPDATE writer_jobs SET reserve_bytes=262145 WHERE id='job-1'")).toThrow(/CHECK constraint/);
  expect(() => insertJob(sqlite, 'second-active', 'owner-1', 'post-1', 'queued', 12)).toThrow(/UNIQUE constraint/);
  expect(() => insertDraft(sqlite, 'no-owner', 'forge', 'missing')).toThrow(/FOREIGN KEY constraint/);
  expect(() => sqlite.exec("INSERT INTO writer_draft_assets(draft_id,owner,sha256,position) VALUES('missing','owner','sha-0',17)")).toThrow(/FOREIGN KEY constraint/);
  expect(() => sqlite.exec("INSERT INTO writer_job_assets(job_id,owner,sha256,position) VALUES('job-0','owner','missing',17)")).toThrow(/FOREIGN KEY constraint/);
  expect(() => sqlite.exec("INSERT INTO writer_save_receipts(owner,request_id,draft_id,payload_hash,revision,created_at) VALUES('owner','missing','missing','hash',1,1)")).toThrow(/FOREIGN KEY constraint/);
  expect(snapshot(sqlite)).toEqual(before);
  for (const [field, limit, operation] of [
    ['total_bytes', 100663296, () => insertDraft(sqlite, 'over-total', 'forge', 'owner-1')],
    ['image_bytes', 67108864, () => sqlite.exec("INSERT INTO writer_assets(owner,sha256,width,height,bytes,size,created_at) VALUES('owner-1','over-image',1,1,X'00',1,1)")],
  ] as const) {
    sqlite.exec('SAVEPOINT quota_boundary');
    sqlite.exec(`UPDATE writer_usage SET ${field}=${limit} WHERE owner='owner-1'`);
    expect(operation).toThrow(/writer_(total|image)_quota/);
    sqlite.exec('ROLLBACK TO quota_boundary; RELEASE quota_boundary');
    expect(snapshot(sqlite)).toEqual(before);
  }
});
