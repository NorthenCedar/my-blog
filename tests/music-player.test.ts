import { describe, expect, it } from 'vitest';
import { normaliseTracks, restoreMusicState, formatMusicTime, MusicQueue, orderMusicTracks } from '../src/lib/music';

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
    expect(restoreMusicState('{')).toEqual({ id: '', time: 0, volume: 0.35, shuffle: true });
    expect(restoreMusicState('{"id":"123","time":42,"volume":0.6}')).toEqual({ id: '123', time: 42, volume: 0.6, shuffle: true });
    expect(restoreMusicState('{"id":"bad","time":-1,"volume":99}')).toEqual({ id: '', time: 0, volume: 0.35, shuffle: true });
  });
  it('尚未加载和长曲目时长正确显示', () => {
    expect(formatMusicTime(NaN)).toBe('0:00');
    expect(formatMusicTime(245.63)).toBe('4:05');
  });
});

describe('音乐播放队列', () => {
  it('顺序模式循环切歌', () => {
    const queue = new MusicQueue();
    queue.reset(4);
    expect(queue.next(3, false)).toBe(0);
    expect(queue.previous(0, false)).toBe(3);
  });
  it('随机模式听完其余曲目再开始新一轮，不立即重复当前歌曲', () => {
    const queue = new MusicQueue(() => 0);
    queue.reset(4);
    let current = 0;
    queue.record(current);
    const played: number[] = [];
    for (let i = 0; i < 3; i++) {
      const next = queue.next(current, true);
      expect(next).not.toBe(current);
      played.push(next);
      queue.record(next);
      current = next;
    }
    expect(played.toSorted()).toEqual([1, 2, 3]);
    expect(queue.next(current, true)).not.toBe(current);
  });
  it('手选歌曲从本轮待播列表移除，上一首回到实际播放历史', () => {
    const queue = new MusicQueue(() => 0);
    queue.reset(4);
    queue.record(0);
    const next = queue.next(0, true);
    expect(next).toBe(1);
    queue.record(next);
    queue.record(3);
    expect(queue.next(3, true)).toBe(2);
    const previous = queue.previous(3, true);
    expect(previous).toBe(1);
    queue.record(previous);
    expect(queue.previous(previous, true)).toBe(0);
  });
  it('重载清理旧历史，单曲和空队列可安全处理', () => {
    const queue = new MusicQueue();
    queue.reset(4);
    queue.record(3);
    queue.reset(1);
    queue.record(0);
    expect(queue.next(0, true)).toBe(0);
    expect(queue.previous(0, true)).toBe(0);
    queue.reset(0);
    expect(queue.next(0, true)).toBe(0);
    expect(queue.previous(0, false)).toBe(0);
  });
  it('随机开关只恢复布尔值', () => {
    expect(restoreMusicState('{"shuffle":true}').shuffle).toBe(true);
    expect(restoreMusicState('{"shuffle":"true"}').shuffle).toBe(true);
    expect(restoreMusicState('{"shuffle":false}').shuffle).toBe(false);
    expect(restoreMusicState(null).shuffle).toBe(true);
  });
});

describe('固定旧歌顺序，新增歌曲前置', () => {
  const track = (id: string) => ({ id, title: id, artist: '' });
  it('保留已确认顺序，连续新增歌曲始终在上方', () => {
    const baseline = ['2', '1'];
    expect(orderMusicTracks(['3', '1', '2'].map(track), baseline).map(t => t.id)).toEqual(['3', '2', '1']);
    const incoming = ['4', '3', '1', '2'].map(track);
    expect(orderMusicTracks(incoming, baseline).map(t => t.id)).toEqual(['4', '3', '2', '1']);
    expect(incoming.map(t => t.id)).toEqual(['4', '3', '1', '2']);
  });
  it('删除的歌曲不会凭顺序配置复活', () => {
    expect(orderMusicTracks(['3', '1'].map(track), ['2', '1']).map(t => t.id)).toEqual(['3', '1']);
  });
  it('首次随机播放也可以选到列表首曲或末曲', () => {
    for (const [random, expected] of [[0, 0], [0.999, 3]]) {
      const queue = new MusicQueue(() => random);
      queue.reset(4);
      expect(queue.next(-1, true)).toBe(expected);
    }
  });
});
