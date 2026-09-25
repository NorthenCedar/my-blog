# 评论系统实现计划（自建 Cloudflare Pages Functions + D1）

> **For agentic workers:** 逐任务执行。步骤用 `- [ ]` 勾选跟踪。收尾必须跑 `verification-before-completion`。

**Goal:** 给每篇文章加一个评论区：读者填「名字 + 留言」即可发表，评论存进自己的 Cloudflare D1，前端用原生 JS 渲染，**不引入任何第三方域名**。

**Architecture:** 沿用本站既有的「纯核心 + 薄适配器」接缝 ——
校验/蜜罐/频率/归一化放进 `functions/api/_lib/comments-core.ts`（纯函数、vitest 可测），
`functions/api/comments.ts` 只做 HTTP 与 D1 的搬运。
前端是**服务端渲染的容器**（标题 + 表单骨架）+ **客户端脚本**填充列表（站点是静态的，评论必须运行时取）。

**Tech Stack:** Astro 7.3.5（静态）· Cloudflare Pages Functions（`functions/` 目录）· D1（SQLite）· 原生 JS · Vitest 5

**Spec:** `docs/design-spec.md` **§4.1 评论组件**（设计契约）· `docs/site-decisions.md`「变更记录：评论从『不做』改为『自建』」（决策与代价）

---

## Global Constraints

- **零第三方资源**：产物与运行时都不得出现任何外部域名的 `src`/`href`/`fetch`。**这条没有因为加评论而放宽。**
- **JS 预算**（2026-09-26 修订）：文章页 ≤ 2 个 `<script>`；复制脚本 ≤ 1 KB、**评论脚本 ≤ 4 KB**。
- **视觉 token 逐字用 `design-spec.md` §3**：不新增颜色、不新增间距档位、不用圆角/阴影。
- **`--accent`（3.68:1）只用于 ≥24px 文字或非文字图形**；按钮文字是小字，**不许**用 `--accent` 做底色。
- **依赖**：只新增 `wrangler`（devDependency）。任何其它包先说明理由。
- **内容层只读**：`content/` 一个字节都不许被这次改动动到。
- **XSS 是这条功能的头号风险**：用户输入一律用 `textContent` 写进 DOM，**任何地方都不许用 `innerHTML`**。
- 提交：Conventional Commits，每个任务至少一次提交。**不 push、不部署**，除非站主明确同意。

---

## Review Focus

规格没明说、但最可能让真人撞上的五类输入。每条都必须在它归属的任务里有测试：

1. **有人在留言里写 `<script>alert(1)</script>`** —— 必须原样显示成文字，**绝不能被执行**。
2. **同一个人一分钟内连发 5 条** —— 第 3 条起必须是 429，且**不写进数据库**。
3. **蜜罐字段被填了**（机器人行为）—— 必须**返回 201 假装成功**但**不落库**（让机器人以为得手）。
4. **名字 41 字 / 留言 1001 字 / 留言全是空格** —— 必须 400 并给出可读原因。
5. **提交失败后页面刷新前用户写的内容** —— 必须**保留在输入框里**，不能清空。

---

## File Structure

```
<博客仓库>\
├─ wrangler.toml                     新增：声明 D1 binding（本地开发用）
├─ migrations/
│  └─ 0001_comments.sql              新增：建表
├─ functions/
│  └─ api/
│     ├─ comments.ts                 新增：Pages Function（GET/POST）—— 薄适配器
│     └─ _lib/
│        └─ comments-core.ts         新增：★ 纯核心（校验/蜜罐/频率/归一化）
├─ src/
│  ├─ components/
│  │  └─ CommentSection.astro        新增：服务端渲染的容器（标题 + 空列表 + 表单）
│  ├─ scripts/
│  │  └─ comments.ts                 新增：客户端脚本（取列表 / 提交 / 渲染）
│  ├─ styles/
│  │  └─ comments.css                新增：评论样式（只用现有 token）
│  └─ layouts/Post.astro             修改：正文之后挂上 CommentSection
├─ tests/
│  ├─ comments-core.test.ts          新增：纯核心单测
│  └─ build-output.test.ts           修改：script 数断言 1 → 2；新增两条守卫
└─ docs/
   └─ writing-guide.md               修改：本地开发方式 + 怎么删评论
```

