/**
 * 邮件提醒投递层（Resend HTTP API，全在服务端运行，零前端第三方请求）：
 *   · 发件人默认 bluehour@northcedar.top；
 *   · 站主收件邮箱默认 a13655515876@163.com（收全站新评论 / 留言 / 说说评论 / 回复 / 友链申请）；
 *   · 被回复者从 visitor_emails（已绑定账户）或 comment_emails（匿名选填）解析；
 *   · 失败只记日志，绝不拖垮或阻塞发表请求。
 */
import { noticeHref, type NoticeTarget } from './notices';
import { accountEmail, type VisitorEnv } from './visitor-store';

export const DEFAULT_MAIL_FROM = '北杉札记 <bluehour@northcedar.top>';
export const DEFAULT_OWNER_NOTIFY_EMAIL = 'a13655515876@163.com';
export const DEFAULT_SITE_ORIGIN = 'https://northcedar.top';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const QUOTE_MAX = 140;

type MailPayload = {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  quoteLabel?: string;
  quote?: string;
  bodyLabel: string;
  body: string;
  ctaLabel: string;
  url: string;
};

const forgiveMissingEmailTable = (error: unknown) =>
  /no such table:\s*(visitor_emails|comment_emails|comment_authors|comments|replies)/i.test(String(error));

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function placeLabel(slug: string): string {
  if (slug === 'guestbook') return '留言板';
  if (slug.startsWith('talk-')) return '说说';
  return '文章评论';
}

function fullUrl(env: VisitorEnv, href: string): string {
  const origin = (env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
  return `${origin}${href.startsWith('/') ? href : `/${href}`}`;
}

function ownerEmailOf(env: VisitorEnv): string {
  return (env.OWNER_NOTIFY_EMAIL || DEFAULT_OWNER_NOTIFY_EMAIL).trim().toLowerCase();
}

function clip(text: string, max = QUOTE_MAX): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** 构造纯文本 + HTML 双版本邮件正文（所有用户输入均严格转义）。 */
function renderMail(mail: MailPayload): { text: string; html: string } {
  const textParts = [
    mail.heading,
    '',
    mail.intro,
    '',
    ...(mail.quote ? [`${mail.quoteLabel ?? '原内容'}：${mail.quote}`, ''] : []),
    `${mail.bodyLabel}：\n${mail.body}`,
    '',
    `${mail.ctaLabel}：${mail.url}`,
    '',
    '—— 北杉札记 (northcedar.top)',
  ];
  const quoteBlock = mail.quote
    ? `<div style="margin:14px 0;padding:10px 12px;border-left:3px solid #2d7d46;background:#f4f7f4;color:#4a554c;font-size:13px;line-height:1.6;">
        <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(mail.quoteLabel ?? '原内容')}</div>
        <div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(mail.quote)}</div>
      </div>`
    : '';
  const html = `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:24px;background:#f6f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1f2721;">
    <div style="max-width:560px;margin:0 auto;padding:24px;border:1px solid #dde3dc;border-radius:14px;background:#ffffff;">
      <p style="margin:0 0 8px;font-size:12px;color:#5f6b61;letter-spacing:0.04em;">北杉札记 · 消息通知</p>
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.4;color:#18211a;">${escapeHtml(mail.heading)}</h2>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#334036;">${escapeHtml(mail.intro)}</p>
      ${quoteBlock}
      <div style="margin:14px 0;padding:12px 14px;border:1px solid #e4e9e3;border-radius:10px;background:#fbfcfa;">
        <div style="font-size:12px;color:#5f6b61;margin-bottom:6px;">${escapeHtml(mail.bodyLabel)}</div>
        <div style="font-size:14px;line-height:1.7;color:#18211a;white-space:pre-wrap;word-break:break-word;">${escapeHtml(mail.body)}</div>
      </div>
      <p style="margin:18px 0 0;">
        <a href="${escapeHtml(mail.url)}" style="display:inline-block;padding:9px 16px;border-radius:8px;background:#2d7d46;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(mail.ctaLabel)}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#748076;word-break:break-all;">直达链接：${escapeHtml(mail.url)}</p>
    </div>
  </body>
</html>`;
  return { text: textParts.join('\n'), html };
}

export async function sendEmail(
  env: VisitorEnv,
  mail: MailPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey || !mail.to) return false;
  const { text, html } = renderMail(mail);
  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || DEFAULT_MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('resend email failed', response.status, detail.slice(0, 200));
    }
    return response.ok;
  } catch (error) {
    console.error('resend email error', error);
    return false;
  }
}

