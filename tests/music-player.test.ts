import { describe, expect, it } from 'vitest';
import { normaliseTracks, restoreMusicState, formatMusicTime } from '../src/lib/music';

describe('公共歌单数据与恢复边界', () => {
  it('只保留合法网易云曲目 ID，去重并保留歌单顺序', () => {
    expect(normaliseTracks([
      { name: '<歌名>', artist: '歌手', url: 'https://api.qijieya.cn/meting/?id=123&type=url&server=netease' },
      { name: '重复', url: 'https://api.qijieya.cn/meting/?id=123' },
      { name: '伪地址', url: 'javascript:alert(1)?id=456' },
      { name: '其他服务', url: 'https://example.com/?id=456' },
      { name: '缺少编号' },
    ])).toEqual([{ id: '123', title: '<歌名>', artist: '歌手' }]);
  });
  it('拒绝错误响应，不把服务报错当成空歌单', () => {
    expect(() => normaliseTracks({ error: 'offline' })).toThrow();
  });
  it('恢复只接受有限的进度与音量，存储损坏可以继续使用', () => {
    expect(restoreMusicState('{')).toEqual({ id: '', time: 0, volume: 0.35 });
    expect(restoreMusicState('{"id":"123","time":42,"volume":0.6}')).toEqual({ id: '123', time: 42, volume: 0.6 });
    expect(restoreMusicState('{"id":"bad","time":-1,"volume":99}')).toEqual({ id: '', time: 0, volume: 0.35 });
  });
  it('尚未加载和长曲目时长正确显示', () => {
    expect(formatMusicTime(NaN)).toBe('0:00');
    expect(formatMusicTime(245.63)).toBe('4:05');
  });
});
