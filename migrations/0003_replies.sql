-- 0003：评论回复（2026-09-28 站主要求：说说 / 留言 / 文章评论都能回复，类似 QQ 动态的评论区）
--
-- 为什么是"加一张表"而不是给 comments 加 parent_id 列：
--   · 0001 / 0002 都是 `CREATE TABLE IF NOT EXISTS`（纯加表），手册 §26.1 已经把
--     "重复执行无害"当成这条链的约定写下来了；而 SQLite/D1 **没有** `ADD COLUMN IF NOT EXISTS`
--     ⇒ ALTER 版本的迁移跑第二次就会报 duplicate column error。
--   · 线上库里已经有真的评论和留言，不动它的表结构风险最小；回复单独一张，
--     语义也更清楚：comments = 顶层留言，replies = 挂在它下面的回复。
--
-- 层级是**两层**（站主 2026-09-28 拍板，不是无限嵌套）：
--   回复一条回复时，parent_id 仍然写**顶层**评论的 id，被回复者的名字记在 reply_to
--   ⇒ 渲染成「A 回复 B：…」，无论被回复多少次都只有两层缩进，手机上不会挤成一条细线。
--
-- 顺序（站主 2026-09-28 拍板）：顶层评论新的在上，**回复旧的在上** —— 对话要顺着读。
--
-- 隐私线与 0001 一致：**只存 ip_hash，不存原始 IP**。

CREATE TABLE IF NOT EXISTS replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL,          -- 与 comments.slug 同一个页面标识
  parent_id  INTEGER NOT NULL,          -- 顶层评论的 id（comments.id）
  reply_to   TEXT    NOT NULL DEFAULT '', -- 被回复者的名字；空串 = 直接回复顶层评论
  name       TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  ip_hash    TEXT    NOT NULL
);

-- 取某个页面的回复时按 (parent_id, created_at) 走，避免全表扫
CREATE INDEX IF NOT EXISTS idx_replies_parent_created
  ON replies (parent_id, created_at);