/** 匿名发表留存选填邮箱，仅用于收到回复时发信。 */
export async function saveCommentEmail(
  env: VisitorEnv,
  kind: 'comment' | 'reply',
  commentId: number,
  email: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || commentId <= 0) return;
  try {
    await env.COMMENTS_DB.prepare(
      'INSERT INTO comment_emails (kind, comment_id, email) VALUES (?, ?, ?) ' +
        'ON CONFLICT(kind, comment_id) DO UPDATE SET email = excluded.email',
    )
      .bind(kind, commentId, normalized)
      .run();
  } catch (error) {
    if (!forgiveMissingEmailTable(error)) console.error('save comment email failed', error);
  }
}

async function resolveTargetRecipient(
  env: VisitorEnv,
  target: NoticeTarget,
): Promise<{ userId: string | null; email: string }> {
  try {
    const owner = await env.COMMENTS_DB.prepare(
      'SELECT user_id FROM comment_authors WHERE kind = ? AND comment_id = ? LIMIT 1',
    )
      .bind(target.kind, target.id)
      .first<{ user_id: string }>();
    if (owner?.user_id) {
      return { userId: owner.user_id, email: (await accountEmail(env, owner.user_id)).trim().toLowerCase() };
    }
    const anon = await env.COMMENTS_DB.prepare(
      'SELECT email FROM comment_emails WHERE kind = ? AND comment_id = ? LIMIT 1',
    )
      .bind(target.kind, target.id)
      .first<{ email: string }>();
    return { userId: null, email: anon?.email?.trim().toLowerCase() ?? '' };
  } catch (error) {
    if (!forgiveMissingEmailTable(error)) console.error('resolve target recipient failed', error);
    return { userId: null, email: '' };
  }
}

async function resolveTargetQuote(env: VisitorEnv, target: NoticeTarget): Promise<string> {
  try {
    const sql =
      target.kind === 'comment'
        ? 'SELECT body FROM comments WHERE id = ? LIMIT 1'
        : 'SELECT body FROM replies WHERE id = ? LIMIT 1';
    const row = await env.COMMENTS_DB.prepare(sql).bind(target.id).first<{ body: string }>();
    return row?.body ? clip(row.body) : '';
  } catch (error) {
    if (!forgiveMissingEmailTable(error)) console.error('resolve target quote failed', error);
    return '';
  }
}

