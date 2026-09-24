import { getEntry } from 'astro:content';

export type Site = {
  name: string;
  wordmark: string;
  intro: string;
  metaDescription: string;
  email: string;
  github: string;
};

/**
 * 站点文案的唯一来源：content/site.md。
 * 主题（src/）不持有任何正文 —— 改站名、改简介、改页脚联系方式都只改那个文件。
 */
export async function getSite(): Promise<Site> {
  const entry = await getEntry('site', 'site');
  if (!entry) {
    throw new Error('缺少 content/site.md —— 它是站点文案的唯一来源（站名/简介/meta/联系方式）');
  }
  return entry.data as Site;
}
