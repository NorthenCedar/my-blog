# 云端写作台实施计划

> **供执行代理：** 必须使用 `executing-plans` 或 `subagent-driven-development` 技能逐项执行。本文步骤使用复选框记录，不把已写计划当成已实现功能。

**目标：** 手机、电脑浏览器通过本站 `/write/` 保存私密文章和说说草稿、上传压缩图片，并在云端完整校验后安全发布，电脑关机也能使用。

**架构：** 写作专用静态界面调用同源 Pages Functions；现有 D1 保存草稿、图片和不可变发布任务。固定 GitHub Actions 工作流在临时检出中校验、普通推送，随后读取该提交的 Cloudflare 部署结果。GitHub main 是已发布内容的权威来源。

**技术栈：** Astro、原生 TypeScript、Pages Functions、现有 D1、Node 24.21.0、Git、GitHub Actions；仅新增明确声明的 `yaml` 服务端依赖，无 R2、富文本框架或新服务器。

**设计：** [2026-10-22-cloud-writer-design.md](../specs/2026-10-22-cloud-writer-design.md)。执行前同时读取该设计、本计划和仓库 AGENTS.md。

## 全局约束

- 不新增计费服务、不升级套餐；额度不足停止对应操作并保留草稿，不购买额度。
- 保留现有站主账户及 `__Host-nc_session`；`OWNER_USER_ID` 缺失时 fail closed；浏览器不得接收服务端密钥。
- 只对正式同源和显式本地开发环境启用写作 API；私密响应 `Cache-Control: no-store`；无开放 CORS。
- 原选择图片最多 20 MiB、40,000,000 像素；压缩后长边最多 1920、单图 300 KiB；上传正文最多 320 KiB。
- 文章最多新增 20 张、说说最多新增 9 张；图片有效载荷最多 64 MiB，总有效载荷最多 96 MiB，最多 100 份可编辑草稿；已有素材不能被这些上传限制删除。
- 单份 Markdown UTF-8 正文最多 128 KiB；2 秒输入防抖，持续输入每 15 秒至少尝试一次保存；收到成功响应才显示云端已保存。
- 保存采用 revision CAS 和请求幂等；发布使用不可变快照、活动任务互斥、租约和明确状态，不自动覆盖冲突。
- 一次内容发布必须完整 `npm ci`、`npm run verify`；工作流最多 10 分钟；只普通非强制推送，main 更新后必须重新校验。
- 第一版只新增/编辑/发布文章和说说；保留旧视频、未知字段、注释及说说 ID。日志、相册、标签管理、视频上传、已发布内容删除另行扩展。
- 产品实现不修改 Windows 写作台，不自动拉取、stash、rebase、reset 或强推本地仓库；不更改用户 Codex 配置。
- 界面与文档中文；新增颜色/间距使用 token；不把开场、WebGPU 或自定义光标引入写作界面。
- 现有迁移已到 `0006_reply_notices.sql`，新迁移使用 `0007_cloud_writer.sql`，不可复用 0005/0006。
- 生产数据库迁移和首次 main 推送分别在备份、验收及当次授权后执行。写计划和本地实现不等于已经上线。

## 审查重点

以下五类是容易遗漏的真实输入，已在对应任务安排断言：

1. 保存成功但响应丢失、旧响应迟到：不能重复增版本，不能把旧保存显示成当前输入已保存（任务 2、8）。
2. 发起发布后继续写同一篇：旧快照成功不能覆盖新输入，新输入要以刚发布版本为基线（任务 6）。
3. 旧文章有未知 YAML 字段、视频、CRLF、代码块中的图片示例：只改明确编辑的内容，不误删或误替换（任务 4）。
4. 退出、改密、注销发生在上传或任务运行期间：存储写入及推送许可重新核对权限，旧回调不能恢复账户数据（任务 1、3、6）。
5. Git push 成功但网络应答/部署回调丢失：按任务提交和工作流结果恢复，不能重复提交，也不能把推送成功当成网站上线（任务 7、10）。

## 文件与接口地图

所有路径相对 `D:/router/blog/`，新增目录按职责分组：