/** 顶层留言/评论：仅在非站主发言时给站主收件邮箱发通知。 */
export async function notifyCommentEmail(
  env: VisitorEnv,
  options: {
    slug: string;
    parentId: number;
    actorName: string;
    actorEmail?: string;
    body: string;
    skipOwner?: boolean;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (options.parentId <= 0 || options.skipOwner) return;
  const ownerTo = ownerEmailOf(env);
  if (!ownerTo || (options.actorEmail && options.actorEmail.trim().toLowerCase() === ownerTo)) return;
  const place = placeLabel(options.slug);
  const actionWord = options.slug === 'guestbook' ? '写了新留言' : '发表了新评论';
  const url = fullUrl(env, noticeHref(options.slug, options.parentId, null));
  await sendEmail(
    env,
    {
      to: ownerTo,
      subject: `「北杉札记」${place}：${options.actorName} ${actionWord}`,
      heading: `${place}收到一条${options.slug === 'guestbook' ? '新留言' : '新评论'}`,
      intro: `${options.actorName} 在${place}（${options.slug}）${actionWord}：`,
      bodyLabel: '留言内容',
      body: options.body,
      ctaLabel: '前往查看',
      url,
    },
    fetchImpl,
  );
}

/** 回复通知：同时按需发给被回复人（账户或匿名选填邮箱）与站主（去重、不自发自收）。 */
export async function notifyReplyEmails(
  env: VisitorEnv,
  options: {
    slug: string;
    parentId: number;
    replyId: number;
    actorName: string;
    actorId: string | null;
    actorEmail?: string;
    body: string;
    target: NoticeTarget;
    skipOwner?: boolean;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (options.parentId <= 0 || options.replyId <= 0) return;
  const url = fullUrl(env, noticeHref(options.slug, options.parentId, options.replyId));
  const place = placeLabel(options.slug);
  const [recipient, quote] = await Promise.all([
    resolveTargetRecipient(env, options.target),
    resolveTargetQuote(env, options.target),
  ]);

  let actorEmail = options.actorEmail?.trim().toLowerCase() ?? '';
  if (!actorEmail && options.actorId) {
    actorEmail = (await accountEmail(env, options.actorId)).trim().toLowerCase();
  }

  const sentTo = new Set<string>();
  const sameUser = Boolean(recipient.userId && options.actorId && recipient.userId === options.actorId);
  const sameEmail = Boolean(recipient.email && actorEmail && recipient.email === actorEmail);
  const ownerTo = ownerEmailOf(env);
  const replyHitsOwner = Boolean(recipient.email && recipient.email === ownerTo);

  if (recipient.email && !sameUser && !sameEmail && !(options.skipOwner && replyHitsOwner)) {
    sentTo.add(recipient.email);
    await sendEmail(
      env,
      {
        to: recipient.email,
        subject: `「北杉札记」${options.actorName} 回复了你的${place === '留言板' ? '留言' : '评论'}`,
        heading: `${options.actorName} 回复了你`,
        intro: `${options.actorName} 在「北杉札记 · ${place}」回复了你：`,
        quoteLabel: '你的原内容',
        quote,
        bodyLabel: '回复内容',
        body: options.body,
        ctaLabel: '查看回复',
        url,
      },
      fetchImpl,
    );
  }

  if (!options.skipOwner && ownerTo && !sentTo.has(ownerTo)) {
    await sendEmail(
      env,
      {
        to: ownerTo,
        subject: `「北杉札记」${place}有新回复 · ${options.actorName}`,
        heading: `${place}收到一条新回复`,
        intro: `${options.actorName} 在${place}（${options.slug}）回复了一条内容：`,
        quoteLabel: '被回复内容',
        quote,
        bodyLabel: '回复内容',
        body: options.body,
        ctaLabel: '前往查看',
        url,
      },
      fetchImpl,
    );
  }
}

/** 友链新申请通知站主。 */
export async function notifyLinkApplyEmail(
  env: VisitorEnv,
  options: { applicationId: number; name: string; href: string; desc: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (options.applicationId <= 0) return;
  const ownerTo = ownerEmailOf(env);
  if (!ownerTo) return;
  const url = fullUrl(env, noticeHref('link-apply', -options.applicationId, null));
  await sendEmail(
    env,
    {
      to: ownerTo,
      subject: `「北杉札记」收到新的友链申请 · ${options.name}`,
      heading: '收到一条新的友链申请',
      intro: `${options.name} 提交了友链申请：`,
      bodyLabel: '申请信息',
      body: `站点名称：${options.name}\n站点链接：${options.href}\n一句话简介：${options.desc}`,
      ctaLabel: '去友链收件箱处理',
      url,
    },
    fetchImpl,
  );
}

/** 将邮件发送挂入 waitUntil，绝不阻塞主请求也避免测试出现未捕获拒绝。 */
export function runBackgroundMail(
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
  task: Promise<unknown>,
): void {
  const safe = task.catch((error) => console.error('background mail task failed', error));
  if (typeof waitUntil === 'function') waitUntil(safe);
  else void safe;
}
