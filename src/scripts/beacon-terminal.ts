import { onPage } from './page-lifecycle';

interface VerifyResponse {
  ok: boolean;
  matched?: [boolean, boolean, boolean, boolean];
  token?: string;
  expiresAt?: number;
  bundleName?: string;
  docs?: Array<{ id: string; title: string }>;
  error?: string;
}

interface SolverEntry {
  rank: number;
  codename: string;
  note: string;
  solvedAt: string;
}

interface SolversResponse {
  total?: number;
  items?: SolverEntry[];
  error?: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  textContent = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent) node.textContent = textContent;
  return node;
}

/** 纯 DOM 渲染行内 Markdown（粗体、行内代码、安全 http(s) 链接），零原始 HTML 拼接。 */
function appendInlineMarkdown(parent: HTMLElement, text: string) {
  const tokenRe = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > last) {
      parent.append(document.createTextNode(text.slice(last, match.index)));
    }
    if (match[1] !== undefined) {
      parent.append(el('code', '', match[1]));
    } else if (match[2] !== undefined) {
      parent.append(el('strong', '', match[2]));
    } else if (match[3] !== undefined && match[4] !== undefined) {
      const a = el('a', '', match[3]);
      a.href = match[4];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      parent.append(a);
    }
    last = tokenRe.lastIndex;
  }
  if (last < text.length) {
    parent.append(document.createTextNode(text.slice(last)));
  }
}

