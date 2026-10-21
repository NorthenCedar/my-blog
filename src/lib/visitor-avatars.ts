/** 旧账户保留 leaf / flask / crystal 标识；图片改成对应人物，无需迁移数据库。 */
export const DEFAULT_AVATARS = [
  { id: 'helix', title: '双螺旋', group: '科幻图案', url: '/avatars/helix.svg' },
  { id: 'orbit', title: '星轨', group: '科幻图案', url: '/avatars/orbit.svg' },
  { id: 'infinity', title: '无限环', group: '科幻图案', url: '/avatars/infinity.svg' },
  { id: 'leaf', title: '多萝西', group: 'Q 版', url: '/avatars/dorothy-chibi.png' },
  { id: 'flask', title: '赫默', group: 'Q 版', url: '/avatars/silence-chibi.png' },
  { id: 'crystal', title: '缪尔赛思', group: 'Q 版', url: '/avatars/muelsyse-chibi.png' },
  { id: 'dorothy', title: '多萝西', group: '游戏立绘', url: '/avatars/dorothy.png' },
  { id: 'silence', title: '赫默', group: '游戏立绘', url: '/avatars/silence.png' },
  { id: 'muelsyse', title: '缪尔赛思', group: '游戏立绘', url: '/avatars/muelsyse.png' },
] as const;

export const defaultAvatarUrl = (id: string) => DEFAULT_AVATARS.find(avatar => avatar.id === id)?.url ?? '/avatars/helix.svg';
