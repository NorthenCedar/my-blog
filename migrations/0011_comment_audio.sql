-- 0009：留言/评论里的语音（2026-11-10 站主：「加一个可以上传音频的功能（mp3 和 wav）
-- （说说，留言，文章）」）。
--
-- 为什么访客音频放 D1、作者音频放仓库：
--   · 作者（站主）发文章/说说时，音频原件随仓库走（content/audio/，
--     见 src/lib/audio-assets.mjs）—— 文件多大只受仓库限制，也不需要服务器存；
--   · 访客在留言里留语音，没有仓库写权限 ⇒ 只能服务端存。D1 单行有上限，
--     所以定 1.5 MB（约 100 秒 128 kbps 的 mp3，或 8 秒的 44.1k 立体声 wav）。
--
-- 生命周期：上传 → bound_kind/bound_id 为 NULL 的"待挂"行；发表评论时绑定；
--   30 分钟没被绑定的行视为放弃（读取时按 created_at 过滤，不做后台任务）。
--   这样"上传了但没发出去"的音频不会永久占着库。

CREATE TABLE IF NOT EXISTS audio_clips (
  id         TEXT    PRIMARY KEY,              -- 随机 UUID（不是内容哈希：同一条录音可以传两次）
  ip_hash    TEXT    NOT NULL,                 -- 上传者的 IP 哈希：绑定与限流都认它
  mime       TEXT    NOT NULL CHECK (mime IN ('audio/mpeg', 'audio/wav')),
  bytes      BLOB    NOT NULL,
  size       INTEGER NOT NULL CHECK (size = length(bytes) AND size BETWEEN 1 AND 1500000),
  created_at INTEGER NOT NULL,                 -- 毫秒时间戳
  bound_kind TEXT    CHECK (bound_kind IS NULL OR bound_kind IN ('comment', 'reply')),
  bound_id   INTEGER,
  slug       TEXT    NOT NULL DEFAULT ''       -- 绑定时记页面，便于按页清理
);

CREATE INDEX IF NOT EXISTS idx_audio_clips_bound ON audio_clips (bound_kind, bound_id);
CREATE INDEX IF NOT EXISTS idx_audio_clips_ip ON audio_clips (ip_hash, created_at);

-- 评论/回复被删时把音频一起删掉（D1 默认不开外键，触发器更稳，与 0003 同一做法）。
CREATE TRIGGER IF NOT EXISTS audio_comment_deleted AFTER DELETE ON comments BEGIN
  DELETE FROM audio_clips WHERE bound_kind = 'comment' AND bound_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS audio_reply_deleted AFTER DELETE ON replies BEGIN
  DELETE FROM audio_clips WHERE bound_kind = 'reply' AND bound_id = OLD.id;
END;