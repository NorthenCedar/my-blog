import { BODY_CONTROL_OR_BIDI_RE, CONTROL_OR_BIDI_RE, UNSAFE_NAME_RE } from './comments-core';
import { hex, randomToken, text } from './visitor-core';
import type { VisitorEnv } from './visitor-store';

export interface BeaconEnv extends VisitorEnv {
  BEACON_VAULT?: R2Bucket;
  BEACON_SIGNING_KEY?: string;
  BEACON_HASHES?: string;
}

export const BEACON_BUNDLE_KEY = 'beacon-framework-bundle.zip';
export const BEACON_BUNDLE_FILENAME = 'beacon-framework-bundle.zip';
export const BEACON_TOKEN_TTL_MS = 15 * 60 * 1000;
export const BEACON_VERIFY_RATE_MAX = 12;
export const BEACON_CLAIM_RATE_MAX = 6;
export const BEACON_SOLVERS_LIMIT = 30;

export const BEACON_DOCS = {
  readme: {
    id: 'readme',
    key: 'docs/beacon-framework-README.md',
    title: '框架总览与部署说明 · beacon-framework-README.md',
  },
  'local-deploy': {
    id: 'local-deploy',
    key: 'docs/local-deploy.md',
    title: '单机实验部署指南 · 本机单机部署.md',
  },
} as const;

export type BeaconDocId = keyof typeof BEACON_DOCS;

const encoder = new TextEncoder();

export const beaconJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export function equalHex(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return hex(sig);
}

export interface ParsedBeaconKey {
  canonical: string;
  parts: [string, string, string, string];
}

export function parseBeaconKey(raw: unknown): ParsedBeaconKey | null {
  const cleaned = text(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned || cleaned.length > 120) return null;
  const segments = cleaned.split('-').filter(Boolean);
  let parts: string[];
  if (segments.length === 5 && segments[0] === 'BEACON') {
    parts = segments.slice(1);
  } else if (segments.length === 4) {
    parts = segments;
  } else {
    return null;
  }
  if (!parts.every((p) => /^[A-Z0-9]{2,24}$/.test(p))) return null;
  const tuple = parts as [string, string, string, string];
  return {
    canonical: `BEACON-${tuple.join('-')}`,
    parts: tuple,
  };
}

export interface StoredBeaconHashes {
  s: [string, string, string, string];
  m: string;
}

const HEX64_RE = /^[a-f0-9]{64}$/;

export function parseStoredHashes(raw: string | undefined): StoredBeaconHashes | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredBeaconHashes>;
    if (!parsed || !Array.isArray(parsed.s) || parsed.s.length !== 4 || typeof parsed.m !== 'string') {
      return null;
    }
    const stages = parsed.s.map((v) => String(v).toLowerCase());
    const master = parsed.m.toLowerCase();
    if (!stages.every((v) => HEX64_RE.test(v)) || !HEX64_RE.test(master)) return null;
    return {
      s: stages as [string, string, string, string],
      m: master,
    };
  } catch {
    return null;
  }
}

export async function verifyBeaconKey(
  parsed: ParsedBeaconKey,
  signingKey: string,
  stored: StoredBeaconHashes,
): Promise<{ ok: boolean; matched: [boolean, boolean, boolean, boolean] }> {
  const stageDigests = await Promise.all(
    parsed.parts.map((part, idx) => hmacHex(signingKey, `stage:${idx + 1}:${part}`)),
  );
  const masterDigest = await hmacHex(signingKey, `master:${parsed.canonical}`);
  const matched = stageDigests.map((d, idx) => equalHex(d, stored.s[idx])) as [
    boolean,
    boolean,
    boolean,
    boolean,
  ];
  const allStages = matched[0] && matched[1] && matched[2] && matched[3];
  const masterOk = equalHex(masterDigest, stored.m);
  return { ok: allStages && masterOk, matched };
}

export async function signUnlockToken(
  signingKey: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number; nonce: string }> {
  const expiresAt = now + BEACON_TOKEN_TTL_MS;
  const nonce = randomToken(12); // 24 hex chars
  const body = `v1.${expiresAt}.${nonce}`;
  const sig = await hmacHex(signingKey, `unlock:${body}`);
  return { token: `${body}.${sig}`, expiresAt, nonce };
}

export async function verifyUnlockToken(
  rawToken: unknown,
  signingKey: string,
  now = Date.now(),
): Promise<{ ok: true; nonce: string; expiresAt: number } | { ok: false; error: string }> {
  const token = text(rawToken).trim();
  const match = /^(v1\.(\d{13})\.([a-f0-9]{24}))\.([a-f0-9]{64})$/.exec(token);
  if (!match) return { ok: false, error: '解锁凭证格式无效，请重新校验口令' };
  const body = match[1];
  const expiresAt = Number(match[2]);
  const nonce = match[3];
  const sig = match[4];
  const expected = await hmacHex(signingKey, `unlock:${body}`);
  if (!equalHex(sig, expected)) return { ok: false, error: '解锁凭证校验失败，请重新校验口令' };
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, error: '解锁凭证已过期（有效期 15 分钟），请重新输入口令获取' };
  }
  return { ok: true, nonce, expiresAt };
}

export function validateSolverClaim(payload: Record<string, unknown>):
  | { ok: true; value: { codename: string; note: string } }
  | { ok: false; error: string } {
  const rawName = text(payload.codename).trim();
  const codename = rawName || '匿名信号';
  if ([...codename].length > 24 || CONTROL_OR_BIDI_RE.test(codename)) {
    return { ok: false, error: '代号最多 24 个字符，且不能包含控制字符' };
  }
  if (UNSAFE_NAME_RE.test(codename)) {
    return { ok: false, error: '代号不能包含尖括号或脚本片段' };
  }

  const note = text(payload.note).trim();
  if ([...note].length > 80 || BODY_CONTROL_OR_BIDI_RE.test(note)) {
    return { ok: false, error: '留言最多 80 个字符，且不能包含控制字符' };
  }
  if (UNSAFE_NAME_RE.test(note)) {
    return { ok: false, error: '留言不能包含尖括号或脚本片段' };
  }

  return { ok: true, value: { codename, note } };
}

export async function ensureBeaconSolversTable(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS beacon_solvers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_nonce TEXT NOT NULL UNIQUE,
      codename TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      solved_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_beacon_solvers_id ON beacon_solvers (id DESC)`),
  ]);
}
