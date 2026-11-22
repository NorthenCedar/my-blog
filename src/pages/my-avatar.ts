import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRoute } from 'astro';

const avatarBytes = readFileSync(join(process.cwd(), 'public', 'my-avatar.jpg'));

export const GET: APIRoute = () =>
  new Response(avatarBytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
    },
  });
