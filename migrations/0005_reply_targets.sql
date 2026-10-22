-- 0005：回复「指向谁」（2026-10-18 站主要求：别人回复我时，我能看见提醒）
--
-- 为什么需要这一张：0003 的 replies 只存了 reply_to（**被回复者的名字字符串**），
-- 而回复一条回复时 parent_id 仍然指向**顶层评论**。⇒ 光凭 replies 说不清
-- 「这一条回复到底回的是哪一条」—— 同一楼层有两个同名人就串了，被回复者改名更是一笔糊涂账。
-- 提醒要落到**账户**上，就必须先能精确指认目标。
--
-- 为什么是旁表而不是给 replies 加列（与 0003 同一个理由）：
--   SQLite/D1 **没有** `ADD COLUMN IF NOT EXISTS`，ALTER 版本的迁移跑第二次就报错，
--   而 0001–0004 这条链的约定是「纯加表、重复执行无害」。改动既有表还会碰到线上真数据。
--
-- 写入：functions/api/comments.ts 在回复落库后调用 _lib/notices.ts 的 recordReplyNotice；
-- 老前端不带 replyTarget 时不写这一行（提醒退化成「只通知顶层评论作者」），不影响发表。

CREATE TABLE IF NOT EXISTS reply_targets (
  reply_id    INTEGER PRIMARY KEY,        -- replies.id（一条回复只有一个指向）
  target_kind TEXT    NOT NULL CHECK (target_kind IN ('comment', 'reply')),
  target_id   INTEGER NOT NULL            -- target_kind='comment' → comments.id；'reply' → replies.id
);

-- 反查「谁被我回复过」时按目标走
CREATE INDEX IF NOT EXISTS idx_reply_targets_target
  ON reply_targets (target_kind, target_id);

-- 回复被删时指向一起消失（不做外键：D1 默认不开 PRAGMA foreign_keys，靠触发器更稳）
CREATE TRIGGER IF NOT EXISTS reply_targets_cleared
AFTER DELETE ON replies BEGIN
  DELETE FROM reply_targets WHERE reply_id = OLD.id;
END;