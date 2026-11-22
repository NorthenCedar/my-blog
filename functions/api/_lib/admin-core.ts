/**
 * 留言**管理**接口的纯函数层 —— 鉴权、参数校验、评论树组装。
 *
 * 为什么要单独一层（照 comments-core / reactions-core 的样子）：
 *   · 这里最容易出"看不出来的错" —— 密钥比对写成短路、级联删除漏掉范围、
 *     孤儿回复挂错父级；而这三件事**都不需要 D1 / Request**，可以在 vitest 里直接钉住；
 *   · 适配器 `functions/api/admin/comments.ts` 里就只剩"取参 → 调 core → 拼 Response"。
 *
 * ⚠️ 这个文件**只许被 `functions/` 与 `tests/` import**。
 * 别从 `src/` 引 —— 那会把服务端代码（含鉴权逻辑）整份打进浏览器产物，
 * comments-core 末尾记过同一笔账（当时多出约 3 KB，直接顶爆 JS 预算）。
 */
import { toRecord, toReplyRecord, type CommentRecord, type ReplyRecord } from './comments-core';

/**
 * 管理列表一次最多取多少条顶层评论。
 * 与公开接口 `comments.ts` 的 `LIMIT 200` 同档：**取的是最新的 200 条**。
 */
export const ADMIN_LIST_LIMIT = 200;
export const ADMIN_REPLIES_LIMIT = 2000;

export type { CommentRecord, ReplyRecord };

// ─────────────────────────────── 鉴权 ───────────────────────────────

export type AuthResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * 定长字节比较：长度差先并进结果，再逐字节异或累加，**全程不提前 return**。
 * 提前 `return false` 会按"前几个字节对上了"泄漏时间差 —— 虽然这点差异在公网上
 * 基本测不出来，但写对它的成本是零，就没理由写错。
 */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

const sha256 = async (s: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/**
 * 密钥比对：**先各自 SHA-256 再比**。
 * 摘要恒为 32 字节 ⇒ "两个密钥长度不一样"这件事从比较里消失了
 * （直接逐字节比的话，长度差异本身就是一条可测的信道）。
 *
 * 这里不做 KDF（PBKDF2 之类）：对端是一台自己的机器、不是用户口令，
 * 每次请求多算几万轮哈希只会拖慢自己的写作台，挡不住任何真实攻击者。
 * 真正该守的是"密钥必须够长够随机" —— 见本文件末尾的口径。
 */
export async function secretMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  return bytesEqual(a, b);
}

/** 从 `Authorization` 头里取 Bearer 令牌。没有 / 不是 Bearer → 空串。 */
export function bearerToken(header: string | null): string {
  const m = /^Bearer[ \t]+(.+)$/i.exec((header ?? '').trim());
  return m ? m[1].trim() : '';
}

/**
 * 鉴权。**fail closed**：密钥没配（`undefined` / 空串 / 全空格）一律拒绝。
 *
 * 为什么这条要写在最顶上：环境变量漏配是**最容易发生**的部署事故，
 * 而它的默认后果要么是"接口打不开"（可用性问题，能忍）、
 * 要么是"谁都能删留言"（安全问题，不能忍）。这两种后果里必须钉死是前者。
 * 和写作台侧 `lib/config.py` 的 `_admin()` 是同一条政策。
 */
export async function verifyAdmin(
  header: string | null,
  expected: string | undefined
): Promise<AuthResult> {
  const want = (expected ?? '').trim();
  if (want === '') {
    return { ok: false, status: 500, error: '服务端没有配置 ADMIN_TOKEN，管理接口已关闭' };
  }
  const got = bearerToken(header);
  if (got === '') {
    return { ok: false, status: 401, error: '缺少管理密钥（Authorization: Bearer <密钥>）' };
  }
  // 密钥错与密钥缺**分开报**：这不是泄漏 —— 请求方知不知道"自己带没带头"是一目了然的
  // （自己发的包），而写作台要能把这两种情况在界面上说清楚。
  if (!(await secretMatches(got, want))) {
    return { ok: false, status: 401, error: '管理密钥不对' };
  }
  return { ok: true };
}

// ─────────────────────────────── 删除参数 ───────────────────────────────

