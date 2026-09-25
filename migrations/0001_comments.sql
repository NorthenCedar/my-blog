-- 评论表。ip_hash 用于频率限制，**不存原始 IP**。
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  ip_hash    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_slug_created
  ON comments (slug, created_at);
