-- 将既有提醒扩展到站主的新评论。reply_id 为 NULL 表示顶层新留言；其余列保留原义。
-- 必须整份原子执行（D1 batch / Wrangler --file），本文件不自行 BEGIN/COMMIT。
-- 不回填历史评论，不改正文、账户、回复目标或写作台数据；可重复执行。
-- 暂存自增上界，避免最高编号已删除时迁移后重新使用旧通知编号。
CREATE TABLE owner_notices_0010_sequence AS
  SELECT seq FROM sqlite_sequence WHERE name = 'reply_notices';

CREATE TABLE reply_notices_0010 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id INTEGER NOT NULL,
  reply_id INTEGER,
  actor_name TEXT NOT NULL,
  actor_user_id TEXT,
  excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at INTEGER,
  UNIQUE(user_id, reply_id)
);
INSERT INTO reply_notices_0010
  (id,user_id,slug,parent_id,reply_id,actor_name,actor_user_id,excerpt,created_at,read_at)
  SELECT id,user_id,slug,parent_id,reply_id,actor_name,actor_user_id,excerpt,created_at,read_at FROM reply_notices;

UPDATE sqlite_sequence
  SET seq = MAX(seq, COALESCE((SELECT seq FROM owner_notices_0010_sequence), 0))
  WHERE name = 'reply_notices_0010';
INSERT INTO sqlite_sequence(name,seq)
  SELECT 'reply_notices_0010',seq FROM owner_notices_0010_sequence
  WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name = 'reply_notices_0010');

DROP TRIGGER reply_notices_reply_deleted;
DROP TRIGGER reply_notices_thread_deleted;
DROP TABLE reply_notices;
ALTER TABLE reply_notices_0010 RENAME TO reply_notices;
DROP TABLE owner_notices_0010_sequence;

CREATE INDEX idx_reply_notices_user_created ON reply_notices(user_id,created_at);
CREATE INDEX idx_reply_notices_unread ON reply_notices(user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX idx_reply_notices_comment ON reply_notices(user_id,parent_id) WHERE reply_id IS NULL;

CREATE TRIGGER reply_notices_reply_deleted
AFTER DELETE ON replies BEGIN
  DELETE FROM reply_notices WHERE reply_id = OLD.id;
END;
CREATE TRIGGER reply_notices_thread_deleted
AFTER DELETE ON comments BEGIN
  DELETE FROM reply_notices WHERE parent_id = OLD.id;
END;