| 文件 | 职责 |
|---|---|
| `src/lib/writer/model.ts` | 共享数据类型、限额、标识与边界验证；无 DOM、Git 或数据库 |
| `src/lib/writer/content.ts` | YAML/Markdown 保留式读写与受控图片引用转换；Edge、Node 共用 |
| `functions/api/_lib/writer-auth.ts` | 正式域名、站主会话、SQL 活跃证明、私密响应 |
| `functions/api/_lib/writer-drafts.ts` | 草稿、幂等保存、配额事务与导出 |
| `functions/api/_lib/writer-assets.ts` | 私有图片字节、签名、去重、引用和清理 |
| `functions/api/_lib/writer-repository.ts` | 固定 GitHub 仓库/提交的读取及受控外部请求 |
| `functions/api/_lib/writer-jobs.ts` | 发布快照、活动任务、幂等派发、租约与状态恢复 |
| `functions/api/writer/{session,content,drafts,assets,publish,runner}.ts` | 薄 HTTP 适配，不重复领域逻辑 |
| `migrations/0007_cloud_writer.sql` | writer_ 表、引用、唯一约束、额度与级联 |
| `src/layouts/WriterShell.astro`、`src/pages/write.astro`、`src/styles/writer.css` | 独立空外壳、可见标签与移动布局 |
| `src/scripts/writer/{api,recovery,save,images,preview,editor,publish,index}.ts` | 分开的浏览器职责，无服务端模块导入 |
| `scripts/writer/{prepare,publish}.mjs` | Node runner 的候选内容与最终推送阶段 |
| `.github/workflows/cloud-writer.yml` | 固定 main、有限权限、隔离发布凭据的执行环境 |
| `tests/_writer.ts`、`tests/writer-*.test.ts` | SQLite、临时 Git 仓库、HTTP 断言和可控制的外部边界 |
| `scripts/verify-cloud-writer.py` | 临时本地 D1 和独立 Chrome 的真实浏览器验收 |

### 共享类型（任务 1 建立，后续不得自行改名）

```ts
export type WriterKind = 'post' | 'talk';
export type WriterAssetRef = { sha256: string; alt: string };
export type WriterValue = {
  fields: Record<string, unknown>;
  body: string;
  assets: WriterAssetRef[];
};
export type WriterBase = null | {
  commit: string; blobSha: string; text: string; itemHash?: string;
};
export type WriterDraft = {
  id: string; kind: WriterKind; key: string; revision: number;
  base: WriterBase; value: WriterValue; publishedRevision: number;
};
export type WriterSave = {
  id: string; requestId: string; expectedRevision: number; value: WriterValue;
};
export type WriterJobState = 'queued' | 'dispatch_unknown' | 'validating'
  | 'ready' | 'pushed' | 'deployed' | 'conflict' | 'failed'
  | 'cancelled' | 'deployment_failed';
export type WriterJob = {
  id: string; draftId: string; revision: number; state: WriterJobState;
  runId: string | null; commit: string | null; code: string | null;
};
export type WriterChange = { path: string; bytes: Uint8Array };
```

领域错误统一带数字 HTTP status 和稳定 code，页面映射成中文；错误消息不携带草稿全文、Cookie 或 token。`kind/key/base` 由创建/导入接口确立，普通保存不接受它们的覆盖。

## Task 1：站主边界、共享模型与真实测试夹具

**文件：** 新增 model.ts、writer-auth.ts、session.ts、tests/_writer.ts、tests/writer-auth.test.ts；读取现有 visitor-store.ts、public-write.ts、tests/_visitor-db.ts。不要改现有 admin 鉴权。

**接口：** `requireWriter(request, env, write=false): Promise<Account>`；`writerJson(data, status=200): Response`；`validateWriterValue(kind, value): WriterValue`。环境扩展 `VisitorEnv`，显式本地开关 `WRITER_LOCAL_DEV?: string`，不接受浏览器传入开关。

测试中的 `writerSession(request,env)` 是 session.ts 的 onRequestGet 薄适配别名；`writerFixture({owner})` 返回真实库、请求构造器和 env，并负责关闭本夹具的 SQLite，不触碰生产数据。

- [ ] 写 HTTP 红测。`writerFixture()` 用真实 SQLite 建立账户及会话，并提供 `request(path, method, json?)`、`env`、`sqlite`、`close()`；密码流程不在夹具重复测试。

```ts
it('普通访客伪造 isOwner 也不能读取草稿', async () => {
  const s = await writerFixture({ owner: false });
  const response = await writerSession(s.request('/session?isOwner=true'), s.env);
  expect(response.status).toBe(403);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).not.toContain('password_hash');
});
```

