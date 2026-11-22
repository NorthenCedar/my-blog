-- 友链申请表（2026-11-22）。不存原始 IP，仅存哈希用于限流。
CREATE TABLE IF NOT EXISTS link_applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  href       TEXT    NOT NULL,
  desc       TEXT    NOT NULL,
  avatar     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL,
  ip_hash    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_link_applications_created
  ON link_applications (created_at DESC, id DESC);
