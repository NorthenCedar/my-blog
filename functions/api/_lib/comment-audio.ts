/**
 * 访客语音：文件头校验、发表时绑定、列表时回填（2026-11-10）。
 *
 * 三件事都在这里，因为它们是**同一条生命线**的三段：
 *   上传（functions/api/audio.ts，写 bound_kind = NULL 的行）
 *     → 发表评论时绑定（bindCommentAudio）
 *     → 读列表时回填 `/api/audio/<id>`（attachAudioPaths）
 * 分段实现会让「谁负责设 bound」散在三处，迟早出现"传了不挂"的孤儿音频。
 */

import type { VisitorEnv } from './visitor-store';

/** 1.5 MB：D1 单行的安全余量（行上限约 2 MB），同时 ≈100 秒 128 kbps mp3。 */
export const AUDIO_MAX = 1_500_000;

/** 待挂音频的有效期：30 分钟内没发出去就当放弃（不做后台清理，读时过滤）。 */
const PENDING_TTL = 30 * 60 * 1000;

/** 只看文件头：Content-Type 和扩展名都是客户端说的，文件头是它自己。 */
export function sniffAudio(type: string, bytes: Uint8Array): string | null {
  if (type === 'audio/wav') {
    if (bytes.byteLength > 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return type;
    return null;
  }
  if (type === 'audio/mpeg') {
    if (bytes.byteLength < 4) return null;
    if (ascii(bytes, 0, 3) === 'ID3') return type;
    // MPEG 帧同步：11 个 1
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return type;
    return null;
  }
  return null;
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let out = '';
  for (let i = from; i < to && i < bytes.byteLength; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * 把「刚才上传的那条音频」绑到刚写进库的评论/回复上。
 * 返回可直接放进 JSON 的地址（`/api/audio/<id>`）；没带音频或校验不过就返回 ''。
 * ★ 校验不过**不报错**：正文已经落库了，为一条音频把整条留言判失败最不划算。
 */
export async function bindCommentAudio(
  env: VisitorEnv,
  payload: Record<string, unknown>,
  ipHash: string,
  kind: 'comment' | 'reply',
  boundId: number,
  slug: string
): Promise<string> {
  const id = payload.audio;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return '';
  try {
    const row = await env.COMMENTS_DB.prepare(
      `SELECT id FROM audio_clips
        WHERE id = ? AND ip_hash = ? AND bound_kind IS NULL AND created_at > ?
        LIMIT 1`
    )
      .bind(id, ipHash, Date.now() - PENDING_TTL)
      .first<{ id: string }>();
    if (!row) return '';
    await env.COMMENTS_DB.prepare(
      'UPDATE audio_clips SET bound_kind = ?, bound_id = ?, slug = ? WHERE id = ? AND bound_kind IS NULL'
    )
      .bind(kind, boundId, slug, id)
      .run();
    return `/api/audio/${id}`;
  } catch (error) {
    console.error('bind comment audio failed', error);
    return '';
  }
}

/**
 * 列表回填：一批评论/回复里哪些带语音。
 * 按 kind + id 分两次查（比 JOIN 两次主查询好读，且 LIMIT 200 时开销可以忽略）。
 */
export async function attachAudioPaths(
  env: VisitorEnv,
  comments: { id: number; audio?: string }[],
  replies: { id: number; audio?: string }[]
): Promise<void> {
  const load = async (kind: 'comment' | 'reply', ids: number[]) => {
    const found = new Map<number, string>();
    for (let start = 0; start < ids.length; start += 90) {
      const slice = ids.slice(start, start + 90);
      const marks = slice.map(() => '?').join(',');
      const { results } = await env.COMMENTS_DB.prepare(
        `SELECT id, bound_id FROM audio_clips WHERE bound_kind = ? AND bound_id IN (${marks})`
      )
        .bind(kind, ...slice)
        .all<{ id: string; bound_id: number }>();
      for (const row of results ?? []) found.set(row.bound_id, `/api/audio/${row.id}`);
    }
    return found;
  };
  try {
    const [byComment, byReply] = await Promise.all([load('comment', comments.map((c) => c.id)), load('reply', replies.map((r) => r.id))]);
    for (const comment of comments) comment.audio = byComment.get(comment.id) ?? '';
    for (const reply of replies) reply.audio = byReply.get(reply.id) ?? '';
  } catch {
    // 表还没跑迁移（本地首次 db:init 之前）时不能把留言列表整个弄成 500；
    // 也不往日志里刷一屏错误 —— 缺表只会少一个播放条，不影响任何既有内容。
  }
}