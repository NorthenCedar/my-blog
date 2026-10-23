const invalid=(message='请选择 JPEG、PNG 或静态 WebP 图片')=>{throw new Error(message);};
export function inspectInputImage(bytes:Uint8Array){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),tag=(p:number,n=4)=>String.fromCharCode(...bytes.subarray(p,p+n));let width=0,height=0;
  if(bytes.length>=24&&tag(0,8)==='\x89PNG\r\n\x1a\n'){
    width=view.getUint32(16);height=view.getUint32(20);
    for(let p=8;p+8<=bytes.length;){const n=view.getUint32(p);if(p+n+12>bytes.length)invalid('PNG 文件不完整');if(tag(p+4)==='acTL')invalid('暂不接收动画图片');p+=n+12;}
  }else if(bytes.length>=20&&tag(0)==='RIFF'&&tag(8)==='WEBP'){
    if(view.getUint32(4,true)+8!==bytes.length) invalid('WebP 文件不完整');
    const u24=(p:number)=>bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16;
    for(let p=12;p+8<=bytes.length;){const type=tag(p),n=view.getUint32(p+4,true),s=p+8;if(s+n>bytes.length)invalid();
      if(type==='ANIM'||type==='ANMF'||type==='VP8X'&&(bytes[s]&2))invalid('暂不接收动画图片');
      if(type==='VP8X'&&n>=10){width=u24(s+4)+1;height=u24(s+7)+1;}
      if(type==='VP8 '&&n>=10){width=view.getUint16(s+6,true)&0x3fff;height=view.getUint16(s+8,true)&0x3fff;}
      if(type==='VP8L'&&n>=5){const bits=view.getUint32(s+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
      p=s+n+(n%2);
    }
  }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    for(let p=2;p+4<=bytes.length;){if(bytes[p++]!==255)invalid();while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
      const n=view.getUint16(p);if(n<2||p+n>bytes.length)invalid('JPEG 文件不完整');
      if(marker===0xe2&&tag(p+2)==='MPF\0') invalid('暂不接收多帧 JPEG');
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(n<7)invalid();height=view.getUint16(p+3);width=view.getUint16(p+5);}
      p+=n;
    }
  }else invalid();
  if(!width||!height||width*height>40_000_000)invalid('图片不能超过 4000 万像素，请先裁剪或缩小');
  return {width,height};
}
export async function prepareWriterImage(file:File|Blob){
  if(file.size>20*1024*1024)invalid('原图不能超过 20 MiB，请先缩小');
  inspectInputImage(new Uint8Array(await file.arrayBuffer()));
  let image:ImageBitmap|HTMLImageElement,temporary:string|undefined;
  try{image=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{
    temporary=URL.createObjectURL(file);image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('浏览器无法解码这张图片，请换一张'));img.src=temporary!;}).catch(error=>{URL.revokeObjectURL(temporary!);throw error;});
  }
  try{
    const rawWidth=image.width,rawHeight=image.height;if(!rawWidth||!rawHeight||rawWidth*rawHeight>40_000_000)invalid('图片解码尺寸超限');
    const scale=Math.min(1,1920/Math.max(rawWidth,rawHeight)),width=Math.max(1,Math.round(rawWidth*scale)),height=Math.max(1,Math.round(rawHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)invalid('浏览器无法处理图片');context.drawImage(image,0,0,width,height);
    for(const quality of [.9,.82,.72,.6]){
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
      if(!blob||blob.type!=='image/webp')invalid('浏览器不支持 WebP 压缩，请换用较新的浏览器');
      if(blob.size<=300*1024)return {blob,width,height,previewUrl:URL.createObjectURL(blob),originalSize:file.size};
    }
    return invalid('压缩后仍超过 300 KiB，请先裁剪、缩小或选择更简单的图片');
  }finally{if('close'in image)image.close();if(temporary)URL.revokeObjectURL(temporary);}
}
