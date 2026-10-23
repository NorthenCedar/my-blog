import { expect,it } from 'vitest';
import sharp from 'sharp';
import { inspectInputImage,prepareWriterImage } from '../src/scripts/writer/images';
it('JPEG、PNG、WebP 解码之前读取真实尺寸，不相信扩展名',async()=>{
  const image=sharp({create:{width:17,height:23,channels:4,background:'#aa998880'}});
  for(const bytes of [await image.clone().png().toBuffer(),await image.clone().jpeg().withMetadata({orientation:6}).toBuffer(),await image.clone().webp().toBuffer()])expect(inspectInputImage(new Uint8Array(bytes))).toEqual({width:17,height:23});
  expect(()=>inspectInputImage(new TextEncoder().encode('<svg/>'))).toThrow();
});
it('超原图字节、超解码像素和动画头在创建位图之前拒绝',async()=>{
  const png=new Uint8Array(await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).png().toBuffer());
  const large=png.slice(),view=new DataView(large.buffer);view.setUint32(16,10000);view.setUint32(20,10000);expect(()=>inspectInputImage(large)).toThrow('4000 万像素');
  const animation=png.slice();animation.set(new TextEncoder().encode('acTL'),12);expect(()=>inspectInputImage(animation)).toThrow('动画');
  await expect(prepareWriterImage(new Blob([new Uint8Array(20*1024*1024+1)]))).rejects.toThrow('20 MiB');
});