- [ ] 跑 `npx vitest run tests/writer-auth.test.ts`，确认普通访客被错误放行的断言先红；模块加载失败不算行为红测。
- [ ] 实现域名检查、`requireAccount` 与 owner 完整 ID 对比。写入复用 `guardWrite` 和 `writeProof`；二进制上传另检查同源标记，不调用只接受 JSON 的 guardPublicWrite。

```ts
const user = await requireAccount(request, env);
if (!env.OWNER_USER_ID) fail(503, '写作台尚未完成站主配置');
if (user.id !== env.OWNER_USER_ID) fail(403, '此处仅供站主使用');
```

- [ ] 覆盖缺 owner、未登录、过期会话、重复 Cookie、Origin:null、跨站、预览域名；生产环境仅 https://northcedar.top，本地仅显式开关及 loopback。
- [ ] 单测绿后完整 verify，按明确文件清单提交“建立云端写作台站主权限边界”。

## Task 2：D1 草稿、版本保存、幂等与额度

**文件：** 新增 0007_cloud_writer.sql、writer-drafts.ts、drafts.ts、tests/writer-drafts.test.ts；扩展 _writer.ts 在内存库应用迁移两次验证可重跑。

**接口：** `createDraft(db, proof, {kind,key,base,value}): Promise<WriterDraft>`；`saveDraft(db,proof,WriterSave): Promise<WriterDraft>`；`readDraft(db,owner,id)`、`listDrafts(db,owner)`；`exportDraft(db,owner,id)`；`deleteDraft(db,proof,id,revision)`。`proof` 定义为现有 writeProof 的结果及服务端确认的 owner ID。

- [ ] 写双请求/响应丢失红测，不能仅断言 SQL 文本。

```ts
const first = await saveDraft(db, proof, input);
const again = await saveDraft(db, proof, input);
expect([first.revision, again.revision]).toEqual([2, 2]);
await expect(saveDraft(db, proof, { ...input, requestId: otherId }))
  .rejects.toMatchObject({ status: 409 });
expect((await readDraft(db, owner, id)).value.body).toBe('第一次保存');
```

- [ ] 跑 `npx vitest run tests/writer-drafts.test.ts`，先观察第二设备覆盖或重复增版本的失败。
- [ ] 迁移新增设计六张表，并增加 `writer_save_receipts`（草稿请求标识、内容摘要、结果 revision）与 `writer_requests`（事务内成功占用标识）。请求标识与不同 payload 重用返回 409；回执在草稿删除时级联。
- [ ] 使用 D1 batch 的原子事务和条件 INSERT/UPDATE。额度预留先依据 expectedRevision 和 LIVE_ACCOUNT_SQL 条件产生请求占用行，随后所有数据/引用/额度语句只在该占用成功时执行；配额失败、CAS 失败不能留下空预留或扣减。通过 CHECK 约束触发整批回滚，不把“0 rows changed”当异常自动回滚。
- [ ] 单份草稿记录按 UTF-8 字节计算额度；写入正文、基线均有边界。总额只允许增量不超过剩余额度，额度已满时仍允许不增长的保存、读取和导出。
- [ ] 测试并发 CAS、请求 ID 重用不同内容、UTF-8 中文字节、100 草稿上限、事务中断回滚、删除级联、鉴权后撤销会话。绿后 verify 并提交“保存私密草稿并防止并发覆盖”。

## Task 3：图片接收、私有读取、去重和引用清理

**文件：** 新增 writer-assets.ts、assets.ts、tests/writer-assets.test.ts。

**接口：** `inspectWriterWebp(bytes): {width,height,sha256}`（可异步计算摘要）；`putAsset(db,proof,bytes)`；`readAsset(db,owner,sha256)`；`deleteAsset(db,proof,sha256)`。真实 HTTP 用原始 WebP 请求体，元数据从内容读取；alt 保存在草稿。

- [ ] 用仓库已存在的小 WebP 或 sharp 生成的固定测试图写红测，另有非 UTF-8 字节不能经文本层改变的断言。

```ts
const one = await putAsset(db, proof, validWebp);
const two = await putAsset(db, proof, validWebp);
expect(one.sha256).toBe(two.sha256);
expect(new Uint8Array((await readAsset(db, owner, one.sha256)).bytes))
  .toEqual(validWebp);
expect(sqlite.prepare('SELECT count(*) AS n FROM writer_assets').get()?.n).toBe(1);
```