> **为什么 `_lib/` 带下划线**：Cloudflare Pages 把 `functions/` 下每个文件映射成一条路由，
> **以下划线开头的文件/目录不会被当作路由**。所以纯核心放那里不会被暴露成 `/api/_lib/comments-core`。

---

### Task 1: D1 表结构 + wrangler 配置

**Files:**
- Create: `migrations/0001_comments.sql`, `wrangler.toml`
- Modify: `package.json`（新增 devDependency `wrangler` 与两个脚本）

**Interfaces:**
- Produces: D1 表 `comments`；本地数据库文件（wrangler 管理）；binding 名 **`COMMENTS_DB`**

- [ ] **Step 1: 装 wrangler（唯一新增依赖）**

```powershell
cd <博客仓库>
npm install -D wrangler
```

Expected: `package.json` 的 `devDependencies` 出现 `wrangler`。

- [ ] **Step 2: 写 `migrations/0001_comments.sql`**

```sql
-- 评论表。ip_hash 用于频率限制，**不存原始 IP**。
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  ip_hash    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_slug_created
  ON comments (slug, created_at);
```

- [ ] **Step 3: 写 `wrangler.toml`（只为本地开发；线上 binding 在控制台配）**

```toml
name = "beishan-notes"
compatibility_date = "2026-09-01"
pages_build_output_dir = "dist"

# 本地开发用的 D1 绑定。database_id 是占位符 ——
# 本地 `wrangler pages dev` 会用本地 SQLite 模拟，不需要真实 id。
# 线上要在 Cloudflare 控制台 Pages → Settings → Functions → D1 bindings 里绑真库，
# 变量名必须同样是 COMMENTS_DB。
[[d1_databases]]
binding = "COMMENTS_DB"
database_name = "beishan-comments"
database_id = "local-placeholder"
```

- [ ] **Step 4: 给 `package.json` 加脚本**

```json
"comments:init": "wrangler d1 execute beishan-comments --local --file=migrations/0001_comments.sql",
"dev:cf": "wrangler pages dev dist"
```

- [ ] **Step 5: 应用迁移并验证表真的建出来了**

```powershell
npm run build
npm run comments:init
npx wrangler d1 execute beishan-comments --local --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Expected: 输出里能看到 `comments` 表。
**若 `--local` 参数报错**：跑 `npx wrangler d1 execute --help` 确认当前的参数形态，把实际可用的写法记进 `docs/writing-guide.md`。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json wrangler.toml migrations/0001_comments.sql
git commit -m "feat(comments): d1 schema and wrangler config for local development"
```

---

### Task 2: 纯核心 `comments-core.ts`（TDD）

**Files:**
- Create: `functions/api/_lib/comments-core.ts`, `tests/comments-core.test.ts`

**Interfaces:**
- Produces（后续任务只依赖这些名字）：
  - `NAME_MAX = 40` · `BODY_MAX = 1000` · `RATE_WINDOW_MS = 60000` · `RATE_MAX = 2`
  - `type CommentRecord = { id: number; name: string; body: string; createdAt: string }`
  - `validateComment(input: unknown): { ok: true; value: { slug; name; body } } | { ok: false; error: string }`
  - `honeypotTripped(input: unknown): boolean`
  - `rateLimited(recentCount: number): boolean`
  - `toRecord(row: { id; name; body; created_at }): CommentRecord`

