-- 0006：回复提醒（2026-10-18 站主拍板：只做「别人回复我」这一种，站上有新留言不提醒）
--
-- 一行 = 「某人回复了你」这件事本身。**物化**而不是每次现算，理由三条：
--   ① 页面加载就要一个未读数字 ⇒ 现算要扫「我写过的所有评论 + 它们的全部回复」，
--      物化之后是一条走部分索引的 COUNT；
--   ② 单条已读（read_at）只有物化才做得自然，水位式已读会吞掉中间的几条；
--   ③ 将来要挂邮件 / WebPush，只是多一层「投递」，不用推翻数据层。
--
-- 隐私与 0001–0004 同一条线：**不存 IP、不存被删正文的副本**，excerpt 只摘 80 字，
-- 评论被删时触发器把对应通知一起清掉（不留「点进去什么都没有」的死链）。
--
-- 身份只认 comment_authors（0004）：**匿名留言收不到提醒** —— 没有账户可挂，这是设计边界。

CREATE TABLE IF NOT EXISTS reply_notices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,          -- 被回复者（visitor_accounts.id）
  slug         TEXT    NOT NULL,          -- 页面标识，与 comments.slug 同一个
  parent_id    INTEGER NOT NULL,          -- 顶层评论 id（前端拼 #comment-N 用它，回复永远是两层）
  reply_id     INTEGER NOT NULL,          -- 那条回复（replies.id）
  actor_name   TEXT    NOT NULL,          -- 回复者名字快照（改名不影响历史）
  actor_user_id TEXT,                     -- 回复者账户 id；匿名回复记 NULL
  excerpt      TEXT    NOT NULL,          -- 回复正文前 80 字
  created_at   TEXT    NOT NULL,
  read_at      INTEGER,                   -- 毫秒时间戳；NULL = 未读
  -- 同一条回复对同一个人只提醒一次（重复提交 / 重放不该刷屏）
  UNIQUE (user_id, reply_id)
);

CREATE INDEX IF NOT EXISTS idx_reply_notices_user_created
  ON reply_notices (user_id, created_at);

-- 未读计数走**部分索引**：表变大以后 COUNT 仍然只碰未读那几行
CREATE INDEX IF NOT EXISTS idx_reply_notices_unread
  ON reply_notices (user_id) WHERE read_at IS NULL;

-- 回复删了 ⇒ 提醒没有落点，一起删
CREATE TRIGGER IF NOT EXISTS reply_notices_reply_deleted
AFTER DELETE ON replies BEGIN
  DELETE FROM reply_notices WHERE reply_id = OLD.id;
END;

-- 顶层评论删了 ⇒ 它下面的回复（含通知）也失去上下文，一起删
CREATE TRIGGER IF NOT EXISTS reply_notices_thread_deleted
AFTER DELETE ON comments BEGIN
  DELETE FROM reply_notices WHERE parent_id = OLD.id;
END;