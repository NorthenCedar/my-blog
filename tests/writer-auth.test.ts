import { describe, expect, it } from 'vitest';
import { writerFixture } from './_writer';
import { onRequestGet } from '../functions/api/writer/session';
import { requireWriter } from '../functions/api/_lib/writer-auth';

const call = (request: Request, env: unknown) => onRequestGet({ request, env } as never);
describe('写作台站主边界', () => {
  it('站主只能读到写作所需身份和能力，不包含凭据', async () => {
    const s = await writerFixture(); const r = await call(s.request(), s.env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toMatchObject({ user: { id:s.owner, nickname:'站主' }, capabilities:{ drafts:true, publish:false } });
  });
  it.each([{owner:false,status:403},{cookie:false,status:401},{configured:false,status:503},{expires:1,status:401}])('拒绝无权限状态 %#', async ({status,...options}) => {
    const s = await writerFixture(options); const r = await call(s.request('/session?isOwner=true'),s.env);
    expect(r.status).toBe(status); expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.text()).not.toMatch(/password_hash|recovery_hash|未使用的测试/);
  });
  it('正式站点以外的预览域名不能读生产数据', async () => {
    const s = await writerFixture(); const r=await call(new Request('https://preview.personal.pages.dev/api/writer/session',{headers:{Cookie:`__Host-nc_session=${s.token}`}}),s.env);
    expect(r.status).toBe(403);
  });
  it('重复会话 Cookie 与跨站读取均拒绝', async () => {
    const s=await writerFixture();
    expect((await call(s.request('/session','GET',undefined,{Cookie:`__Host-nc_session=${s.token}; __Host-nc_session=${s.token}`}),s.env)).status).toBe(401);
    expect((await call(s.request('/session','GET',undefined,{'Sec-Fetch-Site':'cross-site'}),s.env)).status).toBe(403);
    expect((await call(s.request('/session','GET',undefined,{'Sec-Fetch-Site':'same-site'}),s.env)).status).toBe(403);
    expect((await call(s.request('/session','GET',undefined,{Origin:'null'}),s.env)).status).toBe(403);
  });
  it('写入需要同源与请求标记，本地开发需要服务端显式开关',async()=>{
    const s=await writerFixture();
    await expect(requireWriter(s.request('/drafts','POST',{}, {'X-NC-Request':''}),s.env,true)).rejects.toMatchObject({status:403});
    await expect(requireWriter(s.request('/drafts','POST',{}, {Origin:'null'}),s.env,true)).rejects.toMatchObject({status:403});
    const local=new Request('http://127.0.0.1:4338/api/writer/session',{headers:{Cookie:`nc_session_dev=${s.token}`}});
    expect((await call(local,s.env)).status).toBe(403);
    expect((await call(local,{...s.env,WRITER_LOCAL_DEV:'1'})).status).toBe(200);
  });
});