- [ ] **Step 1: 写失败的测试 `tests/comments-core.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  validateComment, honeypotTripped, rateLimited, toRecord,
  NAME_MAX, BODY_MAX, RATE_MAX,
} from '../functions/api/_lib/comments-core';

const good = { slug: 'my-post', name: '小明', body: '写得真好。' };

describe('validateComment', () => {
  it('正常输入通过，并去掉首尾空白', () => {
    const r = validateComment({ ...good, name: '  小明  ', body: '  你好  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('小明');
      expect(r.value.body).toBe('你好');
    }
  });

  it('名字为空或全空格 → 400', () => {
    for (const name of ['', '   ']) {
      const r = validateComment({ ...good, name });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('名字');
    }
  });

  it('留言为空或全空格 → 400', () => {
    for (const body of ['', '   ']) {
      const r = validateComment({ ...good, body });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('留言');
    }
  });

  it(`名字超过 ${NAME_MAX} 字 → 400`, () => {
    const r = validateComment({ ...good, name: 'a'.repeat(NAME_MAX + 1) });
    expect(r.ok).toBe(false);
    expect(validateComment({ ...good, name: 'a'.repeat(NAME_MAX) }).ok).toBe(true);
  });

  it(`留言超过 ${BODY_MAX} 字 → 400`, () => {
    const r = validateComment({ ...good, body: 'a'.repeat(BODY_MAX + 1) });
    expect(r.ok).toBe(false);
    expect(validateComment({ ...good, body: 'a'.repeat(BODY_MAX) }).ok).toBe(true);
  });

  it('slug 只允许小写字母数字连字符 → 否则 400', () => {
    for (const slug of ['My-Post', '我的文章', 'a/b', '', 'a b']) {
      const r = validateComment({ ...good, slug });
      expect(r.ok, `${slug} 应该被拒`).toBe(false);
    }
    expect(validateComment({ ...good, slug: 'a-1-b' }).ok).toBe(true);
  });

  it('非对象 / 缺字段 → 400 而不是抛异常', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { slug: 'a' }]) {
      expect(() => validateComment(bad)).not.toThrow();
      expect(validateComment(bad).ok).toBe(false);
    }
  });

  it('留言里的 HTML 原样保留（转义是渲染层的责任，不是这里的）', () => {
    const r = validateComment({ ...good, body: '<script>alert(1)</script>' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.body).toBe('<script>alert(1)</script>');
  });
});

describe('honeypotTripped', () => {
  it('蜜罐字段为空 → false（真人）', () => {
    expect(honeypotTripped({ ...good, website: '' })).toBe(false);
    expect(honeypotTripped({ ...good })).toBe(false);
  });
  it('蜜罐字段被填 → true（机器人）', () => {
    expect(honeypotTripped({ ...good, website: 'http://spam.example' })).toBe(true);
    expect(honeypotTripped({ ...good, website: ' ' })).toBe(true);
  });
});

describe('rateLimited', () => {
  it(`最近一分钟内已有 ${RATE_MAX} 条 → 限流`, () => {
    expect(rateLimited(0)).toBe(false);
    expect(rateLimited(1)).toBe(false);
    expect(rateLimited(RATE_MAX)).toBe(true);
    expect(rateLimited(RATE_MAX + 3)).toBe(true);
  });
});

describe('toRecord', () => {
  it('把 D1 的 snake_case 行转成 camelCase', () => {
    expect(toRecord({ id: 7, name: '小明', body: '你好', created_at: '2026-09-26T10:00:00.000Z' }))
      .toEqual({ id: 7, name: '小明', body: '你好', createdAt: '2026-09-26T10:00:00.000Z' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/comments-core.test.ts`
Expected: FAIL —— `Failed to resolve import "../functions/api/_lib/comments-core"`

- [ ] **Step 3: 写 `functions/api/_lib/comments-core.ts`**

```ts
export const NAME_MAX = 40;
export const BODY_MAX = 1000;
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 2;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type CommentRecord = { id: number; name: string; body: string; createdAt: string };
export type CommentInput = { slug: string; name: string; body: string };

export type Validation =
  | { ok: true; value: CommentInput }
  | { ok: false; error: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 校验并归一化一条留言。**不抛异常** —— 任何脏输入都返回 { ok: false }，
 * 由适配器翻成 400。业务规则集中在这里，适配器里不许再写 if。
 */
export function validateComment(input: unknown): Validation {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: '请求格式不对' };
  }
  const o = input as Record<string, unknown>;

  const slug = str(o.slug).trim();
  const name = str(o.name).trim();
  const body = str(o.body).trim();

  if (!SLUG_RE.test(slug)) return { ok: false, error: '页面标识不合法' };
  if (name.length === 0) return { ok: false, error: '名字没写' };
  if (name.length > NAME_MAX) return { ok: false, error: `名字不能超过 ${NAME_MAX} 字` };
  if (body.length === 0) return { ok: false, error: '留言为空' };
  if (body.length > BODY_MAX) return { ok: false, error: `留言不能超过 ${BODY_MAX} 字` };

  return { ok: true, value: { slug, name, body } };
}

/** 蜜罐：正常用户看不见这个字段，所以它一旦有内容就一定是机器人。 */
export function honeypotTripped(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const v = (input as Record<string, unknown>).website;
  return typeof v === 'string' && v.trim().length > 0;
}

export function rateLimited(recentCount: number): boolean {
  return recentCount >= RATE_MAX;
}

export function toRecord(row: {
  id: number;
  name: string;
  body: string;
  created_at: string;
}): CommentRecord {
  return { id: row.id, name: row.name, body: row.body, createdAt: row.created_at };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/comments-core.test.ts`
