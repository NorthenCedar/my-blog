// 回复的共享渲染与表单（文章页 / 留言页 comments.ts 与说说页 talks.ts 共用）。
//
// 抽出来的三个理由：
//   ① 三条路径的回复交互必须**一模一样**（站主 2026-09-28："说说、留言、文章评论都能回复"），
//      抄两份迟早会长歪（顺序、文案、引用格式各写各的）；
//   ② 文章页有 JS 硬预算，共用比各写一份省（这里是唯一能省出字节的地方）；
//   ③ 分组逻辑（含孤儿回复处理）放在能被 import 的地方，测试才能直接断言它。
//
// 安全铁律同其它脚本：**任何地方都不用 innerHTML**，用户输入一律 textContent。
//
// ⚠️ 不要从 functions/ 下 import 任何东西：那会把后端 core 整包拖进浏览器产物
//（实测文章页 JS 从 5177 涨到 8310，直接顶爆预算）。需要共用的纯函数就写在这个文件里。

import { authorNode, identityControls, type Authored } from './visitor-client';
const replyIdentityCleanup = new WeakMap<Element, () => void>();
const removeReplyForm = (form: Element) => { replyIdentityCleanup.get(form)?.(); replyIdentityCleanup.delete(form); form.remove(); };

export type Reply = Authored & {
  id: number;
  parentId: number;
  replyTo: string;
  name: string;
  body: string;
  createdAt: string;
};

/** 建元素的糖：省掉满屏的 createElement + className + textContent 三连 */
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 把回复按所属顶层评论分组。**孤儿回复（父不在当前这批里）直接丢弃** ——
 * 挂到顶层会变成一条没有上下文的孤零零的留言，比不显示更糟（父掉出 LIMIT 200 时就会遇到）。
 * 每个有效父都给一个（可能为空的）数组，前端就不必再判空。
 */
export function groupReplies<T extends { parentId: number }>(
  replies: readonly T[],
  parentIds: readonly number[]
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const id of parentIds) out.set(id, []);
  for (const r of replies) out.get(r.parentId)?.push(r);
  return out;
}

export const parentIdsOf = (rows: { id: number }[]) => rows.map((r) => r.id);

/** 提交一条（顶层评论或回复都走这里）：非 2xx 一律把服务端的中文原因抛出去 */
export async function postComment(payload: Record<string, unknown>, isCurrent?: () => boolean): Promise<Reply> {
  const r = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
    body: JSON.stringify(payload),
  });
  const b = (await r.json().catch(() => ({}))) as { comment?: Reply; error?: string };
  if (r.status === 401 && payload.identity === 'account' && isCurrent?.() !== false) {
    window.dispatchEvent(new Event('visitor-session-expired'));
  }
  if (!r.ok || !b.comment) throw new Error(b.error || '没发出去，稍后再试。');
  return b.comment;
}

/** 「这条回复是回给谁的」—— 提醒功能靠它把提醒落到具体账户上（见 functions/api/_lib/notices.ts） */
export type ReplyTarget = { kind: 'comment' | 'reply'; id: number };

/**
 * 一条回复的 <li>：显示成「名字 回复 某人 · 时间」+ 正文。
 * 有 replyTo 才显示"回复 某人"（直接回复顶层时不显示）。
 * 层级永远**两层**（站主拍板）：回复一条回复时 parentId 仍指向顶层，只靠 replyTo 记名字
 * ⇒ 无论被回复多少次都不会缩进成第三层。
 * 回复采用独立锚点，评论与回复的编号分别自增。
 */
