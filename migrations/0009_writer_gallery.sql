-- 0008 已上线：仅扩展 writer_drafts.kind，其余表定义、约束和数据保持原样。
-- 必须将本文件整体交给一个原子 D1 batch / Wrangler --remote --file 导入执行；
-- 不可按阶段提交。D1 负责事务，本文件不包含显式 BEGIN/COMMIT。
-- 不关闭或延迟外键。先保留并移除子表，再重建父表，避免 DROP 父表级联删数据。
-- 暂存表无外键；不使用 IF NOT EXISTS，意外的残留表会在修改业务表前报错。
-- 成功后暂存表全部删除，因此再次执行仍会完整保留五种类型及所有关联。

CREATE TABLE writer_0009_drafts AS SELECT * FROM writer_drafts;
CREATE TABLE writer_0009_draft_assets AS SELECT * FROM writer_draft_assets;
CREATE TABLE writer_0009_jobs AS SELECT * FROM writer_jobs;
CREATE TABLE writer_0009_job_assets AS SELECT * FROM writer_job_assets;
CREATE TABLE writer_0009_save_receipts AS SELECT * FROM writer_save_receipts;

-- 恢复原记录时不重新累计用量；writer_usage、writer_assets、writer_requests 始终不动。
DROP TRIGGER writer_draft_added;
DROP TRIGGER writer_draft_changed;
DROP TRIGGER writer_draft_removed;
DROP TRIGGER writer_job_added;
DROP TRIGGER writer_job_reserve_changed;
DROP TRIGGER writer_job_removed;

DROP TABLE writer_job_assets;
DROP TABLE writer_save_receipts;
DROP TABLE writer_draft_assets;
DROP TABLE writer_jobs;
DROP TABLE writer_drafts;

CREATE TABLE IF NOT EXISTS writer_drafts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('post','talk','project','forge','gallery')),
  target_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  base_json TEXT NOT NULL CHECK(json_valid(base_json)),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes = length(CAST(base_json AS BLOB)) + length(CAST(value_json AS BLOB))),
  published_revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS writer_draft_assets (
  draft_id TEXT NOT NULL REFERENCES writer_drafts(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(draft_id,position),
  FOREIGN KEY(owner,sha256) REFERENCES writer_assets(owner,sha256)
);
CREATE TABLE IF NOT EXISTS writer_jobs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES writer_drafts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes=length(CAST(snapshot_json AS BLOB))),
  reserve_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserve_bytes BETWEEN 0 AND 262144),
  state TEXT NOT NULL CHECK(state IN ('queued','dispatch_unknown','validating','ready','pushed','deployed','conflict','failed','cancelled','deployment_failed')),
  owner_auth_version INTEGER NOT NULL,
  owner_session_hash TEXT NOT NULL,
  lease_hash TEXT,
  lease_expires INTEGER,
  run_id TEXT,
  commit_sha TEXT,
  code TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner,request_id)
);
CREATE TABLE IF NOT EXISTS writer_job_assets (
  job_id TEXT NOT NULL REFERENCES writer_jobs(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(job_id,position),
  FOREIGN KEY(owner,sha256) REFERENCES writer_assets(owner,sha256)
);
CREATE TABLE IF NOT EXISTS writer_save_receipts (
  owner TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  draft_id TEXT NOT NULL REFERENCES writer_drafts(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner,request_id)
);

-- 原样恢复所有字段，包括 JSON 原字节、版本、时间戳、任务快照/租约/结果及关联位置。
INSERT INTO writer_drafts (id,owner,kind,target_key,revision,base_json,value_json,payload_bytes,published_revision,created_at,updated_at)
  SELECT id,owner,kind,target_key,revision,base_json,value_json,payload_bytes,published_revision,created_at,updated_at FROM writer_0009_drafts;
INSERT INTO writer_draft_assets (draft_id,owner,sha256,position)
  SELECT draft_id,owner,sha256,position FROM writer_0009_draft_assets;
INSERT INTO writer_jobs (id,owner,draft_id,revision,request_id,snapshot_json,payload_bytes,reserve_bytes,state,owner_auth_version,owner_session_hash,lease_hash,lease_expires,run_id,commit_sha,code,version,created_at,updated_at)
  SELECT id,owner,draft_id,revision,request_id,snapshot_json,payload_bytes,reserve_bytes,state,owner_auth_version,owner_session_hash,lease_hash,lease_expires,run_id,commit_sha,code,version,created_at,updated_at FROM writer_0009_jobs;
INSERT INTO writer_job_assets (job_id,owner,sha256,position)
  SELECT job_id,owner,sha256,position FROM writer_0009_job_assets;
INSERT INTO writer_save_receipts (owner,request_id,draft_id,payload_hash,revision,created_at)
  SELECT owner,request_id,draft_id,payload_hash,revision,created_at FROM writer_0009_save_receipts;

CREATE INDEX IF NOT EXISTS writer_drafts_owner ON writer_drafts(owner,updated_at);
CREATE INDEX IF NOT EXISTS writer_draft_asset_lookup ON writer_draft_assets(owner,sha256);
CREATE UNIQUE INDEX IF NOT EXISTS writer_one_active_job ON writer_jobs(owner) WHERE state IN ('queued','dispatch_unknown','validating','ready','pushed');
CREATE INDEX IF NOT EXISTS writer_jobs_draft ON writer_jobs(draft_id);
CREATE INDEX IF NOT EXISTS writer_job_asset_lookup ON writer_job_assets(owner,sha256);
CREATE INDEX IF NOT EXISTS writer_receipts_draft ON writer_save_receipts(draft_id,created_at);

CREATE TRIGGER IF NOT EXISTS writer_draft_added AFTER INSERT ON writer_drafts BEGIN
  UPDATE writer_usage SET draft_count=draft_count+1,total_bytes=total_bytes+NEW.payload_bytes WHERE owner=NEW.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_draft_changed AFTER UPDATE OF payload_bytes ON writer_drafts BEGIN
  UPDATE writer_usage SET total_bytes=total_bytes+NEW.payload_bytes-OLD.payload_bytes WHERE owner=NEW.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_draft_removed AFTER DELETE ON writer_drafts BEGIN
  UPDATE writer_usage SET draft_count=draft_count-1,total_bytes=total_bytes-OLD.payload_bytes WHERE owner=OLD.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_job_added AFTER INSERT ON writer_jobs BEGIN
  UPDATE writer_usage SET total_bytes=total_bytes+NEW.payload_bytes+NEW.reserve_bytes WHERE owner=NEW.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_job_reserve_changed AFTER UPDATE OF reserve_bytes ON writer_jobs BEGIN
  UPDATE writer_usage SET total_bytes=total_bytes+NEW.reserve_bytes-OLD.reserve_bytes WHERE owner=NEW.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_job_removed AFTER DELETE ON writer_jobs BEGIN
  UPDATE writer_usage SET total_bytes=total_bytes-OLD.payload_bytes-OLD.reserve_bytes WHERE owner=OLD.owner;
END;

DROP TABLE writer_0009_job_assets;
DROP TABLE writer_0009_save_receipts;
DROP TABLE writer_0009_draft_assets;
DROP TABLE writer_0009_jobs;
DROP TABLE writer_0009_drafts;