- [ ] 跑 `npx vitest run tests/writer-assets.test.ts`，观察去重、限额、匿名读取失败先红。
- [ ] 实现流式实际字节上限，不信任 Content-Length/MIME。解析 RIFF/WEBP 长度和 VP8/VP8L/VP8X 尺寸，拒绝动画标记、超长边、超像素、截断、未知编码及 300 KiB 以上文件。
- [ ] 使用任务 2 的事务机制使去重和额度占用一致；引用检查覆盖草稿与不可变 job，删除被引用图片返回 409，不自动删除其他图片。
- [ ] 测试并发上传临界额度、伪造文件类型、鉴权后改密、无 Cookie GET、清理后 BLOB 消失与额度恢复。绿后 verify 并提交“接入受限私有配图存储”。

## Task 4：保留式内容转换和发布路径限制

**文件：** 新增 content.ts、tests/writer-content.test.ts；修改 package.json、package-lock.json、tests/_deps.ts。配置改动前备份原文件到 work，依赖安装在计划批准后才执行。

**接口：** `readPost(text): WriterValue`；`readTalks(text): {key:string,value:WriterValue,itemHash:string}[]`；`planChanges({kind,key,base,value}, currentText, assetBytes): WriterChange[]`。assetBytes 是按摘要索引的 Uint8Array 映射；kind/key 必须先通过 model 验证。

- [ ] 写真实 CRLF、注释、视频、未知字段、相邻说说夹具。新图片引用使用 `writer-asset:<sha256>`，仅在实际图片目的地址转换，不改代码块中的示例。

```ts
const changes = planChanges(draft, latestTalksWithAnotherNewItem, assets);
const text = new TextDecoder().decode(changes.find(c => c.path.endsWith('talks.md'))!.bytes);
expect(text).toContain('# 原有说明');
expect(text).toContain('id: talk-old');
expect(text).toContain('id: talk-from-desktop');
expect(text).toContain('videos:');
expect(readTalks(text).find(t => t.key === 'talk-old')?.value.body).toBe('这次修改');
```

- [ ] 跑 `npx vitest run tests/writer-content.test.ts`。安装显式精确版本 `yaml`，使 package/lock/白名单一致；初次依赖缺失不算功能红测，模块能运行后再确认保留行为失败。
- [ ] `parseDocument` 禁用自定义类型和无限别名展开；使用节点 range 定点替换目标字段/条目，未编辑的前后源字节保留。不整篇 dump。文章最终 `draft:false`，旧 slug 及未编辑字段保持；新文章 key 仅允许既有 slug 规则。
- [ ] 新说说在服务端分配 `talk-<uuid>`；编辑按固定 ID 和 itemHash 比较，新说说保留最新文件的其他条目。对无显式旧 ID 的条目先按现行页面算法固定原标识，不因插入改变归属。
- [ ] 图片名称由摘要生成。拒绝路径穿越、反斜线、NUL、URL 编码绕过、符号链接、未知摘要、任意 src/ 文件及删除操作；仅允许目标文章目录或 talks.md 加本次 talks 图片。
- [ ] 覆盖同篇冲突、同说说冲突、CRLF 不变、YAML 冒号/引号、别名炸弹、代码片段不改、重复 slug 和二进制摘要不符。绿后 verify 并提交“安全转换云端内容且保留旧字段”。

## Task 5：固定仓库读取和内容导入

**文件：** 新增 writer-repository.ts、content.ts 路由、tests/writer-repository.test.ts；连接 drafts.ts 的导入动作。

**接口：** `createWriterRepository(token, fetchImpl=fetch)` 返回 `head()`、`listPosts(commit)`、`readPost(commit,key)`、`readTalks(commit)`、`readImage(commit,path)`、`dispatch(jobId)`、`findRun(jobId)`、`run(runId)`、`deployment(commit)`。只能固定 NorthenCedar/personal、main 和 cloud-writer.yml，不能传 arbitrary URL/ref。

导入入口为 `importPublished(repo, db, proof, {kind,key}): Promise<WriterDraft>`；它先取得确定提交，再解析原文并调用任务 2 的 createDraft，不能接收客户端提供的原始 base。

- [ ] 用完整 GitHub HTTP 结构的传输替身写红测；只替换外部 fetch，内容转换仍跑真实实现。

