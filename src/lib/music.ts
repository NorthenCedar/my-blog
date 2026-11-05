export const MUSIC_PLAYLIST = '18562297354';
export const MUSIC_API = 'https://api.qijieya.cn/meting/';
export type MusicTrack = { id: string; title: string; artist: string };

export function normaliseTracks(value: unknown): MusicTrack[] {
  if (!Array.isArray(value)) throw new Error('歌单服务暂时不可用，请稍后重试');
  const seen = new Set<string>();
  return value.flatMap(row => {
    if (!row || typeof row.name !== 'string' || typeof row.url !== 'string') return [];
    try {
      const url = new URL(row.url);
      const id = url.searchParams.get('id') || '';
      if (url.origin !== new URL(MUSIC_API).origin || !/^\d+$/.test(id) || seen.has(id)) return [];
      seen.add(id);
      return [{ id, title: row.name.slice(0, 250), artist: typeof row.artist === 'string' ? row.artist.slice(0, 250) : '' }];
    } catch { return []; }
  });
}

export function restoreMusicState(raw: string | null) {
  const defaults = { id: '', time: 0, volume: 0.35 };
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return defaults;
    return {
      id: typeof value.id === 'string' && /^\d+$/.test(value.id) ? value.id : '',
      time: Number.isFinite(value.time) && value.time >= 0 ? value.time : 0,
      volume: Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1 ? value.volume : 0.35,
    };
  } catch { return defaults; }
}

export function formatMusicTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '0:00';
  return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}
