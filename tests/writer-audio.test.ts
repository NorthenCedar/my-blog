import { expect,it } from 'vitest';
import { createHash } from 'node:crypto';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { putAudio, deleteAudio } from '../functions/api/_lib/writer-audio';
import { createDraft, exportDraft, saveDraft } from '../functions/api/_lib/writer-drafts';
import { createJob } from '../functions/api/_lib/writer-jobs';
import { planChanges,readPost,readTalks } from '../src/lib/writer/content';

/** 最小的合法文章原文：frontmatter 走仓库自己的解析器读回来，避免手抄字段漏项。 */
const post = (body: string) => `---\ntitle: 语音测试\ndate: 2026-11-10\nsummary: 测试语音引用\ntags: [随笔]\ndraft: false\n---\n${body}\n`;
const base = (text: string, itemHash?: string) => ({ commit: '1'.repeat(40), blobSha: '2'.repeat(40), text, ...(itemHash ? { itemHash } : {}) });
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const sha = createHash('sha256').update(mp3).digest('hex');
const decode = (changes: { path: string; bytes: Uint8Array }[], path: string) => new TextDecoder().decode(changes.find((c) => c.path === path)!.bytes);

it('文章里的语音引用被换成 /audio/<sha>.mp3，并把原件作为候选文件', () => {
  const original = post('开场白');
  const value = { ...readPost(original), body: `开场白\n\n!audio[耳机里的白噪](writer-audio:${sha})\n`, audios: [{ sha256: sha, ext: 'mp3' as const, label: '耳机里的白噪' }] };
  const changes = planChanges({ kind: 'post', key: 'voice', base: base(original), value }, original, new Map([[sha, mp3]]));
  expect(decode(changes, 'content/posts/voice/index.md')).toContain(`!audio[耳机里的白噪](/audio/${sha}.mp3)`);
  expect(changes.map((c) => c.path)).toContain(`content/audio/${sha}.mp3`);
  expect(changes.find((c) => c.path === `content/audio/${sha}.mp3`)!.bytes).toEqual(mp3);
});

it('引用了不属于这份草稿的语音、摘要对不上、体积超限都要当场拦下', () => {
  const original = post('开场白');
  const draft = (audios: { sha256: string; ext: 'mp3' | 'wav'; label: string }[], body: string) => ({ kind: 'post' as const, key: 'voice', base: base(original), value: { ...readPost(original), body, audios } });
  expect(() => planChanges(draft([], `!audio[缺](writer-audio:${'a'.repeat(64)})\n`), original, new Map())).toThrow();
  expect(() => planChanges(draft([{ sha256: sha, ext: 'mp3', label: '' }], `!audio[缺](writer-audio:${sha})\n`), original, new Map())).toThrow();
  const other = new Uint8Array([0x49, 0x44, 0x33, 0x01]);
  expect(() => planChanges(draft([{ sha256: sha, ext: 'mp3', label: '' }], `!audio[短](writer-audio:${sha})\n`), original, new Map([[sha, other]]))).toThrow();
  const big = new Uint8Array(1_500_001);
  const bigSha = createHash('sha256').update(big).digest('hex');
  expect(() => planChanges(draft([{ sha256: bigSha, ext: 'wav', label: '大' }], `!audio[大](writer-audio:${bigSha})\n`), original, new Map([[bigSha, big]]))).toThrow();
});

it('说说的语音整体写回 audio 字段，挂在那条说说下面', () => {
  const file = ['---', 'title: 说说', 'items:', '  - id: talk-1', '    date: 2026-11-10', '    text: 第一条', '---', ''].join('\n');
  const [row] = readTalks(file);
  const value = { ...row.value, audios: [{ sha256: sha, ext: 'mp3' as const, label: '睡前' }] };
  const changes = planChanges({ kind: 'talk', key: 'talk-1', base: base(file, row.itemHash), value }, file, new Map([[sha, mp3]]));
  const text = decode(changes, 'content/pages/talks.md');
  expect(text).toContain(`/audio/${sha}.mp3`);
  expect(readTalks(text)[0].value.fields.audio).toEqual([{ src: `/audio/${sha}.mp3`, label: '睡前' }]);
});
it('追加私有语音时保留原说说的公开语音，同一个资源只写一次', () => {
  const old = { src: '/audio/' + 'f'.repeat(64) + '.mp3', label: '原语音' };
  const file = ['---', 'title: 说说', 'items:', '  - id: talk-1', '    date: 2026-11-10', '    text: 第一条', '    audio: ' + JSON.stringify([old]), '---', ''].join('\n');
  const [row] = readTalks(file);
  const added = { sha256: sha, ext: 'mp3' as const, label: '追加语音' };
  const value = { ...row.value, audios: [added, added] };
  const changes = planChanges({ kind: 'talk', key: 'talk-1', base: base(file, row.itemHash), value }, file, new Map([[sha, mp3]]));
  expect(readTalks(decode(changes, 'content/pages/talks.md'))[0].value.fields.audio)
    .toEqual([old, { src: '/audio/' + sha + '.mp3', label: '追加语音' }]);
  expect(changes.filter(change => change.path.startsWith('content/audio/'))).toHaveLength(1);
});

it('草稿和进行中的发布保护语音，解除引用后才能删除且无法再次保存失效引用', async () => {
  const { db, owner, request, sqlite } = await writerFixture();
  const proof = await writerProof(request(), { id: owner, auth_version: 0 } as never);
  const audio = await putAudio(db, proof, mp3);
  const original = post('正文');
  const withoutAudio = { ...readPost(original), audios: [] };
  const withAudio = { ...withoutAudio, audios: [{ sha256: audio.sha256, ext: audio.ext, label: '语音' }] };
  const draft = await createDraft(db, proof, { kind: 'post', key: 'voice', base: base(original), value: withAudio });
  const backup = await exportDraft(db, owner, draft.id);
  expect(backup.audios).toEqual([{ sha256: sha, ext: 'mp3', size: mp3.length, bytes: Buffer.from(mp3).toString('base64') }]);
  await expect(deleteAudio(db, proof, audio.sha256)).rejects.toMatchObject({ code: 'audio_referenced' });
  const job = await createJob(db, proof, { draftId: draft.id, revision: 1, requestId: '1'.repeat(32) });
  await saveDraft(db, proof, { id: draft.id, expectedRevision: 1, requestId: '2'.repeat(32), value: withoutAudio });
  await expect(deleteAudio(db, proof, audio.sha256)).rejects.toMatchObject({ code: 'audio_referenced' });
  sqlite.prepare("UPDATE writer_jobs SET state='cancelled',reserve_bytes=0 WHERE id=?").run(job.id);
  await deleteAudio(db, proof, audio.sha256);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM writer_audio').get()?.n).toBe(0);
  await expect(saveDraft(db, proof, { id: draft.id, expectedRevision: 2, requestId: '3'.repeat(32), value: withAudio }))
    .rejects.toMatchObject({ code: 'audio_missing' });
  expect(sqlite.prepare('SELECT revision FROM writer_drafts').get()?.revision).toBe(2);
  await expect(createDraft(db, proof, { kind: 'post', key: 'voice-again', base: null, value: withAudio }))
    .rejects.toMatchObject({ code: 'audio_missing' });
});
