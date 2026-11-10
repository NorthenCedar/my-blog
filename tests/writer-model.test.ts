import { expect,it } from 'vitest';
import { validateTarget,validateWriterValue } from '../src/lib/writer/model';

it.each(['../../.git','a/b','a\\b','a%2fb','UPPER','a--b','a'.repeat(61)])('内容标识拒绝路径越界 %s',key=>{
  expect(()=>validateTarget('post',key)).toThrow();
});
it('按 UTF-8 字节而不是汉字数量限制草稿，且不截断正文',()=>{
  const value={fields:{},body:'字'.repeat(44000),assets:[]};
  expect(()=>validateWriterValue('post',value)).toThrow();
  expect(value.body.length).toBe(44000);
});
it('结构异常、素材摘要不合法和过多配图被拒绝',()=>{
  for(const value of [null,{}, {fields:[],body:'文',assets:[]},{fields:{},body:'文',assets:[{sha256:'../x',alt:'图'}]}, {fields:{},body:'文',assets:Array.from({length:10},()=>({sha256:'a'.repeat(64),alt:'图'}))}]) {
    expect(()=>validateWriterValue('talk',value)).toThrow();
  }
});
it('未完成的草稿可以留空标题和图说，内容与视频等未知字段保持',()=>{
  const value={fields:{title:'',videos:[{src:'/videos/existing.mp4',alt:'旧视频'}]},body:'未写完',assets:[{sha256:'a'.repeat(64),alt:''}]};
  expect(validateWriterValue('post',value)).toEqual({...value,audios:[]});
});
it('已发布配图保留原引用，下一次编辑只对新配图计数',()=>{
  const assets=Array.from({length:21},(_,n)=>({sha256:n.toString(16).padStart(64,'0'),alt:'图'})),base={commit:'1'.repeat(40),blobSha:'2'.repeat(40),text:'![已有图](./writer-'+assets[0].sha256+'.webp)'};
  expect(validateWriterValue('post',{fields:{},body:'正文',assets},base).assets).toHaveLength(21);
  expect(()=>validateWriterValue('post',{fields:{},body:'正文',assets})).toThrow();
});
