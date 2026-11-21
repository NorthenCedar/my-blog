import { recordPageview, type PageviewEnv } from './_lib/pageviews';
import { guardEmptyBody, guardSameOrigin } from './_lib/public-write';
import { AccountError } from './_lib/visitor-core';

/** 客户端报告实际落页和恢复，只接受同源的空正文请求。 */
export const onRequestPost: PagesFunction<PageviewEnv> = async (context) => {
  const { request } = context;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    guardSameOrigin(request, true);
    await guardEmptyBody(request);
  } catch (error) {
    if (error instanceof AccountError) return new Response(null, { status: error.status, headers });
    throw error;
  }
  return recordPageview(context, new Response(null, { status: 204, headers }));
};
