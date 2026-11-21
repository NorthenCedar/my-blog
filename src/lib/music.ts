import { MUSIC_API } from './music-provider.mjs';

export const MUSIC_PLAYLIST = '18562297354';
export { MUSIC_API };
export type MusicTrack = { id: string; title: string; artist: string };

export function orderMusicTracks(tracks: MusicTrack[], baseline: readonly string[]) {
  const ranks = new Map(baseline.map((id, index) => [id, index]));
  return tracks.toSorted((a, b) => (ranks.get(a.id) ?? -1) - (ranks.get(b.id) ?? -1));
}

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
  const defaults = { id: '', time: 0, volume: 0.35, shuffle: true };
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return defaults;
    return {
      id: typeof value.id === 'string' && /^\d+$/.test(value.id) ? value.id : '',
      time: Number.isFinite(value.time) && value.time >= 0 ? value.time : 0,
      volume: Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1 ? value.volume : 0.35,
      shuffle: typeof value.shuffle === 'boolean' ? value.shuffle : true,
    };
  } catch { return defaults; }
}

export class MusicQueue {
  private count = 0;
  private bag: number[] = [];
  private history: number[] = [];

  constructor(private random = Math.random) {}

  reset(count: number) {
    this.count = count;
    this.bag = [];
    this.history = [];
  }

  record(index: number) {
    this.bag = this.bag.filter(item => item !== index);
    if (this.history.at(-1) !== index) this.history.push(index);
    if (this.history.length > 100) this.history.shift();
  }

  next(current: number, shuffle: boolean) {
    if (this.count < 2) return 0;
    if (!shuffle) return (current + 1) % this.count;
    if (!this.bag.length) {
      this.bag = Array.from({ length: this.count }, (_, i) => i).filter(i => i !== current);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  previous(current: number, shuffle: boolean) {
    if (this.count < 2) return 0;
    if (!shuffle) return (current - 1 + this.count) % this.count;
    if (this.history.at(-1) === current) this.history.pop();
    return this.history.pop() ?? current;
  }
}

export function formatMusicTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '0:00';
  return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}
