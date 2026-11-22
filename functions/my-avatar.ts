interface Env {
  ASSETS: Fetcher;
}

const AVATAR_HEADERS = {
  'Content-Type': 'image/jpeg',
  'Cache-Control': 'public, max-age=86400',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin': '*',
};

/** 公开对外友链头像直链：https://northcedar.top/my-avatar */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const asset = await env.ASSETS.fetch(new URL('/my-avatar.jpg', request.url));
  if (!asset.ok) return new Response('Not Found', { status: 404 });
  return new Response(asset.body, { status: 200, headers: AVATAR_HEADERS });
};

export const onRequestHead: PagesFunction<Env> = async ({ request, env }) => {
  const asset = await env.ASSETS.fetch(new URL('/my-avatar.jpg', request.url), { method: 'HEAD' });
  if (!asset.ok) return new Response(null, { status: 404 });
  return new Response(null, { status: 200, headers: AVATAR_HEADERS });
};