Expected: 全部 PASS（11 个用例）

- [ ] **Step 5: Commit**

```bash
git add functions/api/_lib/comments-core.ts tests/comments-core.test.ts
git commit -m "feat(comments): pure validation core for comments API"
```

---

### Task 3: Pages Function 适配器

**Files:**
- Create: `functions/api/comments.ts`

**Interfaces:**
- Consumes: Task 2 的全部导出；Task 1 的 binding `COMMENTS_DB`
- Produces: `GET /api/comments?slug=` 与 `POST /api/comments`

- [ ] **Step 1: 写 `functions/api/comments.ts`**

```ts
import {
  validateComment, honeypotTripped, rateLimited, toRecord,
  RATE_WINDOW_MS, type CommentRecord,
} from './_lib/comments-core';

interface Env {
  COMMENTS_DB: D1Database;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/** 只存 IP 的哈希，不存原始 IP —— 频率限制够用，隐私代价最小。 */
async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  const { results } = await env.COMMENTS_DB
    .prepare('SELECT id, name, body, created_at FROM comments WHERE slug = ? ORDER BY created_at ASC LIMIT 200')
    .bind(slug)
    .all<{ id: number; name: string; body: string; created_at: string }>();

  return json({ comments: (results ?? []).map(toRecord) satisfies CommentRecord[] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '请求格式不对' }, 400);
  }

  const check = validateComment(payload);
  if (!check.ok) return json({ error: check.error }, 400);

  // 蜜罐命中：**假装成功**，但不落库 —— 让机器人以为得手，不来重试。
  if (honeypotTripped(payload)) {
    return json({ comment: { id: 0, ...check.value, createdAt: new Date().toISOString() } }, 201);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

  const { results: recent } = await env.COMMENTS_DB
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, since)
    .all<{ n: number }>();

  if (rateLimited(recent?.[0]?.n ?? 0)) {
    return json({ error: '发表太频繁，请等一分钟再试' }, 429);
  }

  const createdAt = new Date().toISOString();
  const inserted = await env.COMMENTS_DB
    .prepare('INSERT INTO comments (slug, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(check.value.slug, check.value.name, check.value.body, createdAt, ipHash)
    .first<{ id: number }>();

  return json(
    { comment: { id: inserted?.id ?? 0, ...check.value, createdAt } },
    201
  );
};
```

- [ ] **Step 2: 起本地 Pages 运行时（**这一步和 `astro preview` 不同**）**

```powershell
npm run build
npx wrangler pages dev dist --d1=COMMENTS_DB
```

Expected: 打印一个本地地址（通常是 `http://localhost:8788`）。
**若 `--d1` 参数形态不对**：跑 `npx wrangler pages dev --help` 看当前版本的写法（新旧版本差异较大），把可用写法记进 `docs/writing-guide.md`。

- [ ] **Step 3: 用 curl 打真实请求（把输出贴进提交说明或 PR）**

```powershell
# 空列表
curl.exe -s "http://localhost:8788/api/comments?slug=my-post"

# 发一条
curl.exe -s -X POST http://localhost:8788/api/comments -H "Content-Type: application/json" `
  -d '{\"slug\":\"my-post\",\"name\":\"小明\",\"body\":\"写得真好。\"}'

