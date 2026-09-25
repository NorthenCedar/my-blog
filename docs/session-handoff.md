# 会话交接 · B1 进行中（2026-09-26）

> 上一份交接已备份到 `.session-archive/session-handoff-prev.md`（18,320 字节，该目录已 gitignore）。

## 0. 一句话状态

莱茵方向改版：**P1（配色）** 与 **阶段 A（Base 外壳改名）** 已完成并提交；
**B1（首页 console 外壳 S1–S5，零动效）已交付并通过 delivery_check**；
**B2（动效层）进行中**：增量 1（重建基线 + 动效 token）已完成。

> **勘误（2026-09-26 补）**：本节此前写着「P1 已完成并提交」，**那是假的** —— 当时 `git status` 里 P1 组 5 个文件全挂着，
> HEAD 的 `tokens.css` 还是旧橙配色（`--accent: #e4572e`）。P1 一直到本轮才真正提交（`485c775`）。
> 教训与台账 `21a5c66` 同源：**没复核过的结论不要写进交接文档**，否则下一个会话会把它当事实继续往下推。

### 本轮补记（2026-09-26，B1 收尾 + B2 开工）

**新增提交（本地，仍未推）**：

| commit | 内容 |
|---|---|
| `7419527` | 台账：`delivery_check` 的 `page-verify` 硬编码缺陷 + 安全过门姿势 |
| `11929bf` | B1 本体：`chrome` 参数 / `index.astro` 外壳 / schema / 构建接线 / 生成器 + `.gitignore` |
| `520a0bb` | B2 底稿：动效层 16 条 CSS + 6 段 JS（带原型实测行号）→ `docs/b2-port-notes.md` |
| `485c775` | **P1 配色**（补提交）：tokens.css 换乳白+绿 + 断言表同步 |
| `fdc836f` | **B2 动效 token**：`--dur-enter` 320→640ms + 7 个新 token + 橙信号 |

**因此 §1、§2 两张表已过时**：P1 组（§2 第一段）与 B1 组都已提交；**仍未提交的是「内容模型」组**
（`content/site.md`、`src/lib/site.ts`）与原型/文档类未跟踪文件。

**B1 交付实测（可复核）**：删空 `public/gallery/` 后 `npm run build` exit 0 / 14 页，自生成 6 个 webp（3 主图 × 1280/800）；
主图 1600/q78 = 823,326 B → 1280/q70 = **486,498 B（−40.9%）**；390 视口 @DPR2 实测选中 **800w**（三方互校）；
双侧 L2 相对 B1 前基线 13/14 页逐字节相同；vitest 72 passed | 1 skipped；截图 1440×900 / 390×844 人眼复核。

**B2 当前状态**：基线冻结在 `_tmp-dist-b2-before`（51 文件 / 3,170,666 B）——
**注意 `_tmp-dist-b1-before` 已不可用**。token 改动的爆炸半径已实测（只碰 `:root`，14 页 HTML 归一化 14/14 相同）。
下一步是增量 2：背景装饰层 + `html.js` / `no-js` 两态门控。

## 1. 已提交（全部在本地，**未推**：`ahead = 10`，`origin/main` 仍在 `8b90f4e`，HEAD `010af19`）

| commit | 内容 |
|---|---|
| `f6e2440` | 决策台账：排除「另造一份外壳」方案 ③，给出 `chrome` 参数 + `.shell` 改名出口 |
| `c2935ef` | `refactor(Base)`：容器 `.wrap` → `.shell`，作用域样式搬入全局（**阶段 A**） |
| `1096a2d` | `feat(content)`：新增 gallery 集合（`title`/`date`/`images[{src,alt}]`） |
| `6340e74` | `docs`：B1 移植工单（原型结构骨架、数据接线、token 映射、验证配方） |
| `21a5c66` | 决策台账：验证脚本输出必须自证（判据名 + 对象 + 实测值），禁止裸 PASS |
| `010af19` | 决策台账：从内容反推渲染方式，不从 schema 反推（含可复核判据） |

## 2. 工作区未提交（12 个 M + 若干新增）

**P1 配色组**：`src/styles/tokens.css`（值换新 + 新增 `--accent-wash`/`--panel`）·
`src/components/Brandline.astro`（深色带下划线改 `--accent-bright`）·
`scripts/assert-tokens.mjs`（断言表同步）· `tests/tokens.test.ts`（越界断言重写为守 `--accent-bright`）·
`docs/design-spec.md`（§3.1/§5 同步 + 顶部两条声明 + §2 一处事实更正）