/** `comment` = 顶层留言（连带它的回复一起删）；`reply` = 单条回复。 */
export type DeleteKind = 'comment' | 'reply';
export type DeleteInput = { id: number; kind: DeleteKind };
export type DeleteValidation = { ok: true; value: DeleteInput } | { ok: false; error: string };

/**
 * 校验并归一化删除参数。
 *
 * · `id` **必须是安全正整数** —— 这个数字要拼进 SQL，字符串 `"3"` / 小数 / 负数 / NaN 一律拒。
 *   （适配器负责把 query 里的字符串转成数字，转不出来就是 `NaN`，在这里被拒。）
 * · `kind` 缺省按 `comment` —— 写作台的早期版本只发 `{id}`，不能因为少一个字段就拒掉。
 * · **不做 slug 校验**：id 在各自表里全局唯一，多带一个 slug 只会多一处"对错了也不知道"的输入。
 *   级联删除也只按 id 走（父 id 唯一 ⇒ 不可能删到别的页面去）。
 */
export function parseDeleteInput(input: unknown): DeleteValidation {
  if (typeof input !== 'object' || input === null) return { ok: false, error: '请求格式不对' };
  const o = input as Record<string, unknown>;

  const id = o.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, error: '要删除的留言 id 不合法' };
  }

  const raw = o.kind;
  if (raw !== undefined && raw !== null && raw !== '') {
    if (raw !== 'comment' && raw !== 'reply') return { ok: false, error: '未知的删除类型' };
  }
  return { ok: true, value: { id, kind: raw === 'reply' ? 'reply' : 'comment' } };
}

// ─────────────────────────────── 列表组装 ───────────────────────────────

/** D1 里 `comments` 表的一行（多一个 slug：管理列表要跨页面显示）。 */
export type CommentRow = {
  id: number;
  slug: string;
  name: string;
  body: string;
  created_at: string;
};

export type AdminComment = CommentRecord & { slug: string; replies: ReplyRecord[] };

/** snake_case 行 → 带 slug 的 camelCase（snake→camel 的规则只认 comments-core 那一个定义）。 */
export function toAdminComment(row: CommentRow): CommentRecord & { slug: string } {
  return { ...toRecord(row), slug: row.slug };
}

export type ReplyRow = {
  id: number;
  parent_id: number;
  reply_to: string | null;
  name: string;
  body: string;
  created_at: string;
};

export const toAdminReply = toReplyRecord;

/**
 * 把"顶层数组 + 回复数组"两份查询结果拼成写作台要的 `{items:[{…, replies:[…]}]}`。
 *
 * 两条与前端一致的规则（`src/scripts/reply-common.ts` 的 `groupReplies` 同款）：
 *   · 顺序**原样保留**（顶层新的在前、回复旧的在上，都由 SQL 的 ORDER BY 决定，
 *     这里不做二次排序 —— 排序口径只能有一个地方定义）；
 *   · **孤儿回复丢弃** —— 父不在这批里（被删了 / 被 LIMIT 截掉）的回复挂不上去，
 *     硬塞给谁都会渲染成一条没有上下文的孤零零的话。
 */
export function buildCommentTree(
  comments: Array<CommentRecord & { slug: string }>,
  replies: ReplyRecord[]
): AdminComment[] {
  const buckets = new Map<number, ReplyRecord[]>();
  for (const c of comments) buckets.set(c.id, []); // 没有回复的顶层也给一个空数组，前端不必再判空
  for (const r of replies) {
    const bucket = buckets.get(r.parentId);
    if (bucket) bucket.push(r);
  }
  return comments.map((c) => ({ ...c, replies: buckets.get(c.id) ?? [] }));
}

// ⚠️ 一条口径（写在这里，免得后来人在别处"顺手加固"）：
//   密钥强度**不做长度校验**。`ADMIN_TOKEN` 只由站主自己设，写死一个下限
//   （比如"至少 24 位"）挡不住任何东西 —— 真配短了它也只是自欺。
//   该做的是：用 `openssl rand -hex 32` 之类的随机串，且**两边填同一个值**
//   （Cloudflare 项目环境变量 + 写作台「设置 → 留言管理密钥」）。
//   抗暴力破解靠 Cloudflare 侧的速率限制（面板配置，不在代码里）。