```ts
const opened = await importPublished(repo, db, proof, { kind: 'post', key: 'example' });
expect(opened.base?.commit).toBe('1'.repeat(40));
expect(opened.base?.blobSha).toBe('2'.repeat(40));
expect(opened.value.body).toBe('正文\n');
await expect(repo.readPost('main', '../../.github')).rejects.toMatchObject({ status: 400 });
```

- [ ] 跑 `npx vitest run tests/writer-repository.test.ts`，先确认读取跨提交或路径越界被测出。
- [ ] 每次打开内容先取得 commit，再以该 SHA 读取 blob；用字节/base64 解码，禁止二进制经过文本替换。小页分页，列表不下载全部配图。响应体限额、8 秒超时，GET 只对 429/5xx 有限重试；不把 token 加入 URL。
- [ ] 新草稿 base 为 null，导入的基线仅由服务端仓库读取建立，保存不能伪造。私有仓库配置缺失时新建本地云草稿仍可保存，导入和发布显示不可用。
- [ ] GET 入口鉴权后读取，返回的错误不能带 GitHub 原始响应中的凭据或源码；正文、图片和标签只返回编辑所需内容。绿后 verify 并提交“读取确定版本的已发布内容”。

## Task 6：不可变发布快照、任务互斥、租约和撤销

**文件：** 新增 writer-jobs.ts、publish.ts、runner.ts、tests/writer-jobs.test.ts。

**接口：** `createJob(db,proof,{draftId,revision,requestId}): Promise<WriterJob>`；`claimJob(db,jobId,runId): Promise<{job,lease,snapshot}>`；`authorizePush(db,jobId,lease,runId)`；`recordJob(db,jobId,lease,event)`；`cancelJob(db,proof,jobId)`；`reconcileJob(db,jobId,repo)`。run 元数据由任务 5 的固定 GitHub 仓库接口验证，不信任调用者声明。

浏览器查询通过 `readJob(db,owner,jobId): Promise<WriterJob>`；内部读取也必须校验任务归属。推送回执包含 `{state:'pushed',commit,publishedBase}`，其他状态事件使用同一 WriterJobState 联合类型，publishedBase 是本次已验证目标内容的新 WriterBase。

- [ ] 写冻结后继续编辑红测，以及重复点击、不同 requestId 并发发布的真实 SQLite 事务断言。

```ts
const job = await createJob(db, proof, { draftId: id, revision: 2, requestId });
await saveDraft(db, proof, { id, requestId: nextId, expectedRevision: 2, value: newer });
await recordJob(db, job.id, lease, { state: 'pushed', commit: sha, publishedBase });
const current = await readDraft(db, owner, id);
expect(current.value.body).toBe('发布期间继续写的内容');
expect(current.publishedRevision).toBe(2);
expect(current.base?.commit).toBe(sha);
```

- [ ] 跑 `npx vitest run tests/writer-jobs.test.ts`，观察快照被后续保存改变或新正文被回执覆盖的失败。
- [ ] 对活动状态建立 owner 唯一约束；快照及 asset 引用在同一事务冻结并计入额度；任务包含 owner auth_version。runner shared secret 独立验证，返回一次性租约明文、库内只留摘要；每次状态修改同时比较租约、runId、旧状态和 job 版本。
- [ ] 状态只能沿规定路径转换；发布许可重查账户和 auth_version。注销级联清理数据，旧回调不能重建。超时任务查询实际 run 再判断失败，不仅凭本地计时清理。
- [ ] 推送后的草稿只推进 base 与 publishedRevision，不覆盖新 value；旧事件幂等，冲突不丢输入。测试改密/注销/取消、错租约、旧 run 回调、素材清理受快照保护。绿后 verify 并提交“冻结发布快照并控制任务状态”。

## Task 7：临时 Git 候选、完整校验和普通推送

**文件：** 新增 scripts/writer/prepare.mjs、publish.mjs、tests/writer-publish.test.ts、tests/_writer-git.ts。

**接口：** `prepare({repoDir,snapshot,assets}): {baseHead,paths,contentDigest}`；`publish({repoDir,prepared,authorize,runGit}): Promise<{commit,pushed}>`。prepare 调用 content.ts；Node 24 原生读取 TS，所有内部 import 使用可解析的显式扩展名。

`tests/_writer-git.ts` 的 `gitFixture()` 创建一个裸库、cloud/local clone 并注册临时目录清理；提供 cloudCommit(path,text)、localCommit(path,text)、localPush()、localMergeRemote() 和 localRead(path)。这些方法只负责准备/观察真实 Git 状态，发布逻辑必须调用产品 prepare/publish，不能在夹具里复制实现。

