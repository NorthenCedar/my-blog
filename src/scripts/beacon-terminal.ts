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
    if (!line.trim()) {
      i++;
      continue;
    }

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

    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      container.append(document.createElement('hr'));
      i++;
      continue;
    }

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

/** 极克制的地下信号流背景（十六进制素数遥测），遵循 prefers-reduced-motion。 */
function mountMatrixCanvas(doc: Document): () => void {
  const canvas = doc.querySelector<HTMLCanvasElement>('[data-beacon-matrix]');
  if (!canvas) return () => {};
  const win = doc.defaultView ?? window;
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return () => {};
  }
  if (!ctx) return () => {};

  const glyphs = '0123456789ABCDEF·:∞+';
  let cols = 0;
  let drops: number[] = [];
  let rafId = 0;
  let lastDraw = 0;

  const resize = () => {
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    const w = win.innerWidth || 1280;
    const h = win.innerHeight || 800;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(12, Math.floor(w / 34));
    drops = Array.from({ length: cols }, (_, idx) => ((idx * 17) % Math.max(10, Math.floor(h / 24))));
    ctx!.fillStyle = '#030605';
    ctx!.fillRect(0, 0, w, h);
  };

  const drawFrame = (now: number) => {
    if (!ctx) return;
    if (now - lastDraw >= 95) {
      lastDraw = now;
      const w = win.innerWidth || 1280;
      const h = win.innerHeight || 800;
      ctx.fillStyle = 'rgba(3, 6, 5, 0.14)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '12px "IBM Plex Mono", ui-monospace, monospace';
      for (let i = 0; i < cols; i++) {
        if (i % 2 === 1 && ((i + Math.floor(now / 1200)) % 3 === 0)) continue;
        const ch = glyphs[(Math.floor(drops[i] * 3 + i * 7)) % glyphs.length];
        const x = i * 34 + 10;
        const y = drops[i] * 22;
        ctx.fillStyle = i % 7 === 0 ? 'rgba(216, 167, 74, 0.34)' : 'rgba(57, 255, 136, 0.24)';
        ctx.fillText(ch, x, y);
        drops[i] = y > h + 40 ? 0 : drops[i] + 0.55;
      }
    }
    if (!reduced) rafId = win.requestAnimationFrame(drawFrame);
  };

  resize();
  drawFrame(0);
  if (!reduced) rafId = win.requestAnimationFrame(drawFrame);
  win.addEventListener('resize', resize);
  return () => {
    win.removeEventListener('resize', resize);
    if (rafId) win.cancelAnimationFrame(rafId);
  };
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
  const logEl = root.querySelector<HTMLElement>('[data-beacon-log]');
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
  const cleanups: (() => void)[] = [mountMatrixCanvas(doc)];

  const listen = (target: EventTarget | null, event: string, fn: EventListener) => {
    if (!target) return;
    target.addEventListener(event, fn);
    cleanups.push(() => target.removeEventListener(event, fn));
  };

  function appendLog(text: string, level: 'sys' | 'gold' | 'ok' | 'err' = 'sys') {
    if (!logEl) return;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const line = el('p', 'beacon-log-line', `[${ts}] ${text}`);
    line.dataset.level = level;
    logEl.append(line);
    while (logEl.childElementCount > 18) {
      logEl.firstElementChild?.remove();
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

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
      empty.append(
        el('span', 'beacon-rank', '#000'),
        el('span', 'beacon-note', 'NO OPERATOR REGISTERED YET // 首位捕获信标的席位正虚位以待。'),
      );
      boardList.append(empty);
      return;
    }
    for (const item of items) {
      const li = el('li', 'beacon-board-row');
      const rankNode = el('span', 'beacon-rank', `#${String(item.rank).padStart(3, '0')}`);
      if (item.rank === 1) rankNode.dataset.first = 'true';
      li.append(
        rankNode,
        el('span', 'beacon-codename', item.codename),
        el('span', 'beacon-note', item.note || 'SIGNAL CAPTURED'),
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
      expiryEl.textContent = 'HMAC 临时凭证已过期，请重新执行 VERIFY KEY 签发新令牌';
      if (countdownTimer) {
        window.clearInterval(countdownTimer);
        countdownTimer = 0;
      }
      return;
    }
    const min = Math.floor(remainSec / 60);
    const sec = remainSec % 60;
    expiryEl.textContent = `SIGNED TOKEN TTL: ${min}m ${String(sec).padStart(2, '0')}s // 私有 R2 直传通道`;
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
    docBodyEl.replaceChildren(el('p', '', '>> FETCHING PRIVATE R2 DOCUMENT...'));
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
      appendLog(`<< DECRYPTED MANUAL STREAM: ${docId.toUpperCase()}`, 'ok');
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
        setMsg(msgEl, '请先勾选下方实验环境与合法学习协议确认。', 'err');
        appendLog('!! HANDSHAKE ABORTED: PROTOCOL ACK REQUIRED', 'err');
        return;
      }
      if (!rawKey) {
        setMsg(msgEl, '请输入四段拼装口令，例如 BEACON-XXXX-XXXX-XXXX-XXXX。', 'err');
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      setMsg(msgEl, '正在与服务端核验四段信标摘要…');
      appendLog('>> TRANSMITTING 4-SEGMENT DIGEST TO /api/beacon/verify ...', 'gold');

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
          appendLog(`!! REJECTED: ${data.error || 'INVALID KEY'}`, 'err');
          return;
        }

        currentToken = data.token;
        currentExpiresAt = Number(data.expiresAt ?? Date.now() + 15 * 60 * 1000);
        docCache.clear();
        root.dataset.unlocked = 'true';

        if (statePill) {
          statePill.dataset.unlocked = 'true';
          statePill.textContent = 'CARRIER UNLOCKED';
        }
        setMsg(msgEl, '四段信标全部命中！私有存储流与离线手册在线预览已解锁。', 'ok');
        appendLog('++ ACCESS GRANTED: ALL 4 SEGMENTS VERIFIED // R2 VAULT ARMED', 'ok');

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
        setMsg(claimMsg, '现在可以留下匿名代号记入通关者名录（留空也可直接登记）。');
        void loadBoard();
      } catch {
        setMsg(msgEl, '无法连接到校验服务，请稍后再试。', 'err');
        appendLog('!! UPLINK FAILURE: CANNOT REACH /api/beacon/verify', 'err');
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
      setMsg(claimMsg, '正在写入通关者名录…');
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
            `登记完成！你是第 #${String(data.entry.rank).padStart(3, '0')} 位捕获信标的探索者（${data.entry.codename}）。`,
            'ok',
          );
          appendLog(`++ OPERATOR REGISTERED: #${String(data.entry.rank).padStart(3, '0')} ${data.entry.codename}`, 'ok');
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
