-- 从原有访问记录回填 PV、UV 和有记录的 UTC 天数。
-- 原始记录仍保留，旧版中间件插入同一张表时也会同步更新汇总。
CREATE TABLE IF NOT EXISTS pageview_totals (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  pv   INTEGER NOT NULL,
  uv   INTEGER NOT NULL,
  days INTEGER NOT NULL
);

INSERT OR REPLACE INTO pageview_totals (id, pv, uv, days)
SELECT 1, COUNT(*), COUNT(DISTINCT vid), COUNT(DISTINCT day) FROM pageviews;

-- 正常写入链路只追加访问记录。触发器和该次插入一同提交。
-- 两次存在性查询走原有访客号与日期索引，各自命中一条别的记录就停止。
CREATE TRIGGER IF NOT EXISTS pageviews_increment_totals AFTER INSERT ON pageviews
BEGIN
  UPDATE pageview_totals
  SET pv = pv + 1,
      uv = uv + NOT EXISTS (SELECT 1 FROM pageviews WHERE vid = NEW.vid AND id <> NEW.id),
      days = days + NOT EXISTS (SELECT 1 FROM pageviews WHERE day = NEW.day AND id <> NEW.id)
  WHERE id = 1;
END;
