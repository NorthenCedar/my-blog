/** 兼容旧账户的图案标识；旧 silence 记录映射到白面鸮，无需迁移数据库。 */
export const DEFAULT_AVATARS = [
  { id: 'helix', title: '双螺旋', group: '科幻图案', url: '/avatars/helix.svg' },
  { id: 'orbit', title: '星轨', group: '科幻图案', url: '/avatars/orbit.svg' },
  { id: 'infinity', title: '无限环', group: '科幻图案', url: '/avatars/infinity.svg' },
  { id: 'leaf', title: '多萝西', group: 'Q 版', url: '/avatars/dorothy-comic.png' },
  { id: 'flask', title: '白面鸮', group: 'Q 版', url: '/avatars/ptilopsis-comic.png' },
  { id: 'crystal', title: '缪尔赛思', group: 'Q 版', url: '/avatars/muelsyse-comic.png' },
  { id: 'dorothy', title: '多萝西', group: '游戏立绘', url: '/avatars/dorothy-fate.png' },
  { id: 'ptilopsis', title: '白面鸮', group: '游戏立绘', url: '/avatars/ptilopsis-quiescence.png' },
  { id: 'muelsyse', title: '缪尔赛思', group: '游戏立绘', url: '/avatars/muelsyse-golden.png' },
] as const;

export const defaultAvatarUrl = (id: string) => DEFAULT_AVATARS.find(avatar => avatar.id === (id === 'silence' ? 'ptilopsis' : id))?.url ?? '/avatars/helix.svg';
