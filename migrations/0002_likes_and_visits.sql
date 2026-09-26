-- 0002：说说点赞 + 全站访问统计（2026-09-26 站主要求：说说点赞/评论、每页页脚显示运行时长与 PV/UV）
--
-- 隐私线跟 0001 一致：**不存原始 IP、不存 UA、不存来源**。
--   · 点赞：likes 只存"这一条被赞了多少次"（不记名，站主原话"不记名只记个数"）；
--           like_votes 存 (slug, ip_hash) 是为了"同一个 IP 对同一条只算一次"，
--           防的是随手连点与脚本灌水 —— 存的是哈希，不是 IP 本身。
--   · 访问：pageviews 一行 = 一次页面浏览，只记日期 + 一个**随机访客号**（cookie 里的 nc_vid），
--           PV = 行数、UV = 不同访客号个数。没有访客号就现发一个（见 functions/_middleware.ts）。

CREATE TABLE IF NOT EXISTS likes (
  slug  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS like_votes (
  slug    TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (slug, ip_hash)
);

CREATE TABLE IF NOT EXISTS pageviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  day        TEXT NOT NULL,
  vid        TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pageviews_day ON pageviews (day);
CREATE INDEX IF NOT EXISTS idx_pageviews_vid ON pageviews (vid);