export function replyLi(r: Reply, onReply: () => void, fresh = false): HTMLLIElement {
  const li = el('li', 'reply-item');
  li.id = `reply-${r.id}`;
  li.dataset.replyId = String(r.id);
  // A / B 都是用户输入 ⇒ 用 textContent 写，绝不拼 HTML
  const meta = el('p', 'reply-meta');
  meta.append(authorNode(r, 'reply'), document.createTextNode(`${r.replyTo ? ` 回复 ${r.replyTo}` : ''} · ${fmtTime(r.createdAt)}${fresh ? ' · 刚发表' : ''}`));
  const body = el('p', 'reply-body', r.body);
  const btn = el('button', 'reply-btn', '回复');
  btn.type = 'button';
  btn.addEventListener('click', onReply);
  li.append(meta, body, btn);
  return li;
}

/**
 * 打开/关闭某条顶层评论下的回复表单（一次只开一个；再点一次「回复」是收起）。
 * `replyTo` 是被回复者的名字：留空 = 直接回复顶层，有值 = 渲染成「A 回复 B」。
 */
export function toggleReplyForm(
  list: HTMLElement,
  li: HTMLElement,
  ctx: { slug: string; parentId: number; replyTo: string; target?: ReplyTarget; name: () => string; onAdded: (reply: Reply) => void; isCurrent?: () => boolean }
): void {
  const isCurrent = ctx.isCurrent ?? (() => true);
  if (!isCurrent()) return;
  const open = li.querySelector(':scope > .reply-form');
  list.querySelectorAll('.reply-form').forEach(removeReplyForm);
  if (open) return;

  const box = li.querySelector<HTMLElement>(':scope > .reply-list')!;
  const form = el('form', 'reply-form');
  form.noValidate = true;

  const name = el('input', 'reply-name');
  name.type = 'text';
  name.name = 'name';
  name.maxLength = 40;
  name.autocomplete = 'nickname';
  name.placeholder = '名字';
  name.required = true;
  name.value = ctx.name(); // 上面填过就不用再填一次

  const body = el('textarea', 'reply-body-input');
  body.rows = 2;
  body.maxLength = 1000;
  body.placeholder = '写下你的回复…';
  body.required = true;

  // 蜜罐：**每个**表单都要有 —— 机器人盯的是"能提交的表单"，只给主表单加等于给回复留后门
  const hp = el('div', 'hp');
  hp.setAttribute('aria-hidden', 'true');
  const hpInput = el('input');
  hpInput.type = 'text';
  hpInput.tabIndex = -1;
  hpInput.autocomplete = 'off';
  hp.append(hpInput);

  const send = el('button', 'reply-send', '发表');
  send.type = 'submit';
  const cancel = el('button', 'reply-cancel', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => removeReplyForm(form));
  const error = el('p', 'reply-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  form.append(name, body, hp, send, cancel, error);
  replyIdentityCleanup.set(form, identityControls(form, isCurrent));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isCurrent() || send.disabled) return;
    error.hidden = true;
    send.disabled = true;
    postComment({
      slug: ctx.slug,
      parentId: ctx.parentId,
      replyTo: ctx.replyTo,
      name: name.value,
      identity: String(new FormData(form).get('identity') ?? 'anonymous'),
      body: body.value,
      website: hpInput.value,
      // 回的是哪一条（顶层评论 or 某条回复）—— 服务端据此把提醒落到被回复者账户上
      replyTarget: ctx.target ?? { kind: 'comment', id: ctx.parentId },
    }, isCurrent)
      .then((r) => {
        if (!isCurrent()) return;
        // 回复按**旧的在上**（站主 2026-09-28 拍板，对话要顺着读）⇒ append，不是 prepend
        if (!box.querySelector(`:scope > li[data-reply-id="${r.id}"]`)) {
          box.append(replyLi(r, () => toggleReplyForm(list, li, { ...ctx, replyTo: r.name, target: { kind: 'reply', id: r.id } })));
        }
        removeReplyForm(form);
        ctx.onAdded(r);
      })
      .catch((err: Error) => {
        if (!isCurrent() || !form.isConnected) return;
        error.textContent = err.message;
        error.hidden = false;
      })
      .finally(() => {
        if (isCurrent() && form.isConnected) send.disabled = false;
      });
  });

  li.append(form);
  body.focus();
}
