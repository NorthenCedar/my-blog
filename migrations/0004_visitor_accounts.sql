-- 只新增表，可重复执行；既有评论及回复不改结构、不按昵称认领。
CREATE TABLE IF NOT EXISTS visitor_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT 'leaf',
  avatar_blob BLOB,
  avatar_version TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visitor_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  auth_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_user ON visitor_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_expiry ON visitor_sessions(expires_at);
CREATE TABLE IF NOT EXISTS visitor_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
);
CREATE INDEX IF NOT EXISTS idx_visitor_limits_time ON visitor_rate_limits(window_start);
CREATE TABLE IF NOT EXISTS comment_authors (
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'reply')),
  comment_id INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES visitor_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (kind, comment_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_authors_user ON comment_authors(user_id);
-- 现有写作台管理接口和人工 SQL 删除无需认识新表，删除后不会积累孤立身份。
CREATE TRIGGER IF NOT EXISTS visitor_comment_deleted AFTER DELETE ON comments BEGIN
  DELETE FROM comment_authors WHERE kind = 'comment' AND comment_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS visitor_reply_deleted AFTER DELETE ON replies BEGIN
  DELETE FROM comment_authors WHERE kind = 'reply' AND comment_id = OLD.id;
END;
