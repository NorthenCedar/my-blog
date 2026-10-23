-- 只增加写作私密存储。容量检查在数据库内执行，任一失败使 D1 batch 整批回滚。
CREATE TABLE IF NOT EXISTS writer_usage (
  owner TEXT PRIMARY KEY REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  draft_count INTEGER NOT NULL DEFAULT 0 CONSTRAINT writer_count_quota CHECK(draft_count BETWEEN 0 AND 100),
  image_bytes INTEGER NOT NULL DEFAULT 0 CONSTRAINT writer_image_quota CHECK(image_bytes BETWEEN 0 AND 67108864),
  total_bytes INTEGER NOT NULL DEFAULT 0 CONSTRAINT writer_total_quota CHECK(total_bytes BETWEEN 0 AND 100663296)
);
CREATE TABLE IF NOT EXISTS writer_drafts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('post','talk')),
  target_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  base_json TEXT NOT NULL CHECK(json_valid(base_json)),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes = length(CAST(base_json AS BLOB)) + length(CAST(value_json AS BLOB))),
  published_revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS writer_drafts_owner ON writer_drafts(owner,updated_at);
CREATE TABLE IF NOT EXISTS writer_assets (
  owner TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'image/webp' CHECK(mime='image/webp'),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 1920),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 1920),
  bytes BLOB NOT NULL,
  size INTEGER NOT NULL CHECK(size=length(bytes) AND size BETWEEN 1 AND 307200),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner,sha256)
);
CREATE TABLE IF NOT EXISTS writer_draft_assets (
  draft_id TEXT NOT NULL REFERENCES writer_drafts(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(draft_id,position),
  FOREIGN KEY(owner,sha256) REFERENCES writer_assets(owner,sha256)
);
CREATE INDEX IF NOT EXISTS writer_draft_asset_lookup ON writer_draft_assets(owner,sha256);
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
CREATE UNIQUE INDEX IF NOT EXISTS writer_one_active_job ON writer_jobs(owner) WHERE state IN ('queued','dispatch_unknown','validating','ready','pushed');
CREATE INDEX IF NOT EXISTS writer_jobs_draft ON writer_jobs(draft_id);
CREATE TABLE IF NOT EXISTS writer_job_assets (
  job_id TEXT NOT NULL REFERENCES writer_jobs(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(job_id,position),
  FOREIGN KEY(owner,sha256) REFERENCES writer_assets(owner,sha256)
);
CREATE INDEX IF NOT EXISTS writer_job_asset_lookup ON writer_job_assets(owner,sha256);
CREATE TABLE IF NOT EXISTS writer_save_receipts (
  owner TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  draft_id TEXT NOT NULL REFERENCES writer_drafts(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner,request_id)
);
CREATE INDEX IF NOT EXISTS writer_receipts_draft ON writer_save_receipts(draft_id,created_at);
CREATE TABLE IF NOT EXISTS writer_requests (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE
);
CREATE TRIGGER IF NOT EXISTS writer_draft_added AFTER INSERT ON writer_drafts BEGIN
  UPDATE writer_usage SET draft_count=draft_count+1,total_bytes=total_bytes+NEW.payload_bytes WHERE owner=NEW.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_draft_changed AFTER UPDATE OF payload_bytes ON writer_drafts BEGIN
  UPDATE writer_usage SET total_bytes=total_bytes+NEW.payload_bytes-OLD.payload_bytes WHERE owner=NEW.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_draft_removed AFTER DELETE ON writer_drafts BEGIN
  UPDATE writer_usage SET draft_count=draft_count-1,total_bytes=total_bytes-OLD.payload_bytes WHERE owner=OLD.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_asset_added AFTER INSERT ON writer_assets BEGIN
  UPDATE writer_usage SET image_bytes=image_bytes+NEW.size,total_bytes=total_bytes+NEW.size WHERE owner=NEW.owner;
END;
CREATE TRIGGER IF NOT EXISTS writer_asset_removed AFTER DELETE ON writer_assets BEGIN
  UPDATE writer_usage SET image_bytes=image_bytes-OLD.size,total_bytes=total_bytes-OLD.size WHERE owner=OLD.owner;
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
