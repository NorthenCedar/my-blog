// 标签注册表 —— 校验的唯一事实来源。
// content-model.md §4 是它的人类可读镜像；加标签先在这里加，
// 并确保至少有一篇文章用它（tests/post-meta.test.ts 会守住"每个标签都有文章"）。
export const TAGS = ['AI', '建站', '摄影', '成长', '随笔', '钢琴', '教程', '工具'] as const;
export type Tag = (typeof TAGS)[number];
