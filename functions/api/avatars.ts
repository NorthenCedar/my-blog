import type { VisitorEnv } from './_lib/visitor-store';

export const onRequestGet: PagesFunction<VisitorEnv> = async ({ request, env }) => {
  const url = new URL(request.url), id = url.searchParams.get('id') ?? '', version = url.searchParams.get('v') ?? '';
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" };
  if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{32}$/.test(version)) return new Response('', { status: 404, headers });
  try {
    const row = await env.COMMENTS_DB.prepare('SELECT avatar_blob FROM visitor_accounts WHERE id = ? AND avatar_version = ?').bind(id, version).first<{ avatar_blob: number[] | ArrayBuffer }>();
    // D1 的 BLOB 查询结果是数字数组；Response 需要真实字节，而非可迭代数字。
    const bytes = row?.avatar_blob ? new Uint8Array(row.avatar_blob) : null;
    return bytes ? new Response(bytes, { headers: { ...headers, 'Content-Type': 'image/png' } }) : new Response('', { status: 404, headers });
  } catch { return new Response('', { status: 503, headers }); }
};
