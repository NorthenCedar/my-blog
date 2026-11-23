-- 0016：回复与站主邮件提醒旁表（纯加表、可重复执行；不改动既有表结构）。
CREATE TABLE IF NOT EXISTS visitor_emails (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comment_emails (
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'reply')),
  comment_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  PRIMARY KEY (kind, comment_id)
);

-- 账户注销或留言被删除时同步清理留存邮箱，不留孤立个人联系信息。
CREATE TRIGGER IF NOT EXISTS visitor_emails_account_deleted
AFTER DELETE ON visitor_accounts BEGIN
  DELETE FROM visitor_emails WHERE user_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS comment_emails_comment_deleted
AFTER DELETE ON comments BEGIN
  DELETE FROM comment_emails WHERE kind = 'comment' AND comment_id = OLD.id;
  DELETE FROM comment_emails WHERE kind = 'reply' AND comment_id IN (SELECT id FROM replies WHERE parent_id = OLD.id);
END;

CREATE TRIGGER IF NOT EXISTS comment_emails_reply_deleted
AFTER DELETE ON replies BEGIN
  DELETE FROM comment_emails WHERE kind = 'reply' AND comment_id = OLD.id;
END;
