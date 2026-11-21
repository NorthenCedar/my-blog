import { recordPageview, type PageviewEnv } from './api/_lib/pageviews';
import { browserHeaders } from '../src/lib/browser-security.mjs';
import documentCsp from './api/_generated/document-csp.json';

/** 统计直接访问，并为经过 Functions 的页面和接口补响应头。 */
export const onRequest: PagesFunction<PageviewEnv> = async (context) => {
  const { request, next } = context;
  const api = new URL(request.url).pathname.startsWith('/api/');
  const mode = request.headers.get('Sec-Fetch-Mode');
  const dest = request.headers.get('Sec-Fetch-Dest');
  const purpose = request.headers.get('Sec-Purpose') ?? request.headers.get('Purpose') ?? '';
  const wantsDocument =
    request.method === 'GET' &&
    !api &&
    (request.headers.get('Accept') ?? '').includes('text/html') &&
    (mode === null || mode === 'navigate') &&
    (dest === null || dest === 'document') &&
    !/\bprefetch\b/i.test(purpose);

  let response = await next();
  const html = /^text\/html(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '');
  if (wantsDocument && response.status === 200 && html) response = recordPageview(context, response);
  if (!html && !api) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(browserHeaders)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (html && headers.get('Content-Security-Policy') !== documentCsp) headers.append('Content-Security-Policy', documentCsp);
  if (api) {
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
