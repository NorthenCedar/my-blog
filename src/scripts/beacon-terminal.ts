interface VerifyResponse {
  ok: boolean;
  matched?: [boolean, boolean, boolean, boolean];
  token?: string;
  expiresAt?: number;
  bundleName?: string;
  docs?: Array<{ id: string; title: string }>;
  isOwner?: boolean;
  rank?: number | null;
  codename?: string;
  total?: number;
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

const RULE = '------------------------------------------------------------';

const STAGE_HINTS: Record<string, string> = {
  '1': '[01] 文章页按 F12 -> Network 刷新看主文档响应头 X-Beacon-Signal，或 Ctrl+U 看末尾 HTML 注释；按文中「独立通道」数量算偏移量做 Caesar 逆推。',
  '2': '[02] 下载 PNG 后先查元数据（Comment 文本块），再按提示用 unzip / 7z / binwalk 或直接改后缀为 .zip 提取追加在 IEND 之后的压缩载荷。',
  '3': '[03] 下载 WAV 先听低频慢速摩斯电码，再拖进 Audacity（切频谱图视图）或 Sonic Visualiser 查看 6 kHz - 13 kHz 线性频段。',
  '4': '[04] 访问任意不存在的站内路径触发 404 页，查看源码末尾注释，按配方从 /about/ 与 /resources/ 拼出 17 位全大写英文密钥做 Vigenere 解密。',
};

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

function looksLikeKey(raw: string): boolean {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  const segs = cleaned.split('-').filter(Boolean);
  if (segs.length === 5 && segs[0] === 'BEACON') return segs.slice(1).every((s) => /^[A-Z0-9]{2,24}$/.test(s));
  if (segs.length === 4) return segs.every((s) => /^[A-Z0-9]{2,24}$/.test(s));
  return false;
}

export function initBeaconTerminal(doc: Document): () => void {
  const root = doc.querySelector<HTMLElement>('[data-beacon-root]');
  const out = doc.querySelector<HTMLElement>('[data-term-output]');
  const form = doc.querySelector<HTMLFormElement>('[data-term-form]');
  const ps1 = doc.querySelector<HTMLElement>('[data-term-ps1]');
  const input = doc.querySelector<HTMLInputElement>('[data-term-input]');
  const idleBlock = doc.querySelector<HTMLElement>('[data-term-block]');
  if (!root || !out || !form || !ps1 || !input) return () => {};

  const syncIdleCursor = () => {
    const empty = input.value.length === 0;
    input.dataset.empty = empty ? 'true' : 'false';
    if (idleBlock) idleBlock.hidden = !empty;
  };

  const DEFAULT_PS1 = 'beacon@northcedar:~$';
  const CONFIRM_PS1 = 'confirm [y/N]>';

  let currentToken = '';
  let currentExpiresAt = 0;
  let currentBundle = 'beacon-framework-bundle.zip';
  let pendingKey = '';
  let busy = false;
  const docCache = new Map<string, string>();
  const history: string[] = [];
  let histIdx = -1;
  const cleanups: (() => void)[] = [];

  const listen = (target: EventTarget, event: string, fn: EventListener) => {
    target.addEventListener(event, fn);
    cleanups.push(() => target.removeEventListener(event, fn));
  };

  function scrollBottom() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
  }

  function print(text: string, variant: '' | 'hi' | 'dim' = '') {
    const cls = variant === 'hi' ? 'term-line term-hi' : variant === 'dim' ? 'term-line term-dim' : 'term-line';
    out!.append(el('p', cls, text));
    scrollBottom();
  }

  function printSpacer() {
    out!.append(el('div', 'term-spacer'));
  }

  function printCmdLine(promptText: string, cmdText: string) {
    const p = el('p', 'term-line');
    p.append(el('span', 'term-ps1', `${promptText} `), document.createTextNode(cmdText));
    out!.append(p);
  }

  function printClickableHint(prefix: string, cmd: string, suffix = '') {
    const p = el('p', 'term-line');
    if (prefix) p.append(document.createTextNode(prefix));
    const chip = el('span', 'term-cmd-chip', cmd);
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    const run = () => {
      input!.value = cmd;
      input!.focus();
      form!.requestSubmit();
    };
    chip.addEventListener('click', (ev) => {
      ev.stopPropagation();
      run();
    });
    chip.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        run();
      }
    });
    p.append(chip);
    if (suffix) p.append(document.createTextNode(suffix));
    out!.append(p);
    scrollBottom();
  }

  function tokenValid(): boolean {
    return Boolean(currentToken && currentExpiresAt > Date.now());
  }

  function remainText(): string {
    const sec = Math.max(0, Math.floor((currentExpiresAt - Date.now()) / 1000));
    return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
  }

  async function doVerify(rawKey: string) {
    busy = true;
    print('正在校验四段信标摘要...', 'dim');
    try {
      const res = await fetch('/api/beacon/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
        body: JSON.stringify({ key: rawKey, agreed: true }),
      });
      const data = (await res.json()) as VerifyResponse;

      if (data.matched) {
        const segStr = data.matched
          .map((ok, idx) => `[0${idx + 1}:${ok ? 'OK' : 'ERR'}]`)
          .join(' ');
        print(`SEGMENTS  ${segStr}`, data.ok ? 'hi' : 'dim');
      }

      if (!res.ok || !data.ok || !data.token) {
        print(`[DENIED] ${data.error || '口令未通过校验'}`, 'hi');
        return;
      }

      currentToken = data.token;
      currentExpiresAt = Number(data.expiresAt ?? Date.now() + 15 * 60 * 1000);
      currentBundle = data.bundleName || 'beacon-framework-bundle.zip';
      docCache.clear();
      root!.dataset.unlocked = 'true';

      print(`[OK] 校验通过，私有归档已解锁（凭证有效期 ${remainText()}）。`, 'hi');
      if (data.isOwner) {
        print('[OWNER] 检测到站主登录：本次测试不计入通关名录，不会占用访客排名。', 'dim');
      } else if (typeof data.rank === 'number') {
        print(
          `[RANK] 你是第 #${String(data.rank).padStart(3, '0')} 位解开信标的探索者（当前名录代号：${data.codename || '匿名信号'}）。`,
          'hi',
        );
      }
      print(RULE, 'dim');
      print('  beacon-framework-bundle.zip    完整学习包（源码包 + 两份手册）');
      print('  beacon-framework-README.md     框架总览与部署说明');
      print('  本机单机部署.md                单机实验部署手册');
      print(RULE, 'dim');
      printClickableHint('  输入或点击 ', 'download', '           一键下载完整学习包 (.zip)');
      printClickableHint('  输入或点击 ', 'cat readme', '         在终端直接阅读 README');
      printClickableHint('  输入或点击 ', 'cat deploy', '         在终端直接阅读本机单机部署手册');
      printClickableHint('  输入或点击 ', 'solvers', '            查看通关者名录与留言');
      if (!data.isOwner) {
        print('  输入 "register <代号> [留言]" 修改你的代号并写下通关留言', 'dim');
        print('  输入 "say <留言>" 保持当前代号，直接留下一句通关留言', 'dim');
      }
      print(RULE, 'dim');
    } catch {
      print('[ERROR] 无法连接到 /api/beacon/verify，请稍后重试。', 'hi');
    } finally {
      busy = false;
    }
  }

  async function doSolvers() {
    busy = true;
    try {
      const res = await fetch('/api/beacon/solvers', { cache: 'no-store' });
      const data = (await res.json()) as SolversResponse;
      if (!res.ok) {
        print(`[ERROR] ${data.error || '无法读取通关名录'}`, 'hi');
        return;
      }
      const total = Number(data.total ?? 0);
      const items = data.items ?? [];
      print(RULE, 'dim');
      print(`HALL OF SIGNALS   TOTAL: ${total}`, 'hi');
      print(RULE, 'dim');
      if (!items.length) {
        print('  #000  (暂无记录 — 首位通关席位虚位以待)', 'dim');
      } else {
        for (const item of items) {
          const rank = `#${String(item.rank).padStart(3, '0')}`;
          const when = formatDate(item.solvedAt);
          print(`  ${rank}  ${item.codename}   [${when}]`, item.rank === 1 ? 'hi' : '');
          if (item.note) {
            print(`        > ${item.note}`);
          } else {
            print('        (未留言)', 'dim');
          }
        }
      }
      print(RULE, 'dim');
    } catch {
      print('[ERROR] 无法读取通关名录。', 'hi');
    } finally {
      busy = false;
    }
  }

  async function doRegister(codename: string, note: string, keepCodename = false) {
    if (!tokenValid()) {
      print('[LOCKED] 请先使用 "unlock 口令" 解锁后再修改代号或留言。', 'hi');
      return;
    }
    busy = true;
    try {
      const res = await fetch('/api/beacon/solvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
        body: JSON.stringify({ token: currentToken, codename, note, keepCodename }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        updated?: boolean;
        entry?: SolverEntry;
        total?: number;
        error?: string;
      };
      if (res.ok && data.ok && data.entry) {
        const msgPart = data.entry.note ? `，留言：「${data.entry.note}」` : '';
        print(
          `[OK] 已更新第 #${String(data.entry.rank).padStart(3, '0')} 位通关记录（代号：${data.entry.codename}${msgPart}）。输入 "solvers" 可查看。`,
          'hi',
        );
      } else {
        print(`[DENIED] ${data.error || '登记失败'}`, 'hi');
      }
    } catch {
      print('[ERROR] 网络异常，暂时无法保存。', 'hi');
    } finally {
      busy = false;
    }
  }

  async function doCat(target: string) {
    if (!tokenValid()) {
      print('[LOCKED] 未解锁或凭证已过期，请先输入 "unlock <口令>"。', 'hi');
      return;
    }
    const norm = target.trim().toLowerCase();
    let docId: 'readme' | 'local-deploy' | null = null;
    if (norm === 'readme' || norm === 'beacon-framework-readme.md' || norm === '1') {
      docId = 'readme';
    } else if (norm === 'deploy' || norm === 'local-deploy' || norm === '本机单机部署.md' || norm === '2') {
      docId = 'local-deploy';
    }
    if (!docId) {
      print('用法：cat readme  或  cat deploy', 'dim');
      return;
    }

    busy = true;
    try {
      let md = docCache.get(docId);
      if (md === undefined) {
        print(`正在从私有存储读取 ${docId} ...`, 'dim');
        const res = await fetch(
          `/api/beacon/doc?name=${encodeURIComponent(docId)}&t=${encodeURIComponent(currentToken)}`,
          { cache: 'no-store' },
        );
        const data = (await res.json()) as { ok?: boolean; markdown?: string; error?: string };
        if (!res.ok || !data.ok || typeof data.markdown !== 'string') {
          print(`[ERROR] ${data.error || '读取文档失败'}`, 'hi');
          return;
        }
        md = data.markdown;
        docCache.set(docId, md);
      }

      print(RULE, 'dim');
      print(`FILE: ${docId === 'readme' ? 'beacon-framework-README.md' : '本机单机部署.md'}`, 'hi');
      print(RULE, 'dim');
      const host = el('article', 'term-doc');
      renderMarkdownSafe(host, md);
      out!.append(host);
      print(RULE, 'dim');
      print(`EOF (${docId}) — 输入 "clear" 清屏，或输入 "download" 下载完整包。`, 'dim');
      scrollBottom();
    } catch {
      print('[ERROR] 网络异常，读取文档失败。', 'hi');
    } finally {
      busy = false;
    }
  }

  function doDownload() {
    if (!tokenValid()) {
      print('[LOCKED] 未解锁或凭证已过期，请先输入 "unlock <口令>"。', 'hi');
      return;
    }
    const href = `/api/beacon/download?t=${encodeURIComponent(currentToken)}`;
    const a = el('a', 'term-link', currentBundle);
    a.href = href;
    a.download = currentBundle;

    const line = el('p', 'term-line');
    line.append(
      document.createTextNode(`[DL] 正在拉取私有归档（剩余有效 ${remainText()}）：`),
      a,
    );
    out!.append(line);
    scrollBottom();

    // 触发浏览器下载
    const trigger = document.createElement('a');
    trigger.href = href;
    trigger.download = currentBundle;
    trigger.style.display = 'none';
    document.body.append(trigger);
    trigger.click();
    trigger.remove();
  }

  function printHelp() {
    print(RULE, 'dim');
    print('  help                      查看可用命令');
    print('  hint [1|2|3|4]            查看各关工具方向（不剧透答案）');
    print('  unlock BEACON-X-X-X-X     校验四段口令解锁私有归档');
    print('  solvers                   查看通关者名录与人数');
    print('  clear                     清空终端输出');
    print('  exit                      返回博客首页 (/)');
    print(RULE, 'dim');
    print('  [解锁后可用命令]', 'dim');
    print('  ls                        查看已解锁文件与令牌剩余时间');
    print('  download                  一键下载完整学习包 (.zip)');
    print('  cat readme                终端直接阅读 beacon-framework-README.md');
    print('  cat deploy                终端直接阅读 本机单机部署.md');
    print('  register <代号> [留言]    修改通关代号并留下留言');
    print('  say <留言>                保持当前代号，直接写一句通关留言');
    print(RULE, 'dim');
  }

  async function handleCommand(raw: string) {
    const trimmed = raw.trim();

    // 若正在等待 y/N 授权协议确认
    if (pendingKey) {
      printCmdLine(CONFIRM_PS1, trimmed || 'n');
      const ans = trimmed.toLowerCase();
      const keyToUse = pendingKey;
      pendingKey = '';
      ps1!.textContent = DEFAULT_PS1;
      if (ans === 'y' || ans === 'yes') {
        await doVerify(keyToUse);
      } else {
        print('已取消校验。', 'dim');
      }
      return;
    }

    printCmdLine(DEFAULT_PS1, trimmed);
    if (!trimmed) return;

    if (history[history.length - 1] !== trimmed) history.push(trimmed);
    histIdx = history.length;

    const tokens = trimmed.split(/\s+/);
    const cmd = tokens[0].toLowerCase().replace(/^\//, '');
    const args = tokens.slice(1);

    if (cmd === 'help' || cmd === '?') {
      printHelp();
      return;
    }

    if (cmd === 'clear' || cmd === 'cls') {
      out!.replaceChildren();
      return;
    }

    if (cmd === 'exit' || cmd === 'quit' || (cmd === 'cd' && args[0] === '/')) {
      print('closing session -> / ...', 'dim');
      window.location.href = '/';
      return;
    }

    if (cmd === 'hint' || cmd === 'hints') {
      print(RULE, 'dim');
      const pick = args[0];
      if (pick && STAGE_HINTS[pick]) {
        print(STAGE_HINTS[pick]);
      } else {
        for (const k of ['1', '2', '3', '4']) print(STAGE_HINTS[k]);
      }
      print(RULE, 'dim');
      return;
    }

    if (cmd === 'solvers' || cmd === 'rank' || cmd === 'who') {
      await doSolvers();
      return;
    }

    if (cmd === 'ls') {
      if (!tokenValid()) {
        print('total 0 (vault locked — 输入 "unlock <口令>" 解锁)', 'dim');
        return;
      }
      print(RULE, 'dim');
      print(`token ttl: ${remainText()}`, 'dim');
      print('  -rw-------  beacon-framework-bundle.zip');
      print('  -r--------  beacon-framework-README.md   (cat readme)');
      print('  -r--------  本机单机部署.md               (cat deploy)');
      print(RULE, 'dim');
      return;
    }

    if (cmd === 'download' || cmd === 'dl' || cmd === 'get') {
      doDownload();
      return;
    }

    if (cmd === 'cat' || cmd === 'less' || cmd === 'read') {
      await doCat(args.join(' '));
      return;
    }

    if (cmd === 'register' || cmd === 'claim') {
      const codename = args[0] ?? '';
      const note = args.slice(1).join(' ');
      await doRegister(codename, note, false);
      return;
    }

    if (cmd === 'say' || cmd === 'note' || cmd === 'msg') {
      const note = args.join(' ').trim();
      if (!note) {
        print('用法：say 你的通关留言（最多 80 字）', 'dim');
        return;
      }
      await doRegister('', note, true);
      return;
    }

    if (cmd === 'unlock' || cmd === 'login' || cmd === 'verify') {
      const autoAgree = args.some((a) => a === '-y' || a === '--agree');
      const rawKeyArg = args.find((a) => !a.startsWith('-')) ?? '';
      const keyArg = rawKeyArg.replace(/^[<"'`]+|[>"'`]+$/g, '');
      if (!keyArg) {
        print('用法：unlock BEACON-碎片1-碎片2-碎片3-碎片4（不要加尖括号）', 'dim');
        return;
      }
      if (autoAgree) {
        await doVerify(keyArg);
      } else {
        pendingKey = keyArg;
        ps1!.textContent = CONFIRM_PS1;
        print('[!] 确认声明：下载的源码与手册仅用于本人自有设备或明确授权的隔离实验环境学习，不用于任何未授权目标？输入 y 确认。', 'hi');
      }
      return;
    }

    if (looksLikeKey(trimmed)) {
      print(`请加上 unlock 命令再提交：unlock ${trimmed}`, 'dim');
      return;
    }

    print(`sh: command not found: ${tokens[0]}  （输入 "help" 查看命令）`, 'dim');
  }

  listen(input, 'input', syncIdleCursor);

  listen(form, 'submit', (ev) => {
    ev.preventDefault();
    if (busy) return;
    const val = input.value;
    input.value = '';
    syncIdleCursor();
    void handleCommand(val).finally(() => {
      syncIdleCursor();
  input.focus();
      scrollBottom();
    });
  });

  listen(input, 'keydown', (ev) => {
    const ke = ev as KeyboardEvent;
    if (ke.key === 'ArrowUp') {
      if (!history.length) return;
      ke.preventDefault();
      histIdx = Math.max(0, histIdx - 1);
      input.value = history[histIdx] ?? '';
      syncIdleCursor();
    } else if (ke.key === 'ArrowDown') {
      if (!history.length) return;
      ke.preventDefault();
      histIdx = Math.min(history.length, histIdx + 1);
      input.value = history[histIdx] ?? '';
      syncIdleCursor();
    } else if (ke.key === 'Tab') {
      const v = input.value.trim().toLowerCase();
      const cmds = ['help', 'hint', 'unlock ', 'solvers', 'ls', 'download', 'cat readme', 'cat deploy', 'register ', 'say ', 'clear', 'exit'];
      const hit = v ? cmds.find((c) => c.startsWith(v)) : undefined;
      if (hit) {
        ke.preventDefault();
        input.value = hit;
        syncIdleCursor();
      }
    }
  });

  // 点页面空白处自动聚焦命令行（选中复制文字时不抢焦点）
  listen(doc, 'click', () => {
    const sel = window.getSelection?.();
    if (sel && sel.toString().length > 0) return;
    syncIdleCursor();
  input.focus();
  });

  // 静默加载当前通关人数显示在欢迎区下方一行
  void (async () => {
    try {
      const res = await fetch('/api/beacon/solvers', { cache: 'no-store' });
      const data = (await res.json()) as SolversResponse;
      if (res.ok && typeof data.total === 'number') {
        printSpacer();
        const suffix = data.total > 0 ? '  （输入 "solvers" 查看名录与留言）' : '';
        print(`status: locked  |  solvers: ${data.total}${suffix}`, 'dim');
      }
    } catch {
      // ignore offline
    }
  })();

  syncIdleCursor();
  input.focus();
  return () => {
    for (const fn of cleanups) fn();
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initBeaconTerminal(document), { once: true });
  } else {
    initBeaconTerminal(document);
  }
}