**内容模型**：`content/site.md`（站主批准的 `lat`/`lon`/`status`）· `src/lib/site.ts` 与
`src/content.config.ts` 的 site 集合加三个**可选**字段

**B1**：`src/layouts/Base.astro`（`chrome` 参数 + `chrome === 'console'` 时跳过 `<Band>`/`<SiteFooter>`）·
`src/pages/index.astro`（**新建**：console 外壳 + S1–S5，**零动效**）·
`src/lib/schema.ts` 与 `src/content.config.ts`（gallery 退回 `z.string()`，**alt 仍必填**）·
`scripts/gen-gallery-webp.mjs`（**新增**）· `public/gallery/.gitignore`（**新增**）

**新增文档（未提交）**：`docs/rhinelab-spec.md`（动效/配色/布局规范）· `docs/rhinelab-impl-plan.md`（P1–P8 计划）

**临时证据（按站主要求保留，勿删）**：`_tmp-dist-before/`、`_tmp-dist-b1-before/`（全量产物副本）·
`_tmp-style-before.json`/`_tmp-style-after.json`（计算样式）· `_tmp-b1-check.mjs`、`_tmp-b1-l2.mjs`、
`_tmp-diag.mjs`、`_tmp-p2-commit.mjs`、`_tmp-p2-style.mjs`、`_tmp-p2-verify.mjs`

## 3. 验证跑到哪一步（都是真实跑出来的，不是推断）

- **阶段 A**：归一化后**0 处无法解释的差异**；计算样式 14 页 × 3 容器 × 10 属性 **0 差异**；
  W1 三条 `shell=14` / `在 <main> 内 14` / `wrap 仍 28` 全 PASS
- **P1**：`assert-tokens` 9 项全过；`npm run build` 14 页 exit 0；`npx vitest run` 72 passed | 1 skipped exit 0
- **gallery 集合**：产物 42 个文件**逐字节 0 差异**
- **B1（最近一次跑）**：build 14 页 exit 0（1.01s）· vitest 72 passed | 1 skipped exit 0 ·
  **双侧 L2 两侧都 PASS**（13 页逐字节相同 + `index.html` 必须不同且差异已枚举）·
  `dist/gallery` 下 **6 个 webp** ✓ · `index.html` 里**没有裸 `./0xx.jpg`** ✓ ·
  体积 **2.10 MB → 3.49 MB（+1,429 KB）**，相对方案前的 **+30,690 KB** 砍掉 95%

## 4. 未完成

**⚠️ 先说一处我制造的不一致（必须先修）**：`scripts/gen-gallery-webp.mjs` 已改成
`WIDTHS = [1280, 800]` + `quality: 70`，但
① `public/gallery/` 里**还是上一轮生成的 1600 档文件**；
② `src/pages/index.astro:96` 的 srcset **还写着 `800w, 1600w`**。
三处必须同时对齐，否则 srcset 会指向不存在的档位。

1. **`package.json` 接线**（当前仍是 `"build": "astro build && node scripts/prune-draft-assets.mjs"`）：
   在 `astro build` **之前**加 `node scripts/gen-gallery-webp.mjs && `。
   **这是「仓库能跑」与「我的机器能跑」的分界线** —— `public/gallery/` 已 gitignore，
   不接线的话新克隆构建会在 `index.astro` 导入 manifest 时失败。
2. **档位对齐 + 自生成证明**：srcset 改成 `800w, 1280w`；**删掉 `public/gallery/` 后重建**，
   证明能自己生成；报主图新体积（旧值：1600/q78 = **823 KB**；若 1280/q70 仍偏重，站主已授权降到 1440/65）。
3. **两张截图**：首页桌面 1440×900 + 手机 390×844，`read_image` 看过再报。

## 5. 下一步第一件事

**`package.json` 接线**（第 4 节第 1 条）→ 然后依次做第 2、3 条，一次做完再停。

## 6. 边界与不变式（改代码前先读这一节）

- **推送状态**：**已推**（2026-09-26：`8b90f4e..57458c7` 共 29 个 commit 推到 `origin/main`，
  线上验收 14/14 通过）。**`content/` 正文仍未被动过**（相册 82 帧原图 + 文章原样；
  只有 `content/site.md` 在本轮加了站主批准的 `lat`/`lon`/`status`）