- [ ] 用 mkdtemp 建裸远端及两份真实 clone 写红测，不连接真实 GitHub。

```ts
const s = gitFixture();
s.cloudCommit('content/posts/phone-a/index.md', '手机文章一');
s.cloudCommit('content/posts/phone-b/index.md', '手机文章二');
s.localCommit('src/local-change.ts', 'export const n = 1');
expect(s.localPush().status).not.toBe(0);
s.localMergeRemote();
expect(s.localRead('content/posts/phone-b/index.md')).toBe('手机文章二');
expect(s.localRead('src/local-change.ts')).toBe('export const n = 1');
expect(s.localPush().status).toBe(0);
```

- [ ] 跑 `npx vitest run tests/writer-publish.test.ts`，另测“校验结束前远端插入提交”，要求 cloud push 不覆盖且新文章仍在远端。
- [ ] prepare 以最新 main 的目标文件检查草稿基线，只用数组参数调用 Git/Node，不执行拼接 shell。建立精确 path 清单与候选内容摘要；lstat 每段路径拒绝符号链接；不使用 add -A。
- [ ] 在准备后的临时检出中完整 npm ci、verify。publish 再检查范围、内容摘要和远端头；main 变了就返回需要重新校验，不能 rebase 后复用绿灯。
- [ ] Git 提交包含 `Writer-Job: <jobId>`，普通 push。网络结果不确定时 fetch 后核对提交是否在 main 祖先链，已存在则回传成功；不能创建重复提交。Git token 经临时进程环境配置传入，只在 push 步骤可读，不写 remote URL。
- [ ] 覆盖 UTF-8/二进制、源码越界、真实删除拒绝、修改期间快照变更、空变更幂等、拒绝强推与可疑 Git 参数。绿后 verify 并提交“校验后以普通 Git 推送发布”。

## Task 8：浏览器保存调度、恢复、预览与登录状态

**文件：** 新增 api.ts、save.ts、recovery.ts、preview.ts、tests/writer-client.test.ts。

**接口：** `writerApi(path,init)` 统一处理 no-store、同源标记、错误 code；`createSaveController({load,save,recovery,clock,onState})` 返回 `edit(value)`、`saveNow()`、`dispose()`；`createRecoveryStore(indexedDB)`；`renderWriterMarkdown(body,resolveImage): DocumentFragment`。

单测调度夹具提供可推进的 clock、受控 Promise 的 resolveFirstSave/resolveSecondSave 及记录 onState 的 states；保存请求实际经过 createSaveController。外部 HTTP 可延迟应答，不能用替身取代被测保存状态机。

- [ ] 使用可注入时钟但真实调度器的红测，验证迟到响应不能谎报新输入已保存。

```ts
controller.edit(first);
clock.advance(2000);
controller.edit(second);
resolveFirstSave({ revision: 2 });
expect(states.at(-1)).not.toBe('saved');
clock.advance(2000);
resolveSecondSave({ revision: 3 });
expect(states.at(-1)).toBe('saved');
```

- [ ] 跑 `npx vitest run tests/writer-client.test.ts`；真实 IndexedDB 行为留到任务 11 的浏览器场景，不能仅用内存 Map 假装验过持久化。
- [ ] 输入先写恢复副本，再排保存；恢复 key 包含 user ID、draft ID 与 base 版本。请求重试复用 requestId 和 value，确认回执后才推进 revision。409/401/断网均保留当前输入，不盲目覆盖。
- [ ] IndexedDB 被拒绝或配额满时显示本设备备份失败，提供即时复制/下载。注销和账户切换清理恢复副本、DOM 和 Object URL，不让新账户读上个账户内容。
- [ ] 预览建立元素及 textContent，不注入原始 HTML；链接限制协议，图片使用批准的受控 resolver。覆盖 javascript URL、事件属性、嵌套代码块和脚本；绿后 verify 并提交“提供可靠的浏览器草稿恢复”。

## Task 9：手机图片选择、压缩确认和独立编辑界面

**文件：** 新增 WriterShell.astro、write.astro、writer.css、images.ts、editor.ts、index.ts、tests/writer-output.test.ts；修改 astro.config.mjs 的 sitemap filter、必要的 writer token 和账户页站主入口。

