-- 共享核对时间单独存储，冷却期更新不必改写任务及其快照。已有任务按需登记。
CREATE TABLE IF NOT EXISTS writer_job_reconcile (
  job_id TEXT NOT NULL PRIMARY KEY REFERENCES writer_jobs(id) ON DELETE CASCADE,
  reconcile_after INTEGER NOT NULL
);
