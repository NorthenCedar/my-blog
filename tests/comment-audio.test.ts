import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { visitorDatabase } from './_visitor-db';
import { onRequestPost as uploadAudio } from '../functions/api/audio';
import { onRequestGet as readAudio } from '../functions/api/audio/[id]';
import { onRequestGet as listComments, onRequestPost as postComment } from '../functions/api/comments';

// 造一段"看起来像真文件"的最短 WAV：RIFF 头 + WAVE 标记，够 sniffAudio 认出。
function wav(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WAVE'), 8);
  return bytes;
}

function mp3(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xfb, 0x90, 0x00], 0);
  return bytes;
}

const close: Array<() => void> = [];
afterEach(() => { while (close.length) close.pop()!(); });

function setup() {
  const { sqlite, db } = visitorDatabase();
  sqlite.exec(readFileSync('migrations/0005_reply_targets.sql', 'utf8'));
  sqlite.exec(readFileSync('migrations/0011_comment_audio.sql', 'utf8'));
  close.push(() => sqlite.close());
  const env = { COMMENTS_DB: db, OWNER_USER_ID: '' };
  return { sqlite, db, env };
}

function upload(body: Uint8Array, type = 'audio/wav', headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/audio', {
    method: 'POST',
    body,
    headers: {
      Origin: 'https://example.test',
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': type,
      'Content-Length': String(body.byteLength),
      'CF-Connecting-IP': '203.0.113.7',
      ...headers,
    },
  });
}

describe('访客语音：上传、绑定、读取', () => {
  it('传一段 wav，拿到的 id 绑到评论上，列表里带播放地址', async () => {
    const s = setup();
    const bytes = wav();
    const uploaded = await uploadAudio({ request: upload(bytes), env: s.env } as never);
    expect(uploaded.status).toBe(200);
    const { id, bytes: size } = await uploaded.json() as { id: string; bytes: number };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(size).toBe(bytes.byteLength);

    const posted = await postComment({
      request: new Request('https://example.test/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.test', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.7' },
        body: JSON.stringify({ slug: 'guestbook', name: '访客', body: '听听这个', audio: id }),
      }),
      env: s.env,
    } as never);
    expect(posted.status).toBe(201);
    const comment = (await posted.json() as { comment: { audio: string } }).comment;
    expect(comment.audio).toBe(`/api/audio/${id}`);

    const listed = await listComments({ request: new Request('https://example.test/api/comments?slug=guestbook'), env: s.env } as never);
    const payload = await listed.json() as { comments: Array<{ audio: string }> };
    expect(payload.comments[0].audio).toBe(`/api/audio/${id}`);
    // 绑定之后就不能再被别的评论抢走
    expect(s.sqlite.prepare('SELECT bound_kind, bound_id FROM audio_clips WHERE id = ?').get(id)).toEqual({ bound_kind: 'comment', bound_id: 1 });
  });

  it('别人传的音频绑不上我的评论（ip 哈希不匹配就静默丢弃）', async () => {
    const s = setup();
    const first = await uploadAudio({ request: upload(mp3(48), 'audio/mpeg'), env: s.env } as never);
    const { id } = await first.json() as { id: string };
    const posted = await postComment({
      request: new Request('https://example.test/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.test', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '198.51.100.9' },
        body: JSON.stringify({ slug: 'guestbook', name: '另一个人', body: '捡个 id 试试', audio: id }),
      }),
      env: s.env,
    } as never);
    expect(posted.status).toBe(201);
    expect((await posted.json() as { comment: { audio: string } }).comment.audio).toBe('');
    expect(s.sqlite.prepare('SELECT bound_kind FROM audio_clips WHERE id = ?').get(id)).toEqual({ bound_kind: null });
  });

  it('读取支持 Range：整段 200、分段 206、越界 416', async () => {
    const s = setup();
    const bytes = wav(200);
    const uploaded = await uploadAudio({ request: upload(bytes), env: s.env } as never);
    const { id } = await uploaded.json() as { id: string };

    const whole = await readAudio({ request: new Request(`https://example.test/api/audio/${id}`), env: s.env, params: { id } } as never);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('Content-Type')).toBe('audio/wav');
    expect(whole.headers.get('Accept-Ranges')).toBe('bytes');
    expect(new Uint8Array(await whole.arrayBuffer()).byteLength).toBe(200);

    const part = await readAudio({
      request: new Request(`https://example.test/api/audio/${id}`, { headers: { Range: 'bytes=0-3' } }),
      env: s.env,
      params: { id },
    } as never);
    expect(part.status).toBe(206);
    expect(part.headers.get('Content-Range')).toBe('bytes 0-3/200');
    expect(new Uint8Array(await part.arrayBuffer()).byteLength).toBe(4);

    const bad = await readAudio({
      request: new Request(`https://example.test/api/audio/${id}`, { headers: { Range: 'bytes=9999-10000' } }),
      env: s.env,
      params: { id },
    } as never);
    expect(bad.status).toBe(416);

    const missing = await readAudio({ request: new Request('https://example.test/api/audio/00000000-0000-0000-0000-000000000000'), env: s.env, params: { id: '00000000-0000-0000-0000-000000000000' } } as never);
    expect(missing.status).toBe(404);
  });

  it('拒收：非 mp3/wav、伪装内容、超大、跨站、没有长度', async () => {
    const s = setup();
    const cases: Array<[string, Request, number]> = [
      ['文本类型', upload(wav(), 'text/plain'), 415],
      ['伪装成 wav 的 HTML', upload(new TextEncoder().encode('<html>hi</html>'), 'audio/wav'), 400],
      ['超过 1.5 MB', upload(wav(1_500_001)), 413],
      ['跨站来源', upload(wav(), 'audio/wav', { Origin: 'https://evil.test' }), 403],
    ];
    for (const [name, request, status] of cases) {
      const response = await uploadAudio({ request, env: s.env } as never);
      expect(response.status, name).toBe(status);
    }
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM audio_clips').get()?.n).toBe(0);
  });

  it('一分钟内传第五段会被限流', async () => {
    const s = setup();
    for (let i = 0; i < 4; i += 1) {
      const response = await uploadAudio({ request: upload(wav(32 + i)), env: s.env } as never);
      expect(response.status).toBe(200);
    }
    const blocked = await uploadAudio({ request: upload(wav(40)), env: s.env } as never);
    expect(blocked.status).toBe(429);
  });
});