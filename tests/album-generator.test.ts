import {it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

it('实际生成器接受单图写作台JSON、隔离空草稿并移除草稿旧产物，图片宽度是真尺寸',async()=>{
 const root=await mkdtemp(resolve('.qa-album-build-'));
 try{
  for(const folder of ['scripts','src/lib','content/gallery/新册','content/gallery/草稿','public/gallery/草稿'])await mkdir(join(root,folder),{recursive:true});
  for(const file of ['scripts/gen-gallery-webp.mjs','src/lib/album-options.mjs','src/lib/album-files.mjs','src/lib/album-source.mjs','src/lib/album-presentation.mjs'])await copyFile(file,join(root,file));
  await writeFile(join(root,'package.json'),' {"type":"module"}');
  await sharp({create:{width:12,height:18,channels:3,background:'#234567'}}).png().toFile(join(root,'content/gallery/新册/my photo.png'));
  await writeFile(join(root,'content/gallery/新册/index.md'),'---\n"title": "单图: 新册"\n"date": "2026-11-01"\n"cover": "./my photo.png"\n"layout": "wall"\n"presentation": {"arrangement":"right","transition":"perspective","stroke":"corner","weight":"regular"}\n"images": [{"src":"./my photo.png","alt":"有空格的文件名"}]\n---\n');
  await writeFile(join(root,'content/gallery/草稿/index.md'),'---\n"draft": true\n"images": []\n---\n');
  await writeFile(join(root,'public/gallery/草稿/01-123456789abc-800.webp'),'旧公开图片');
  execFileSync(process.execPath,[join(root,'scripts/gen-gallery-webp.mjs')],{cwd:root,encoding:'utf8'});
  const manifest=JSON.parse(await readFile(join(root,'public/gallery/manifest.json'),'utf8'));
  expect(manifest.albums).toHaveLength(1);expect(manifest.albums[0]).toMatchObject({title:'单图: 新册',total:1,cover:'./my photo.png',layout:'wall',presentation:{transition:'perspective'}});
  expect(manifest.albums[0].frames[0].files.every(file=>file.actualW===12&&file.h===18)).toBe(true);
  expect(manifest.home.shots).toHaveLength(3);expect(manifest.home.total).toBe(1);
  expect(await readdir(join(root,'public/gallery/草稿'))).toEqual([]);
 }finally{
  // 仅删除本测试 mkdtemp 得到且位于当前隔离仓库内的目录。
  if(!root.startsWith(resolve('.qa-album-build-')))throw Error('测试清理范围不匹配');
  await rm(root,{recursive:true,force:true});
 }
});
