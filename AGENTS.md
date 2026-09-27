# AGENTS.md — 给任何要改这个站的 AI 的入门说明

> 这份文件就是"提前要知道的东西"。**动手前请先读完它**，再按 §2 的顺序读那几份文档。
> 最后更新：2026-09-27（站主：北杉 / NorthenCedar）

---

## 1. 这是什么

**北杉札记**（northcedar.top）—— 一个**零第三方请求**的静态博客。

| 项 | 值 |
|---|---|
| 技术栈 | **Astro** 静态站（无框架运行时）+ Cloudflare Pages Functions（评论/点赞接口）+ D1 |
| 依赖 | 运行时只有 `astro` / `@astrojs/rss` / `@astrojs/sitemap`；开发期只有 `vitest` / `wrangler`。**不许再加** |
| 仓库 | `https://github.com/NorthenCedar/personal`（**私有**）· 主分支 `main` |
| 部署 | push 到 `main` ⇒ Cloudflare Pages **自动构建**（约 1 分钟）。**构建失败时线上继续挂着上一个成功的部署** |
| 内容 | `content/posts/<slug>/index.md`（一篇文章一个文件夹，图放同目录）· `content/pages/*.md`（关于/日志等单页） |
| 站主语言 | 中文。**所有回话、注释、文档、提交信息都用中文** |

---

## 2. 上手先读这些（按顺序，别一上来就读源码）

| 顺序 | 文件 | 读它的目的 | 怎么读 |
|---|---|---|---|
| ① | `docs/writing-guide.md` | **站主自己用的手册**：约定、token、常见坑、怎么发布 | 全读（51 KB，值得） |
| ② | `docs/architecture.md` + `docs/content-model.md` | 目录结构、内容管线、渲染链路 | 全读 |
| ③ | `docs/site-decisions.md` | **历次设计决定与理由**（为什么是这样而不是那样） | 按需查 |
| ④ | `tests/*.test.ts`（12 个） | **这才是真正的规格书**：站的硬约束都写成了断言 | 全读，尤其 `build-output` / `content-invariants` / `tokens` |
| ⑤ | `src/styles/tokens.css` | 全部设计 token（颜色/间距/字号）。**组件里不许出现字面色值** | 全读 |
| ⑥ | `src/layouts/Base.astro` · `src/lib/posts.ts` · `src/content.config.ts` · `src/tag-registry.ts` | 外壳（head/脚本/过渡标记）、文章管线、内容契约、标签注册表 | 全读 |
| ⑦ | `docs/boot-intro-work-order.md` | **工作日志**：做过什么、踩过什么坑、怎么验证的 | **只读目录 + 搜关键词**（155 KB，别通读） |
| ⑧ | `docs/comment-system-plan.md` · `functions/api/**` | 评论/点赞接口与 D1 | 改后端时读 |

**不要**通读 `docs/session-log-*.md`（历史会话流水，500 KB+，只用来考古）。

---

## 3. 铁律（多数有测试守着，破坏会被 `npm test` 当场抓住）

1. **零第三方请求**。不许 CDN、外链字体、统计脚本、图床、外链图标库。图片一律进仓库、走构建管线。
   断言在 `tests/build-output.test.ts`（"零第三方资源加载"）。
2. **字体自托管 · 图片必须带 alt**（`alt` 为空字符串会让 `npm test` 失败）。
3. **内容层原则：「主题不持有正文」** —— 页面与组件里不许硬编码文章内容。
4. **颜色/间距只能来自 token**（`tokens.css`），且 **alpha 一律写 8 位 hex**（`#1a1a1a0b`），
   组件里**不许写 `rgba()`**。
5. **改完必须 `npm run verify`**（= `build` + `vitest`）。**Cloudflare 只跑构建、不跑测试** ⇒
   测试能抓到的问题会**静默上线**。
6. **推送到 `main` 就是在发布**。推送前确认：`npm run verify` 过、`git status` 里没有漏提交的图片、
   没有把临时文件加进去（见 §5）。
7. **回滚用 `git revert`，绝不 `reset --hard` / 强推**：已推送的历史不重写，回滚本身也要可再撤。

---

## 4. Windows 环境注意事项（这个仓库在 Windows 上开发）

- 终端：`bash` = **Git Bash**（一等公民）；文件操作用 **pwsh/PowerShell**。构建、跑 Chrome、装包
  可能需要**放宽沙箱**（一次性授权）。