# 再取，应该能拿到刚才那条
curl.exe -s "http://localhost:8788/api/comments?slug=my-post"
```

Expected: 第一次 `{"comments":[]}`；第二次 201 且带 `id`；第三次列表里有 1 条。

- [ ] **Step 4: 逐条验证 Review Focus 的 1–4（把真实响应贴出来）**

```powershell
# ② 频率限制：连发 3 条，第 3 条应当是 429
1..3 | ForEach-Object {
  curl.exe -s -o NUL -w "%{http_code}`n" -X POST http://localhost:8788/api/comments `
    -H "Content-Type: application/json" `
    -d '{\"slug\":\"rate-test\",\"name\":\"a\",\"body\":\"b\"}'
}

# ③ 蜜罐：应当返回 201 但列表里没有它
curl.exe -s -X POST http://localhost:8788/api/comments -H "Content-Type: application/json" `
  -d '{\"slug\":\"honeypot-test\",\"name\":\"bot\",\"body\":\"spam\",\"website\":\"http://x.example\"}'
curl.exe -s "http://localhost:8788/api/comments?slug=honeypot-test"

# ④ 超长 / 空值
curl.exe -s -o NUL -w "%{http_code}`n" -X POST http://localhost:8788/api/comments `
  -H "Content-Type: application/json" -d '{\"slug\":\"v\",\"name\":\"\",\"body\":\"x\"}'
```

Expected: 频率限制输出 `201 / 201 / 429`；蜜罐返回 201 但列表为空；空名字返回 400。

- [ ] **Step 5: Commit**

```bash
git add functions/api/comments.ts
git commit -m "feat(comments): pages function with honeypot and per-IP rate limiting"
```

---

### Task 4: 服务端容器组件 + 样式

**Files:**
- Create: `src/components/CommentSection.astro`, `src/styles/comments.css`
- Modify: `src/layouts/Post.astro`

**Interfaces:**
- Consumes: `design-spec.md` §4.1 的布局与 token 映射
- Produces: `<CommentSection slug={...} />`；DOM 契约为客户端脚本所依赖（见 Step 3）

- [ ] **Step 1: 写 `src/styles/comments.css`（只用现有 token）**

```css
.comments {
  max-width: var(--measure);
  margin-top: var(--sp-8);
  border-top: 1px solid var(--ink);
  padding-top: var(--sp-5);
}
.comments h2 {
  font-size: var(--fs-lg);
  font-weight: 700;
  margin: 0 0 var(--sp-4);
}
.comment-count {
  font-size: var(--fs-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  margin-left: var(--sp-3);
  font-weight: 400;
}
.comment-list {
  list-style: none;
  margin: 0 0 var(--sp-6);
  padding: 0;
  border-bottom: 1px solid var(--ink);
}
.comment-list li {
  border-top: 1px solid var(--hair);
  padding: var(--sp-5) 0;
}
.comment-name {
  font-weight: 700;
}
.comment-time {
  display: block;
  font-size: var(--fs-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  margin: var(--sp-1) 0 var(--sp-3);
}
.comment-body {
  margin: 0;
  max-width: var(--measure);
  white-space: pre-wrap;   /* 保留换行，但不解析 HTML */
}
.comment-empty {
  color: var(--muted);
  margin: 0 0 var(--sp-5);
}
.comment-form label {
  display: block;
  font-size: var(--fs-xs);
  color: var(--muted);
  margin-bottom: var(--sp-1);
}
.comment-form input,
.comment-form textarea {
  width: 100%;
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--hair);
  border-radius: 0;
  padding: var(--sp-2) var(--sp-3);
  margin-bottom: var(--sp-4);
}
.comment-form input:focus-visible,
.comment-form textarea:focus-visible {
  border-color: var(--ink);
}
.comment-form button {
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
  border-radius: 0;
  padding: var(--sp-2) var(--sp-5);
  cursor: pointer;
}
.comment-form button:hover:not(:disabled) {
  background: var(--accent-ink);   /* 5.18:1，达标；--accent 不达标，刻意不用 */
  border-color: var(--accent-ink);
}
.comment-form button:disabled {
  opacity: 0.6;
  cursor: default;
}
.comment-error {
  color: var(--accent-ink);
  font-size: var(--fs-sm);
  margin: 0 0 var(--sp-3);
}
/* 蜜罐：移出视口而不是 display:none —— 有些机器人会跳过隐藏元素 */
.hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: 写 `src/components/CommentSection.astro`**

```astro
---
import '../styles/comments.css';

interface Props {
  slug: string;
}
const { slug } = Astro.props;
---
<section class="comments" id="comments" data-comments data-slug={slug}>
  <h2>评论<span class="comment-count" data-count></span></h2>

  <p class="comment-empty" data-empty>还没有人留言。你可以是第一个。</p>
  <ol class="comment-list" data-list hidden></ol>
  <p class="comment-error" role="alert" data-error hidden></p>

  <h2 id="comment-form-title">留个言</h2>
  <form class="comment-form" data-form aria-labelledby="comment-form-title" novalidate>
    <label for="comment-name">名字</label>
    <input id="comment-name" name="name" type="text" maxlength="40" autocomplete="nickname" required />

    <label for="comment-body">留言</label>
    <textarea id="comment-body" name="body" rows="4" maxlength="1000" required></textarea>

    <!-- 蜜罐：真人看不见，也不会进入 Tab 序 -->
    <div class="hp" aria-hidden="true">
      <label for="comment-website">网站（请留空）</label>
      <input id="comment-website" name="website" type="text" tabindex="-1" autocomplete="off" />
    </div>

    <button type="submit" data-submit>发表</button>
  </form>
</section>
```

- [ ] **Step 3: 在 `src/layouts/Post.astro` 里挂上**

在相邻文章导航之前插入（评论应该在正文和「上一篇/下一篇」之间还是之后？—— **放之后**，让导航紧贴正文）：

```astro
---
import CommentSection from '../components/CommentSection.astro';
// …既有 import
---
<!-- …既有内容保持不变，在 </article> 之后、相邻文章 nav 之前不插；插在 nav 之后： -->
<CommentSection slug={meta.slug} />
```

- [ ] **Step 4: 构建并确认容器出现在产物里**

```powershell
npm run build
Select-String -Path dist\posts\camera-in-gaosan\index.html -Pattern 'data-comments|data-slug|comment-website'
```

Expected: 三个属性都能搜到；`data-slug` 的值是该文章的 slug。

- [ ] **Step 5: Commit**

```bash
git add src/components/CommentSection.astro src/styles/comments.css src/layouts/Post.astro
git commit -m "feat(comments): server-rendered container and styles from existing tokens"
```

---

### Task 5: 客户端脚本

**Files:**
- Create: `src/scripts/comments.ts`
- Modify: `src/layouts/Post.astro`（引入脚本）

**Interfaces:**
- Consumes: Task 4 的 DOM 契约（`[data-comments]`、`[data-slug]`、`[data-list]`、`[data-empty]`、`[data-count]`、`[data-error]`、`[data-form]`、`[data-submit]`）
- Produces: 无（终端消费者）

- [ ] **Step 1: 写 `src/scripts/comments.ts`**

```ts
// 评论：取列表 + 提交。全站第二个客户端脚本（第一个是代码复制）。
// 安全铁律：用户输入一律用 textContent 写进 DOM，**任何地方都不用 innerHTML**。

const root = document.querySelector<HTMLElement>('[data-comments]');

if (root) {
  const slug = root.dataset.slug ?? '';
  const list = root.querySelector<HTMLOListElement>('[data-list]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const errorBox = root.querySelector<HTMLElement>('[data-error]')!;
  const form = root.querySelector<HTMLFormElement>('[data-form]')!;
  const submit = root.querySelector<HTMLButtonElement>('[data-submit]')!;

  const showError = (msg: string) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  };
  const clearError = () => {
    errorBox.hidden = true;
  };

  const render = (c: { id: number; name: string; body: string; createdAt: string }, fresh = false) => {
    const li = document.createElement('li');
    li.dataset.id = String(c.id);

    const name = document.createElement('span');
    name.className = 'comment-name';
    name.textContent = c.name;

    const time = document.createElement('time');
    time.className = 'comment-time';
    time.dateTime = c.createdAt;
    time.textContent = formatTime(c.createdAt) + (fresh ? ' · 刚发表' : '');

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = c.body; // ← 绝不用 innerHTML

    li.append(name, time, body);
    list.append(li);
    empty.hidden = true;
    list.hidden = false;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const setCount = () => {
    const n = list.children.length;
    count.textContent = n > 0 ? ` ${n} 条` : '';
  };

  // 取列表
  fetch(`/api/comments?slug=${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { comments: any[] }) => {
      data.comments.forEach((c) => render(c));
      setCount();
    })
    .catch(() => showError('留言没能加载出来。刷新页面再试一次。'));

  // 提交
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();

    const data = new FormData(form);
    const payload = {
      slug,
      name: String(data.get('name') ?? ''),
      body: String(data.get('body') ?? ''),
      website: String(data.get('website') ?? ''), // 蜜罐
    };

    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');

    fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return Promise.reject(new Error(body.error || '提交失败'));
        return body;
      })
      .then((body: { comment: any }) => {
        render(body.comment, true);
        setCount();
        // 只清空内容，**不清空名字** —— 同一个人可能想连着说几句
        (form.elements.namedItem('body') as HTMLTextAreaElement).value = '';
      })
      .catch((err: Error) => {
        // Review Focus ⑤：失败时**保留用户已输入的内容**，绝不重置表单
        showError(
          err.message && err.message !== '提交失败'
            ? err.message
            : '留言没提交成功。可能是网络问题，请稍后再试。'
        );
      })
      .finally(() => {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      });
  });
}
```

- [ ] **Step 2: 在 `src/layouts/Post.astro` 末尾引入**

```astro
<script>
  import '../scripts/comments';
