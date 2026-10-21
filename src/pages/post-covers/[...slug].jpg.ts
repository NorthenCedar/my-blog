import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';

export const prerender = true;
export const getStaticPaths: GetStaticPaths = async () => (await getCollection('posts'))
  .filter(entry => !entry.data.draft && entry.data.cover)
  .map(entry => ({ params: { slug: entry.data.slug ?? entry.id }, props: { entry } }));

/** 只读本篇公开文章的封面；不扫描或复制其他文章目录。 */
export const GET: APIRoute = async ({ props }) => {
  const entry = props.entry as CollectionEntry<'posts'>;
  const directory = resolve('content/posts', entry.id);
  const file = resolve(directory, entry.data.cover!);
  if (!file.startsWith(directory + sep)) throw new Error(`文章 ${entry.id} 的封面必须在本篇目录内`);
  const tokens = await readFile('src/styles/tokens.css', 'utf8');
  const paper = tokens.match(/--paper:\s*(#[0-9a-fA-F]{6})\b/)?.[1];
  if (!paper) throw new Error('文章分享封面缺少纸色变量');
  const image = await sharp(await readFile(file)).rotate().resize({ width: 1200, withoutEnlargement: true }).flatten({ background: paper }).jpeg({ quality: 85 }).toBuffer();
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/jpeg' } });
};