- **绝不要**对仓库文件用 PowerShell 的 `Set-Content -Encoding UTF8` ✗ —— 它会加 **UTF-8 BOM**，
  破坏 frontmatter 解析。（2026-09-27 实际踩过：`index.md` 开头被写成 `﻿---`。）
- `.gitattributes` 没有，`core.autocrlf=true` ⇒ 新克隆是 **CRLF**。**任何 frontmatter 正则都要写成
  `\r?\n`**，否则静默失效（踩过：`gen-gallery-webp.mjs`、`prune-draft-assets.mjs`）。
- 图片相关脚本入口：`scripts/gen-gallery-webp.mjs`（相册）、`scripts/prune-draft-assets.mjs`（草稿资源）。

---

## 5. 别做的事（每条都有真实事故）

| 别做 | 为什么 |
|---|---|
| `git add -A` 不看内容 | 2026-09-27：误提交 239 个 `_tmp*` 临时文件 + 一个嵌套仓库 gitlink ⇒ Cloudflare 构建 **Failure**、友链上线失败。仓库只提交你**明确知道**的文件 |
| 只 `git add` 那篇 `index.md` 就推 | Typora 插进来的图是**未跟踪文件**，漏了就会构建失败（2026-09-27 实际发生）。用 `git add content/posts/<你的文章>/` 整个文件夹 |
| 往仓库根目录丢临时产物 | `/_tmp*` 已在 `.gitignore` 里；探针/截图一律用 `_tmp-` 前缀，别改这个约定 |
| 在 `_tmp*` 之外写调试脚本 | 同上；根目录的干净是被守护的 |
| 改 `transition.css` 的 z-index 阶梯 | 抽屉(40/41) < 过渡蒙版(45) < 灯箱(50) < 开场(60) < 光标(64/65/66)；动了会出现"灯箱被蒙版挡住""抽屉被正文盖住"这类回归（都发生过） |
| 断言绑死产物形态 | 反复踩：产物里 `<li>` 会多 class、`body::before` 被压成 `body:before`、元素会带 `data-astro-cid-*`。断言要容忍这些形态差异 |
| 删掉 `prefers-reduced-motion` 分支 | 站上有明确的减少动效支持，删了等于对这部分用户不负责 |

---

## 6. 怎么验证（这个站不接受"我觉得对"）

- 页面类改动：**真开无头 Chrome 截图 + 人工看图**（`read_image`），不要只跑断言。
  仓库里有一批现成的探针可参考：`_tmp-*.mjs`（CDP + sharp，含 hover 模拟、像素判据、帧率测量）。
- **颜色/位置这类判断走计算样式或像素**，不要靠"读 CSS 文本猜"。
- 部署类改动：**门闩要绑本次改动本身**（例如改色就查那个色值），否则部署还没推进就"验过了"是假通过
  —— 这个坑一天内踩过四次。
- 排查"push 了但线上没变"：① `npx wrangler pages deployment list --project-name=personal` 看那次部署是不是
  **Failure**；② `git status` 看文件是否真的进了仓库；③ 本地 `npm run build` 复现。

---

## 7. 交付习惯（站主的期望）

1. 做完**跑到真的通过**再汇报，并给出**证据**（命令、日志、截图），不要只说"已修复"。
2. 新改动写进两处文档：**手册** `docs/writing-guide.md`（用户要看"怎么用/怎么调"）+ **工作日志**
   `docs/boot-intro-work-order.md`（下一个 AI 要看"为什么这么做、踩了什么坑"）。
3. 站上的 **`/log/` 日志页**（内容在 `content/pages/log.md`）由 AI 代笔：加一条 `date/version/changes`
   记这次改了什么。**版本号按数值排序**（见 `src/lib/log-order.ts`）。
4. 提交信息用中文，写清"为什么"（不只写"改了什么"）。
5. 不确定就问站主（尤其：发布与否、视觉取舍、要删东西）。

---

## 8. 常跑的命令

```bash
npm run dev      # 本地开发（会先跑两个生成脚本）
npm run build    # 构建（含首页美术、开场 CSS、相册 WebP、草稿资源清理）
npm run test     # 只跑测试
npm run verify   # 构建 + 测试 —— 推送前必跑
npm run dev:cf   # 用 wrangler 起本地 Pages（含 Functions/评论接口）
```
