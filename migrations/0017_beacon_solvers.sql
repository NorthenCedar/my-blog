-- 0017：BEACON 解谜通关榜（纯加表、可重复执行；仅保存通关次序、匿名代号、简短留语与一次性凭证指纹）。
CREATE TABLE IF NOT EXISTS beacon_solvers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_nonce TEXT NOT NULL UNIQUE,
  codename TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  solved_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_beacon_solvers_id
  ON beacon_solvers (id DESC);
