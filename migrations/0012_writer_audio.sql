-- 云端写作台的语音素材（2026-11-10）。
-- 与 writer_assets（配图，mime 被 CHECK 死为 webp）分开建表：图片是静态展示素材、语音是媒体，
-- 二者的体积上限、文件头校验与发布落点都不同，硬塞进一张表只会把 CHECK 越摊越大。
CREATE TABLE IF NOT EXISTS writer_audio (
  owner      TEXT    NOT NULL,
  sha256     TEXT    NOT NULL,
  ext        TEXT    NOT NULL CHECK (ext IN ('mp3', 'wav')),
  bytes      BLOB    NOT NULL,
  size       INTEGER NOT NULL CHECK (size = length(bytes) AND size > 0 AND size <= 1500000),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner, sha256)
);