- **已定决策**：相册**原图不部署**；**不用 `image()`**（它会让集合里全部源图进产物，实测 +30 MB）；
  首页只出 **两档 webp（1280 / 800）**；`public/gallery/` 生成物**不入库**
- **B1 零动效**：`.field-item` / `data-label` 只是标记，**B2 才挂样式与脚本**
- **验收口径**：双侧 L2（13 页不变 **且** `index.html` 必须变、差异逐条枚举）+ 产物里图真的存在 + 体积数字 + 截图人眼确认
- **本机约束**：`bash` 走 WSL、看不到 `<本机工作区>`（**用 pwsh**，路径 `<博客仓库>`）；
  **构建与 headless Chrome 必须提权**（沙箱挡 esbuild 的 pipe stdio 与 Chrome spawn），
  且 **不能委派给子代理** —— 子代理无法提权（已实测，一个代理卡死在这上面）
- **推送必须先开 Steam++**（2026-09-26 实测，下次推照这条走，别重新踩）：
  直连 GitHub 时 **TCP 443 是通的**（实测 `Test-NetConnection github.com -Port 443` 成功），
  但 **TLS 握手被重置** —— `fatal: unable to access ... schannel: AcquireCredentialsHandle failed:
  SEC_E_NO_CREDENTIALS`；换成 `-c http.sslBackend=openssl` 也一样是 `Recv failure: Connection was reset`。
  **开 Steam++ 后**它会把 `github.com` 等域名写进 hosts 指向 `127.0.0.1` 的本地加速代理，
  `git ls-remote` / `git push` 立刻可用（实测那一轮 29 个 commit 一次推成功）。
  **推之前先核对远端**：`git ls-remote origin refs/heads/main` 必须等于本地 `git rev-parse origin/main`
  —— 这既是「远端有没有被人动过」的判据，也是 `--force-with-lease` 的判断依据。
  附带一条：开加速后 **PowerShell 的 `Invoke-WebRequest` 仍然失败**（`基础连接已经关闭: 接收时发生错误`，
  连 `northcedar.top` 都抓不了），但 **node 的 `fetch` 正常** —— 抓线上页面做验证一律走 node，
  别用 `Invoke-WebRequest`（更别据此判断"站点挂了"）
- **相册图片生成：云端每次构建都重编码，缓存只在本机有效**（2026-09-26 步骤 2 量化，**已知成本，不是问题**）：
  `public/gallery/` 是生成物、**不入库**，`scripts/gen-gallery-webp.mjs` 有「源图未变则跳过」的缓存
  （指纹 = 版本 + 源图 size + mtime + 档位宽 + 质量），但缓存**只在本地有效** ——
  Cloudflare Pages 每次构建都要从零编码全部 **164 个文件（82 帧 × 2 档）**。
  实测：本机首轮 **47.3s**、命中 0；本机二次 **0.0s**、命中 164；产物 **14.3 MB**（dist 合计 16.5 MB）。
  站主 2026-09-26 定案**档位不调**，理由三条：CF Pages 免费额度远大于此（单文件 25 MB / 文件数 20,000 /
  构建 20 分钟）· 「生成物不入库」不能破（入库就是 164 个 webp 跟着 git 走、改脚本要重提全部生成物）·
  800 档降体积的代价是**灯箱画质**，而灯箱是摄影展示的核心观赏场景，那 9.2 MB 换清晰度值。
- **验证脚本的规矩**（台账 `21a5c66`）：每条断言都要打印**判据名 + 对象标识 + 实测值**，禁止裸 `PASS`
- **渲染设计的规矩**（台账 `010af19`）：**从内容文件反推渲染方式，不从已写好的 schema 反推**
- **截图是判据的一部分，不是辅助**（台账 2026-09-26 那条，教训来自顶栏链接落到浏览器默认蓝）：
  断言覆盖**我想到的**，截图覆盖**我没想到的**（例如"我**没写** color"这种事，读 DOM 属性永远读不出问题）。
  **两者缺一，全绿都不等于交付。** 另外：说"我看过截图、没问题"时**必须能说出看了什么** ——
  那次缺陷在上一张截图里就已存在，我看了却说渲染正确，是看漏了；
  抓到之后要**把它变成断言**（截图负责发现，断言负责不复发）。