/** 纯 DOM 渲染常见 Markdown（标题、代码块、表格、引用、列表、分隔线、段落），零原始 HTML 拼接。 */
export function renderMarkdownSafe(container: HTMLElement, markdown: string) {
  container.replaceChildren();
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 跳过空行
    if (!line.trim()) {
      i++;
      continue;
    }

    // 围栏代码块
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const pre = el('pre');
      pre.append(el('code', '', codeLines.join('\n')));
      container.append(pre);
      continue;
    }

    // 分隔线
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      container.append(document.createElement('hr'));
      i++;
      continue;
    }

    // 标题
    const hMatch = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hMatch) {
      const level = hMatch[1].length as 1 | 2 | 3 | 4;
      const tag = (`h${level}`) as 'h1' | 'h2' | 'h3' | 'h4';
      const heading = el(tag);
      appendInlineMarkdown(heading, hMatch[2].trim());
      container.append(heading);
      i++;
      continue;
    }

    // 引用块
    if (line.trimStart().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const bq = el('blockquote');
      const p = el('p');
      appendInlineMarkdown(p, quoteLines.join(' '));
      bq.append(p);
      container.append(bq);
      continue;
    }

    // Markdown 表格
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = splitRow(line);
      i += 2;
      const table = el('table');
      const thead = el('thead');
      const headTr = el('tr');
      for (const h of headers) {
        const th = el('th');
        appendInlineMarkdown(th, h);
        headTr.append(th);
      }
      thead.append(headTr);
      table.append(thead);

      const tbody = el('tbody');
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const tr = el('tr');
        for (const cell of splitRow(lines[i])) {
          const td = el('td');
          appendInlineMarkdown(td, cell);
          tr.append(td);
        }
        tbody.append(tr);
        i++;
      }
      table.append(tbody);
      container.append(table);
      continue;
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const ul = el('ul');
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const li = el('li');
        appendInlineMarkdown(li, lines[i].replace(/^\s*[-*]\s+/, ''));
        ul.append(li);
        i++;
      }
      container.append(ul);
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const ol = el('ol');
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const li = el('li');
        appendInlineMarkdown(li, lines[i].replace(/^\s*\d+\.\s+/, ''));
        ol.append(li);
        i++;
      }
      container.append(ol);
      continue;
    }

    // 普通段落
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trimStart().startsWith('>') &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*(?:---+|\*\*\*+)\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    const p = el('p');
    appendInlineMarkdown(p, paraLines.join(' '));
    container.append(p);
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initBeaconTerminal(doc: Document): () => void {
  const root = doc.querySelector<HTMLElement>('[data-beacon-root]');
  if (!root) return () => {};

  const form = root.querySelector<HTMLFormElement>('[data-beacon-form]');
  const keyInput = root.querySelector<HTMLInputElement>('[data-beacon-key]');
  const agreeBox = root.querySelector<HTMLInputElement>('[data-beacon-agree]');
  const submitBtn = root.querySelector<HTMLButtonElement>('[data-beacon-submit]');
  const msgEl = root.querySelector<HTMLElement>('[data-beacon-msg]');
  const statePill = root.querySelector<HTMLElement>('[data-beacon-state]');
  const slots = [...root.querySelectorAll<HTMLElement>('[data-beacon-slot]')];

  const vaultSection = root.querySelector<HTMLElement>('[data-beacon-vault]');
  const dlLink = root.querySelector<HTMLAnchorElement>('[data-beacon-download]');
  const expiryEl = root.querySelector<HTMLElement>('[data-beacon-expiry]');
  const docTabsEl = root.querySelector<HTMLElement>('[data-beacon-doc-tabs]');
  const docBodyEl = root.querySelector<HTMLElement>('[data-beacon-doc-body]');

  const claimForm = root.querySelector<HTMLFormElement>('[data-beacon-claim-form]');
  const codenameInput = root.querySelector<HTMLInputElement>('[data-beacon-codename]');
  const noteInput = root.querySelector<HTMLInputElement>('[data-beacon-note]');
  const claimBtn = root.querySelector<HTMLButtonElement>('[data-beacon-claim-btn]');
  const claimMsg = root.querySelector<HTMLElement>('[data-beacon-claim-msg]');

  const totalEls = [...root.querySelectorAll<HTMLElement>('[data-beacon-total]')];
  const boardList = root.querySelector<HTMLElement>('[data-beacon-board]');

  let currentToken = '';
  let currentExpiresAt = 0;
  let countdownTimer = 0;
  const docCache = new Map<string, string>();
  const cleanups: (() => void)[] = [];

  const listen = (target: EventTarget | null, event: string, fn: EventListener) => {
    if (!target) return;
    target.addEventListener(event, fn);
    cleanups.push(() => target.removeEventListener(event, fn));
  };

  function setMsg(node: HTMLElement | null, text: string, tone: '' | 'ok' | 'err' = '') {
    if (!node) return;
    node.textContent = text;
    if (tone) node.dataset.tone = tone;
    else delete node.dataset.tone;
  }

  function updateSlotPreview(raw: string, matched?: [boolean, boolean, boolean, boolean]) {
    const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
    const segs = cleaned.split('-').filter(Boolean);
    const parts = segs[0] === 'BEACON' ? segs.slice(1) : segs;
    slots.forEach((slot, idx) => {
      const valNode = slot.querySelector<HTMLElement>('[data-slot-val]');
      if (valNode) valNode.textContent = parts[idx] || '-----';
      if (matched) {
        slot.dataset.status = matched[idx] ? 'ok' : 'err';
      } else {
        delete slot.dataset.status;
      }
    });
  }

  function renderBoard(total: number, items: SolverEntry[]) {
    for (const node of totalEls) node.textContent = String(total);
    if (!boardList) return;
    boardList.replaceChildren();
    if (!items.length) {
      const empty = el('li', 'beacon-board-row');
      empty.append(el('span', 'beacon-rank', '#0'), el('span', 'beacon-note', '虚位以待——还没有人留下通关信号，也许你就是第一位。'));
      boardList.append(empty);
      return;
    }
    for (const item of items) {
      const li = el('li', 'beacon-board-row');
      li.append(
        el('span', 'beacon-rank', `#${item.rank}`),
        el('span', 'beacon-codename', item.codename),
        el('span', 'beacon-note', item.note || '已捕获信标'),
        el('span', 'beacon-time', formatDate(item.solvedAt)),
      );
      boardList.append(li);
    }
  }

  async function loadBoard() {
    try {
      const res = await fetch('/api/beacon/solvers', { cache: 'no-store' });
      const data = (await res.json()) as SolversResponse;
      if (res.ok) renderBoard(Number(data.total ?? 0), data.items ?? []);
    } catch {
      // 静态预览无后端时静默降级
    }
  }

  function updateCountdown() {
    if (!expiryEl || !currentExpiresAt) return;
    const remainSec = Math.max(0, Math.floor((currentExpiresAt - Date.now()) / 1000));
    if (remainSec <= 0) {
      expiryEl.textContent = '本次临时下载凭证已过期，请重新点击校验获取新凭证';
      if (countdownTimer) {
        window.clearInterval(countdownTimer);
        countdownTimer = 0;
      }
      return;
    }
    const min = Math.floor(remainSec / 60);
    const sec = remainSec % 60;
    expiryEl.textContent = `临时签名凭证有效期剩余 ${min} 分 ${String(sec).padStart(2, '0')} 秒（私有 R2 直传，不暴露永久链接）`;
  }

  async function selectDocTab(docId: string) {
    if (!docTabsEl || !docBodyEl || !currentToken) return;
    for (const btn of docTabsEl.querySelectorAll<HTMLButtonElement>('[data-doc-id]')) {
      btn.setAttribute('aria-selected', btn.dataset.docId === docId ? 'true' : 'false');
    }
    const cached = docCache.get(docId);
    if (cached !== undefined) {
      renderMarkdownSafe(docBodyEl, cached);
      return;
    }
    docBodyEl.replaceChildren(el('p', '', '正在从私有存储读取说明文档…'));
    try {
      const res = await fetch(
        `/api/beacon/doc?name=${encodeURIComponent(docId)}&t=${encodeURIComponent(currentToken)}`,
        { cache: 'no-store' },
      );
      const data = (await res.json()) as { ok?: boolean; markdown?: string; error?: string };
      if (!res.ok || !data.ok || typeof data.markdown !== 'string') {
        docBodyEl.replaceChildren(el('p', '', data.error || '文档读取失败，请重新校验口令'));
        return;
      }
      docCache.set(docId, data.markdown);
      renderMarkdownSafe(docBodyEl, data.markdown);
    } catch {
      docBodyEl.replaceChildren(el('p', '', '网络异常，暂时无法加载在线预览'));
    }
  }

  listen(keyInput, 'input', () => {
    updateSlotPreview(keyInput?.value ?? '');
  });

  listen(form, 'submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const rawKey = (keyInput?.value ?? '').trim();
      if (!agreeBox?.checked) {
        setMsg(msgEl, '请先勾选下方实验环境与合法学习声明。', 'err');
        return;
      }
      if (!rawKey) {
        setMsg(msgEl, '请输入四段拼装口令，例如 BEACON-XXXX-XXXX-XXXX-XXXX。', 'err');
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      setMsg(msgEl, '正在与服务端核验四段信标摘要…');

      try {
        const res = await fetch('/api/beacon/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
          body: JSON.stringify({ key: rawKey, agreed: true }),
        });
        const data = (await res.json()) as VerifyResponse;
        if (data.matched) updateSlotPreview(rawKey, data.matched);

        if (!res.ok || !data.ok || !data.token) {
          setMsg(msgEl, data.error || '口令校验未通过。', 'err');
          return;
        }

        currentToken = data.token;
        currentExpiresAt = Number(data.expiresAt ?? Date.now() + 15 * 60 * 1000);
        docCache.clear();

        if (statePill) {
          statePill.dataset.unlocked = 'true';
          statePill.textContent = 'CARRIER UNLOCKED';
        }
        setMsg(msgEl, '四段信标全部命中！学习包下载与文档在线预览已解锁。', 'ok');

        if (dlLink) {
          dlLink.href = `/api/beacon/download?t=${encodeURIComponent(currentToken)}`;
          dlLink.download = data.bundleName || 'beacon-framework-bundle.zip';
        }
        if (vaultSection) vaultSection.hidden = false;

        if (countdownTimer) window.clearInterval(countdownTimer);
        updateCountdown();
        countdownTimer = window.setInterval(updateCountdown, 1000);

        if (docTabsEl && Array.isArray(data.docs) && data.docs.length) {
          docTabsEl.replaceChildren();
          data.docs.forEach((d, idx) => {
            const btn = el('button', 'beacon-tab', d.title);
            btn.type = 'button';
            btn.dataset.docId = d.id;
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
            btn.addEventListener('click', () => {
              void selectDocTab(d.id);
            });
            docTabsEl.append(btn);
          });
          void selectDocTab(data.docs[0].id);
        }

        if (claimBtn) claimBtn.disabled = false;
        setMsg(claimMsg, '现在可以留下匿名代号，记录你的通关序号（也可留空直接登记）。');
        void loadBoard();
      } catch {
        setMsg(msgEl, '无法连接到校验服务，请稍后再试。', 'err');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    })();
  });

  listen(claimForm, 'submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      if (!currentToken) {
        setMsg(claimMsg, '请先通过信标口令校验。', 'err');
        return;
      }
      if (claimBtn) claimBtn.disabled = true;
      setMsg(claimMsg, '正在登记通关序号…');
      try {
        const res = await fetch('/api/beacon/solvers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
          body: JSON.stringify({
            token: currentToken,
            codename: codenameInput?.value ?? '',
            note: noteInput?.value ?? '',
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          alreadyClaimed?: boolean;
          entry?: SolverEntry;
          total?: number;
          error?: string;
        };
        if (res.ok && data.ok && data.entry) {
          setMsg(
            claimMsg,
            `登记成功！你是第 ${data.entry.rank} 位捕获信标的探索者（代号：${data.entry.codename}）。`,
            'ok',
          );
          if (codenameInput) codenameInput.value = '';
          if (noteInput) noteInput.value = '';
          void loadBoard();
        } else {
          setMsg(claimMsg, data.error || '登记失败，请稍后重试。', 'err');
          if (!data.alreadyClaimed && claimBtn) claimBtn.disabled = false;
        }
      } catch {
        setMsg(claimMsg, '网络异常，请稍后重试。', 'err');
        if (claimBtn) claimBtn.disabled = false;
      }
    })();
  });

  cleanups.push(() => {
    if (countdownTimer) window.clearInterval(countdownTimer);
  });

  void loadBoard();
  return () => {
    for (const fn of cleanups) fn();
  };
}

onPage(() => initBeaconTerminal(document));
