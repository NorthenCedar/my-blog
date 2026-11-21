import { expect,it } from 'vitest';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createWriterRepository,importPublished } from '../functions/api/_lib/writer-repository';
const commit='1'.repeat(40),sha='2'.repeat(40),text='---\ntitle: 标题\ndate: 2026-10-23\nsummary: 简介\ntags: [随笔]\ndraft: false\n---\n正文\n';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
it('Cloudflare 不支持 redirect:error，使用 manual 并拒绝重定向且不转发令牌',async()=>{
  let calls=0;
  const repo=createWriterRepository('私密测试凭据',async(_url,init)=>{
    calls++;if(init?.redirect!=='manual')throw new TypeError('Invalid redirect value, must be one of follow or manual');
    return json({object:{sha:commit,type:'commit'}});
  });
  expect(await repo.head()).toBe(commit);expect(calls).toBe(1);
  calls=0;
  const redirected=createWriterRepository('私密测试凭据',async(_url,init)=>{calls++;expect(init?.redirect).toBe('manual');return new Response(null,{status:302,headers:{Location:'https://unrelated.example/credential-trap'}});});
  await expect(redirected.head()).rejects.toMatchObject({code:'repository_http_302'});expect(calls).toBe(1);
});
it('导入固定提交的内容，服务端基线和正文真实落库，不接受路径或 ref 注入',async()=>{
  const s=await writerFixture(),seen:string[]=[];
  const transport:typeof fetch=async(url,init)=>{seen.push(String(url));expect(init?.headers).toMatchObject({Authorization:'Bearer 私密测试凭据'});return String(url).endsWith('/git/ref/heads/main')?json({object:{sha:commit,type:'commit'}}):json({type:'file',sha,encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')});};
  const repo=createWriterRepository('私密测试凭据',transport),proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never);
  const opened=await importPublished(repo,s.db,proof,{kind:'post',key:'example'});
  expect(opened.base).toEqual({commit,blobSha:sha,text});expect(opened.value.body).toBe('正文\n');
  expect(seen[1]).toBe(`https://api.github.com/repos/NorthenCedar/personal/contents/content/posts/example/index.md?ref=${commit}`);
  await expect(repo.readPost('main','../../.github')).rejects.toMatchObject({status:400});
  await expect(repo.readImage(commit,'src/../.env')).rejects.toMatchObject({status:400});
});
it('二进制按 base64 解码，不走文本；符号链接被拒绝',async()=>{
  const bytes=Uint8Array.from([255,0,128,13,10,192]);
  const repo=createWriterRepository('secret',async()=>json({type:'file',sha,size:bytes.length,encoding:'base64',content:Buffer.from(bytes).toString('base64')}));
  expect((await repo.readImage(commit,'src/assets/talks/example.webp')).bytes).toEqual(bytes);
  const linked=createWriterRepository('secret',async()=>json({type:'symlink',target:'../../../.env'}));
  await expect(linked.readPost(commit,'example')).rejects.toMatchObject({status:400});
});
it('仅 GET 的 5xx 有限重试，错误不泄露远端正文，派发不重试',async()=>{
  let calls=0;const repo=createWriterRepository('secret',async()=>{calls++;return json({secret:'不应出现'},503);});
  await expect(repo.head()).rejects.toMatchObject({status:502});expect(calls).toBe(3);
  calls=0;await expect(repo.dispatch('a'.repeat(32))).rejects.not.toThrow('不应出现');expect(calls).toBe(1);
});
it('未配置读取凭据明确不可用，大响应被拒绝',async()=>{
  await expect(createWriterRepository('').head()).rejects.toMatchObject({status:503});
  const repo=createWriterRepository('secret',async()=>new Response('a'.repeat(2*1024*1024+1)));
  await expect(repo.head()).rejects.toMatchObject({status:502});
});