**接口：** `prepareWriterImage(file): Promise<{blob,width,height,previewUrl}>`；`mountWriterEditor(root,api,recovery)`；`mountWriter(root)`。以 session 接口作为首个私密请求，未鉴权不加载内容。

- [ ] 写构建产物红测：`/write/` 存在、noindex、不在 sitemap，HTML 不含草稿哨兵及 token；普通页面脚本闭包不能到达 writer 脚本或 YAML。

```ts
expect(writeHtml).toContain('name="robots"');
expect(sitemap).not.toContain('/write/');
expect(writeHtml).not.toContain('未发布私密哨兵');
expect(jsClosure(homePath).files).not.toContain(writerEntry);
```

- [ ] 跑 `npx vitest run tests/writer-output.test.ts`，在首次 build 之后观察输出隔离失败，而非把缺 dist 当通过。jsClosure 使用现有 build-output.test.ts 的实际脚本闭包遍历算法，提取到 tests/_writer-output.ts 后共享；homePath 是 dist/index.html，writerEntry 是从 dist/write/index.html 解析出的真实脚本路径。
- [ ] 建立空外壳、文章/说说/草稿/发布入口；手机单栏切换预览，桌面列表并排。正文不进入产品模板，界面文案集中在 writer UI 模块。登录使用现有账户能力，登录过期提示保留输入后重新认证。
- [ ] 图片读取头信息后限制尺寸，再 decode 重绘、正确处理方向、转 WebP，逐步调质量至 300 KiB；不能达标就停止并让作者选择更小图片，不默默把截图压到不可读。上传前看得到成图，alt 必填，失败保留待重试 Blob。
- [ ] 配图排序提供触摸拖动和上移/下移按钮；增删引用不擅自删 D1 图片。新图插入受控 Markdown 引用，旧图片和视频字段保留。
- [ ] 运行浏览器 320/390/768/1280、亮暗主题、文件选择/粘贴和旋转照片用例；绿后 verify 并提交“加入适配手机的云端编辑界面”。

## Task 10：工作流连接与可恢复部署状态

**文件：** 新增 cloud-writer.yml、src/scripts/writer/publish.ts、tests/writer-workflow.test.ts；连接 repository.ts、jobs.ts、publish.ts、runner.ts。

**接口：** 固定 workflow_dispatch 仅接收 jobId，run-name 包含该 ID；`mountPublish(root,api)` 显示发布摘要及状态；`reconcileJob` 用 runId/commit 恢复，区分 push 和 Cloudflare 成功。

- [ ] 写 API/任务红测：派发应答丢失后从真实结构 run 列表找到同一 job；成功 push 后 Cloudflare 检查失败必须显示 deployment_failed。

```ts
await reconcileJob(db, job.id, repoWithLostDispatchResponse);
expect((await readJob(db, owner, job.id)).runId).toBe('1001');
await reconcileJob(db, pushed.id, repoWithFailedCloudflareCheck);
expect((await readJob(db, owner, pushed.id)).state).toBe('deployment_failed');
```

- [ ] 跑 `npx vitest run tests/writer-workflow.test.ts`，先观测重复派发和把 pushed 当 deployed 的失败。
- [ ] 工作流固定 main、并发组、timeout-minutes:10、permissions contents:read；checkout persist-credentials:false。第三方 Action 的完整 commit SHA 在实施时从官方仓库 tag 解析并复核后写死，不保留漂移 tag。
- [ ] 步骤依次为领取快照与素材、临时检出 prepare、npm ci、verify、检查候选摘要、申请许可与 push、回传。WRITER_PUBLISH_TOKEN 只配置最后推送步骤的 env；runner secret 不进入 npm ci/test 的环境。
- [ ] 工作流不对内容 push 再自动触发同一写作任务，避免递归。部署检查按准确 commit 和已核实的 Cloudflare App 身份匹配，不能拿其他检查的 success 当部署成功。
- [ ] 轮询仅在页面可见时进行，间隔 2/4/8/15 秒，恢复页面时即时查询。提供日志链接与重新查询，不为刷新状态重复提交正文。绿后 verify 并提交“连接云端发布工作流与部署反馈”。

## Task 11：完整本地集成、导出清理与故障演练

**文件：** 新增 scripts/verify-cloud-writer.py、tests/writer-integration.test.ts；完善 drafts/assets UI 的导出和清理。

