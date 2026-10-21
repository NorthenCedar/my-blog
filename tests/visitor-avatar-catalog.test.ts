import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { profileOf } from '../functions/api/_lib/visitor-core';
import { publicUser, type Account } from '../functions/api/_lib/visitor-store';

const account = (avatar: string, avatar_version = '') => ({ id: 'a'.repeat(32), nickname: '读者', bio: '', avatar, avatar_version } as Account);

describe('默认头像兼容已有账户', () => {
  it.each([['dorothy', 'dorothy-fate'], ['ptilopsis', 'ptilopsis-quiescence'], ['muelsyse', 'muelsyse-golden']])('指定时装 %s 可以保存，并返回实际图片', (id, file) => {
    expect(profileOf({ nickname: '读者', avatar: id }, false).avatar).toBe(id);
    const url = publicUser(account(id), { COMMENTS_DB: {} as D1Database }).avatarUrl;
    expect(url).toBe(`/avatars/${file}.png`);
    const image = readFileSync(new URL('../public' + url, import.meta.url));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
  it.each([['leaf', 'dorothy'], ['flask', 'ptilopsis'], ['crystal', 'muelsyse']])('已有 %s 选择仍有效，展示官方漫画 Q 版', (legacyId, name) => {
    expect(profileOf({ nickname: '读者', avatar: legacyId }, false).avatar).toBe(legacyId);
    expect(publicUser(account(legacyId), { COMMENTS_DB: {} as D1Database }).avatarUrl).toBe(`/avatars/${name}-comic.png`);
  });
  it('旧赫默立绘记录兼容为白面鸮幽静，新设置使用白面鸮标识', () => {
    expect(profileOf({ nickname: '读者', avatar: 'silence' }, false).avatar).toBe('silence');
    expect(publicUser(account('silence'), { COMMENTS_DB: {} as D1Database }).avatarUrl).toBe('/avatars/ptilopsis-quiescence.png');
  });
  it('上传的私人头像优先于默认头像，未知 ID 不能成为图片路径', () => {
    const version = 'b'.repeat(32);
    expect(publicUser(account('leaf', version), { COMMENTS_DB: {} as D1Database }).avatarUrl).toBe(`/api/avatars?id=${'a'.repeat(32)}&v=${version}`);
    expect(() => profileOf({ nickname: '读者', avatar: '../private' }, false)).toThrow('请选择提供的默认头像');
  });
});
