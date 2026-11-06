import {deflateSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
import {glassVector} from './glass-profile.mjs';
// 几何位移数据，无照片、截图或运行时绘制循环。
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
function png(width,height){
  const rows=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [dx,dy]=glassVector(x+.5,y+.5,width,height),i=y*(width*4+1)+1+x*4;
    rows[i]=Math.round((.5+dx*.5*height/width)*255);rows[i+1]=Math.round((.5+dy*.5)*255);rows[i+2]=128;rows[i+3]=255;
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir(new URL('../public/glass/',import.meta.url),{recursive:true});
for(const [name,width,height]of [['circle',44,44],['pill',96,40],['player',224,52]]){
  await writeFile(new URL('../public/glass/'+name+'.png',import.meta.url),png(width,height));
}
console.log('已生成圆形、短胶囊和播放器的边缘位移图');