</script>
```

- [ ] **Step 3: 构建并确认产物里是 2 个 script、且体积达标**

```powershell
npm run build
npm run verify
```

Expected: 构建通过；`build-output.test.ts` 里那条 script 数断言此时会**失败**（还是旧值 1）——
**这正是下一步要修的**，先看清失败信息再改。

- [ ] **Step 4: Commit**

```bash
git add src/scripts/comments.ts src/layouts/Post.astro
git commit -m "feat(comments): client script for loading and posting comments"
```

---

### Task 6: 修订被推翻的断言 + 新增守卫

> **执行时的实测修正（2026-09-26）**：本任务原假设「加评论会让文章页 `<script>` 从 1 个变 2 个」。
> **实测是错的** —— Astro 把同一个 `<script>` 块里的多个 `import` 合并成一个模块脚本，
> 所以标签数**仍是 1**，变的是体积（**587 → 2534 字节**）。
> 因此实际落地的断言是「**数量 ≤ 2（留余量）+ 内联合计 ≤ 4 KB（真正守住的东西）**」，
> 而不是下面 Step 1 里写的 `toBe(2)`。`design-spec.md` §6 第 4 条已同步。
> 这条修正本身值得留着：它说明「按预测写死数字」的断言是脆的，改成表达意图才稳。

**Files:**
- Modify: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: Task 5 的产物
- Produces: 新的可测标准（design-spec §6 第 4 条）

- [ ] **Step 1: 把 script 数断言从 1 改成 2，并加体积上限**

```ts
  it('文章页恰好两处 <script>（复制 + 评论），且各自在预算内', () => {
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts.length, `文章页有 ${scripts.length} 处 <script>`).toBe(2);

    const sizes = scripts.map((s) => Buffer.byteLength(s[1], 'utf8'));
    const total = sizes.reduce((a, b) => a + b, 0);
    console.log(`内联脚本体积: ${sizes.join(' + ')} = ${total} 字节`);
    expect(Math.max(...sizes), `最大脚本 ${Math.max(...sizes)} 字节超预算`).toBeLessThan(4096);
  });