- [ ] 写本地集成红测：新草稿、配图、冻结、继续编辑、回执、再打开，结果与正文/二进制一致。使用临时 SQLite 和裸 Git；外部 HTTP 唯一替身为 GitHub 传输。
- [ ] 跑 `npx vitest run tests/writer-integration.test.ts`，确认跨模块错误能被结果断言抓到。
- [ ] 导出为版本化 JSON 包（含原文、元数据及 base64 配图和 SHA-256），另有单份 Markdown 下载；导出属于私密接口并核对实际字节摘要。清理前显示选中项，事务内再次检查未被草稿/快照引用。
- [ ] 在 work 下独立临时 persist-to 初始化 0001–0007，本地 wrangler 用显式开发开关，不能用默认 .wrangler 状态或真实线上库。脚本创建自己的 Chrome 资料目录，仅操作自己的服务和浏览器进程。
- [ ] 真实浏览器跑：两页 CAS 冲突、离线恢复、过期登录、IDB 不可写、图片旋转/透明/超限、触摸排序、导出、取消清理、旧回调、预览 XSS、刷新恢复状态和普通访客拒绝。保存 JSON 结果与必要截图，目检亮暗/手机布局。
- [ ] 全量 npm run verify；创建本次唯一临时目录后实测 Functions 打包：

```powershell
$writerBundle = Join-Path 'D:\router\work' ('_tmp-writer-bundle-' + [guid]::NewGuid().ToString('N'))
npx wrangler pages functions build --compatibility-date 2026-09-01 --compatibility-flags nodejs_compat --outdir $writerBundle
```

检查 clean install 与 Node 版本，不把本地测试冒充云端链路验证。提交“覆盖云端写作的完整本地交互”。

## Task 12：手册、凭据清单和生产验收

**文件：** 修改 docs/writing-guide.md、docs/rhinelab-spec.md 工程记录、content/pages/log.md；新增 docs/cloud-writer-setup.md。配置文件修改前备份，文档不写任何真实密钥。

- [ ] 手册说明：云端已保存/本设备保存/未发布的区别、300 KiB 配图限制、恢复、冲突、导出和本地仓库同步；现有桌面应用不会自动同步。
- [ ] 设置文档列明 WRITER_GITHUB_TOKEN（仅本仓库 Contents 读、Actions 读写）、WRITER_PUBLISH_TOKEN（仅本仓库 Contents 读写）、两处相同 WRITER_RUNNER_SECRET。2026-10-23 配置时核实：细粒度 PAT 不支持 Checks；改由工作流短时只读令牌检查准确部署、经任务租约回传，不能要求用户扩大长期凭据权限。用户在平台受保护输入框设置，禁止发到聊天或入库；代理能完成的部分自行完成。
- [ ] 核对 D1 实际占用、GitHub Actions 现有额度及停止付费使用设置；不启用 R2 或升级套餐。没有必要配置时 UI 保存仍可用、发布明确不可用，不声称已经上线。
- [ ] 得到生产变更授权后，导出 D1 至 work 的备份文件并验证可读，再执行 0007 增量迁移，确认重跑安全。不得清空评论、账户、通知或原表。
- [ ] 得到当次 main 推送授权后普通推送。实际云端创建私密测试草稿，确认另一未登录浏览器无法读正文/图；站主发布一条可撤销的验收内容，核对 Actions 完整 verify、准确提交和 Cloudflare 部署、线上内容、本地 fetch 后素材字节。验收内容的发布及清理由站主明确选择，不擅自写线上测试文章。
- [ ] 记录仍需人的动作与实际测试证据。回退使用关闭 writer 功能和 git revert，保留 D1 草稿供恢复。最终报告区分已完成本地功能、生产配置、真实云端验收，不能把其一当成全部。

## 执行方式与阶段检查

推荐本会话直接实施：这些任务共享鉴权、草稿和发布状态接口，顺序完成更容易保持一致；功能完成后再做独立整体审查。另一方式是逐任务交给新子代理实施并复核，每项上下文和审查开销更高。

计划审阅及执行方式确定前不创建产品模块、不安装依赖、不建云端资源。每项 red/green、全量 verify 和明确文件提交形成一个可检查增量；相册触摸修复属于另一项任务，不与写作台实现混在一个提交中。

自查：设计 §1–5 对应任务 1、5、8、9；§6 对应任务 2、6、8；§7–8 对应任务 2、3、9、11；§9–10 对应任务 5–7、10；§11 对应任务 7、12；§12–15 对应接口地图及任务 11–12。没有通过减少首版范围来绕过已确认设计。