```

- [ ] **Step 2: 新增 XSS 守卫（Review Focus ①）**

```ts
  it('评论脚本不使用 innerHTML（XSS 头号风险）', () => {
    const js = walk(DIST, (n) => n.endsWith('.js'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const html = readFileSync(page, 'utf8');
    const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    const all = js + inline;

    expect(all).not.toContain('innerHTML');
    expect(all).not.toContain('outerHTML');
    expect(all).not.toContain('insertAdjacentHTML');
    expect(all).toContain('textContent');   // 反向确认它确实用了安全 API
  });
```

- [ ] **Step 3: 新增「评论区不引入第三方」守卫**

```ts
  it('评论功能不引入任何第三方域名', () => {
    const html = readFileSync(page, 'utf8');
    expect(html).toContain('data-comments');            // 容器在
    expect(html).toContain('/api/comments');            // 用的是自己的端点（若内联进 HTML 的话）
    // 既有的「零第三方资源」用例已经覆盖了外部域名，这里只确认评论区没有额外域名
    const commentBlock = html.slice(html.indexOf('data-comments'));
    expect(/https?:\/\//.test(commentBlock.slice(0, 4000))).toBe(false);
  });
```

- [ ] **Step 4: 跑全量验证**

```powershell
npm run verify
```

Expected: **全绿**（用例数比之前多 2 条）。

- [ ] **Step 5: Commit**

```bash
git add tests/build-output.test.ts
git commit -m "test: revise js budget for comments and add xss/third-party guards"
```

---

### Task 7: 文档同步

**Files:**
- Modify: `docs/writing-guide.md`

- [ ] **Step 1: 在作者手册里加一节「评论」**

内容必须包含（照实写，不许写「应该」）：

1. **本地怎么调评论**：`npm run build` → `npx wrangler pages dev dist --d1=COMMENTS_DB`（写文章的日常仍然是 `npm run dev`，但它**不跑评论**）
2. **怎么删一条评论**（站主的日常操作）：

```powershell
npx wrangler d1 execute beishan-comments --remote --command "DELETE FROM comments WHERE id = 42"
```

3. **线上首次上线要做的三步**（登录 / 建库 / 绑 binding，变量名 `COMMENTS_DB`，生产 + 预览各一次）
4. **评论的边界**：无邮箱、无头像、无嵌套、无验证码；反垃圾 = 蜜罐 + 同 IP 每分钟 2 条

- [ ] **Step 2: Commit**

```bash
git add docs/writing-guide.md
git commit -m "docs: how to test, moderate and deploy comments"
```

---

## 自查清单

**1. 规格覆盖**

| design-spec §4.1 的要求 | 落在哪个任务 |
|---|---|
| 配色只用现有 token、不用 `--accent` 做按钮 | Task 4 Step 1 |
| 布局（细线分隔、同宽、无头像/卡片/圆角） | Task 4 Step 1–2 |
| 状态（空/加载/失败/校验/提交中/成功/失败保留输入） | Task 5 Step 1 |
| 无障碍（label、role=alert、蜜罐 tabindex、可读按钮文本） | Task 4 Step 2 + Task 5 |
| API 契约（GET/POST、400/429、限额） | Task 2 + Task 3 |
| JS ≤ 4 KB、文章页 ≤ 2 个 script | Task 6 Step 1–2 |
| 零第三方资源 | Task 6 Step 3（既有用例未放宽） |

**2. 占位符扫描**：已通读，无 TBD / "类似 Task N" / "加上适当的错误处理"。
两处**条件分支**（wrangler 的 `--local` / `--d1` 参数形态）都给了确切的排查命令与要记录到哪。

**3. 类型一致性**：`CommentRecord` / `CommentInput` / `Validation` 在 Task 2 定义一次，
Task 3 与 Task 5 全部按同一批字段名引用（`id/name/body/createdAt`；D1 行是 `created_at`，由 `toRecord` 转）。

**4. Review Focus 五条的测试位置**

| 输入 | 期望 | 测试落在 |
|---|---|---|
| 留言里写 `<script>` | 显示成文字，不执行 | Task 2 Step 1（原样保留）+ **Task 6 Step 2（不用 innerHTML）** |
| 一分钟连发 5 条 | 第 3 条起 429 且不落库 | Task 2 Step 1（`rateLimited`）+ Task 3 Step 4（真实请求） |
| 蜜罐被填 | 201 假装成功但不落库 | Task 2 Step 1 + Task 3 Step 4 |
| 超长 / 全空格 | 400 + 可读原因 | Task 2 Step 1 |
| 提交失败 | 保留已输入内容 | Task 5 Step 1（`.catch` 里不重置表单） |

**已知缺口（诚实记录）**：**评论功能必须依赖 JS** —— 站点是静态的，评论只能运行时取。
关掉 JS 就只能看到表单骨架和「还没有人留言」。这与代码复制按钮（可优雅降级）不同，
是评论这件事的本质限制，不是疏忽 —— 写进 `design-spec.md` §4.1 的状态表。
