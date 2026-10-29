# 云端写作台：设置与验收

代码已合入 `main` 并部署，入口为 <https://northcedar.top/write/>。2026-10-23 经站主当次授权，已导出并验证现有 D1 备份、应用 0007 增量迁移，并只读确认八张写作表齐全；站主已完成两个平台四处 Secret 设置，名称核对齐全，须经新部署验证有效值、真实草稿保存和完整发布链路。本地代码、SQLite/Git 测试和浏览器客户端测试不替代正式云端验收。

## 1. 使用范围

正式入口为本站 `/write/`，只允许现有 `OWNER_USER_ID` 绑定的站主账户。登录沿用账户页；手机可保存文章、说说和压缩配图，电脑无须开机。普通访客、未登录者、预览域名均不能使用私密接口。静态页面只含空外壳，不含草稿正文或服务端凭据。

可以新建、导入和编辑文章、说说、造物台项目，以及导入造物台页面文案，保存私密草稿、预览、导出、清理未引用图片和发起发布。日志、相册、标签管理、视频上传及删除已发布内容继续使用原有工具。导入旧内容时保留旧视频、图片字段、模型预览及未知资料。

## 2. 平台配置

沿用现有 Pages 项目和 D1 `COMMENTS_DB`，不启用 R2、不购买额度、不升级套餐。

| 配置位置 | 名称 | 用途及最小权限 |
| --- | --- | --- |
| Pages 正式环境 | `OWNER_USER_ID` | 已绑定的站主 ID，沿用现有值 |
| Pages 正式环境 | `COMMENTS_DB` | 现有 D1 数据库绑定 |
| Pages 正式环境 Secret | `WRITER_GITHUB_TOKEN` | 仅 `NorthenCedar/personal`：Contents 读、Actions 读写、Metadata 读 |
| 仓库 Actions Secret | `WRITER_PUBLISH_TOKEN` | 仅本仓库：Contents 读写；仅最终推送步骤获得它 |
| Pages 正式环境与 Actions Secret | `WRITER_RUNNER_SECRET` | 两处完全一致，至少 32 字节的随机秘密，用于运行器私密接口 |

使用有有效期的细粒度令牌，限制到这一仓库。值直接填入平台受保护的 Secret 输入框，不发送到聊天、不写文档、不进 Git。细粒度 PAT 当前不能调用 Checks API，创建页没有 Checks 项；旧说明中要求选择该项是错误的。[GitHub 官方限制](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations)。部署结果由工作流自己的短时 `GITHUB_TOKEN` 以 Contents 读、Checks 读核对，经运行身份、任务租约和准确提交校验后回传；不增加长期令牌权限。分支保护若拒绝内容推送，应保留保护并先确认发布策略。

正式环境不要设置 `WRITER_LOCAL_DEV`。它只允许显式本地回环 HTTP 开发；不能用于开放预览域名。仓库读取令牌或运行器秘密缺失时，发布不可用；完成数据库初始化和站主绑定后，新建草稿仍可保存及导出，导入已发布内容则需要仓库读取配置。

Pages 的变量变更须随一次新部署生效。不要只保存设置便声称新实例已经获得配置。

### 2.1 站主现在需要做什么

先刷新 `/write/`，尝试新建自己的私密草稿并保存；出现“已保存到云端”后刷新重开，核对正文。新建、保存、导出草稿不要求 GitHub 令牌；“文章”“说说”中的已发布内容读取和导入要求读取令牌，发布要求上表配置齐全。

1. 打开 [GitHub 细粒度令牌创建页](https://github.com/settings/personal-access-tokens/new)。Resource owner 选 `NorthenCedar`，Repository access 选 **Only select repositories**，只勾选 `personal`。分别创建两枚有有效期的令牌：`WRITER_GITHUB_TOKEN` 的 Repository permissions 为 **Contents: Read-only、Actions: Read and write**；`WRITER_PUBLISH_TOKEN` 仅给 **Contents: Read and write**。Metadata 读为必需的附带权限。到期后更新对应 Secret。
2. 在 [Cloudflare Pages 项目设置](https://dash.cloudflare.com/4bcfa9cf29fad54bd0ca74b90903a10c/pages/view/personal/settings) 的正式环境 **Variables and Secrets** 中，以 **Secret** 类型保存 `WRITER_GITHUB_TOKEN`。令牌值只粘贴到平台的受保护输入框。
3. 在 [GitHub 仓库 Actions Secrets](https://github.com/NorthenCedar/personal/settings/secrets/actions) 中点 **New repository secret**，保存 `WRITER_PUBLISH_TOKEN`。
4. 在普通 PowerShell 运行下面的命令，生成 32 字节的随机秘密并复制到剪贴板；不需要管理员，不写文件，也不打印秘密。把同一份值分别保存为 Pages 正式环境和 GitHub Actions 的 `WRITER_RUNNER_SECRET`：

   ```powershell
   $writerSecretBytes = New-Object byte[] 32
   $writerSecretGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
   $writerSecretGenerator.GetBytes($writerSecretBytes)
   [Convert]::ToBase64String($writerSecretBytes) | Set-Clipboard
   $writerSecretGenerator.Dispose()
   ```

5. 在 Cloudflare 重试一次正式部署，让新 Secret 生效。完成后只需告诉代理“密钥已配”，不要发送密钥值或包含值的截图。由代理核对配置名称和准确部署，站主再选择真实内容做首次发布验收。

平台操作参考：[GitHub 令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)、[Actions Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)、[Pages 绑定与秘密](https://developers.cloudflare.com/pages/functions/bindings/)。不启用新计费服务，原有额度和支出限制仍须在平台核对。

`WRITER_RUNNER_SECRET` 不用于日常登录，不必记忆；可选择在密码管理器留底。平台保存后无法直接读回，遗失时重新生成，同步替换两处并重新部署。复制名称或其他文字会覆盖剪贴板；生成时可先把值留在当前 PowerShell 变量，再次复制该变量，避免给两个平台生成不同值。

配置核验：在 Actions 手动运行“云端写作”，jobId 填 32 个 `0`，勾选 `diagnostic`。只核验共享密钥、固定运行身份、D1 写作表、仓库读取和短时令牌的 Checks 读取，不创建草稿、不推送内容，也不能代替真实内容发布验收。正常发布保持 `diagnostic=false`。

工作流最多等待约 5 分钟的本站部署结果。超时仍为待确认，页面“重新查询”只读取原任务；“重新检查上线”在上次运行停止后启动只读检查，不重新准备或提交正文。检查触发应答不确定时不自动重复派发，可从 Actions 手动运行相同 jobId（不勾选 diagnostic）恢复；已确认推送回执的任务只进入部署检查。检查在领取前失败时，查询会恢复可重新检查的状态。

### 2.2 令牌到期更换

在 GitHub 的 Fine-grained tokens 列表核对两枚发布令牌的 Expiration，建议提前 3–7 天更新。到期日从每枚令牌实际创建时间计算，Secret 保存在平台中不会为令牌自动续期。

推荐先创建两枚新令牌，仍仅授权 `NorthenCedar/personal`：读取/调度令牌使用 Contents 读、Actions 读写；推送令牌使用 Contents 读写；Metadata 保持默认读。令牌显示名称可加日期，平台 Secret 名称保持不变。

1. Pages `personal` → Settings → Production → Variables and Secrets，编辑已有 `WRITER_GITHUB_TOKEN`，替换为新的读取/调度令牌，保持 Secret/Encrypt 类型。
2. GitHub `personal` → Settings → Secrets and variables → Actions，编辑已有 `WRITER_PUBLISH_TOKEN`，粘贴新的推送令牌并保存。
3. Pages → Deployments，重试最新正式部署，让新的 Pages Secret 生效。GitHub Actions 的新运行读取更新后的仓库 Secret。
4. 正式部署成功后运行只读配置核验：`jobId` 填 32 个零、`diagnostic=true`；核验不会发布文章，也不能替代推送令牌实际写权限的验收。需要排查运行环境时可额外选 `verifySource=true`，只校验已提交源码，不读取私密草稿。确认新配置正常，再删除旧令牌。

`WRITER_RUNNER_SECRET` 是自建共享随机秘密，没有 GitHub PAT 的 30 天到期机制，不必随这两枚令牌每月更换；`OWNER_USER_ID` 也保持原值。令牌值只粘贴到平台受保护的输入框，不发聊天或截图。

## 3. 额度核对与数据库迁移

生产变更前，由站主确认执行。先在控制台核对 D1 实际数据库大小、账号用量、Actions 可用时长和支出上限；本地测试不能读取或证明这些额度。设置免费额度耗尽后停止，不能自动购买或放开支出限制。

应用限额为 100 份草稿、64 MiB 图片有效载荷、96 MiB 写作总有效载荷，包含草稿、不可变快照及回写预留。它不代表 SQLite 文件实际大小，也不涵盖账户内其他应用的用量。

以下为得到当次生产授权后执行的命令，当前文档不表示已经运行：

```powershell
Set-Location D:/router/work/blog-cloud-writer
$writerBackup = Join-Path D:/router/work ('comments-before-writer-' + (Get-Date -Format yyyyMMdd-HHmmss) + '.sql')
npx wrangler d1 export beishan-comments --remote --output $writerBackup
```

确认命令退出成功、文件非空且可读，并检查现有账户、评论等表的建表及数据语句。用临时 SQLite 导入备份、执行 `PRAGMA integrity_check`，核对关键表行数；备份含私人账户与留言资料，不能提交到仓库或发到聊天。

备份验证通过后，再应用唯一新增迁移：

```powershell
npx wrangler d1 execute beishan-comments --remote --file migrations/0007_cloud_writer.sql
```

迁移只新增 `writer_` 表、索引和触发器，已有 0001–0006 不重写；不删除账户、评论、通知或会话。重复应用应安全，但重复安全性不能替代执行前备份。

## 4. 本地验收边界

### 已有生产环境扩展造物台（0008）

现有生产库已执行0007，**不得重跑0007**。造物台新增 project / forge 草稿类型，使用 `migrations/0008_writer_forge.sql`，原账户、文章/说说草稿、任务、素材、回执及用量保留。迁移重建五张 writer 表以扩展类型 CHECK，不关闭外键；六个用量触发器暂时撤下再原样恢复，避免数据恢复时重复记账。

生产执行前仍须按第3节导出并验证私密备份，确认没有备份或用量读取错误。将0008整文件交给 `npx wrangler d1 execute beishan-comments --remote --file migrations/0008_writer_forge.sql` 的原子导入路径，不能拆成数段分别提交；SQL不写显式BEGIN/COMMIT。导入期间数据库会暂时停止查询。迁移后核对逐表记录、外键检查、用量和新类型约束，再部署对应代码。成功后的重复执行不会改变数据；这不能替代事前备份和当次结果核对。

本地迁移验收使用真实SQLite，覆盖旧数据逐字段保留、全部任务状态、配图关联、额度和索引/触发器；每条语句边界失败均可回滚。它不代表已执行真实D1迁移。部署与实际安装验收的准确提交和记录另存当次work目录。

仓库要求的完整检查：

```powershell
npm ci
npm run verify
```

使用仓库 `.node-version` 指定的 Node；不要为此全局升级用户环境。跨模块测试实际运行 SQLite 和临时裸 Git，外部仓库传输可替代。`scripts/verify-writer-client.py <work下独立结果目录>` 启动自己的静态服务和独立 Chrome，用 HTTP 夹具检查客户端 DOM、IndexedDB、图片处理及布局，结果明确标为客户端范围，不能证明真实认证或 D1 接口已可用。

完整本地链路须在 `work` 下新建本次专用 `persist-to`，应用 0001–0007，显式开启本地开发开关，并只启动自己的服务和 Chrome 资料目录。禁止使用默认 `.wrangler` 数据或生产数据库来冒充测试库。

本机目前有已复现的阻塞：原生 workerd 创建 `miniflare-email-store` 报 Windows `CreateDirectory #5 拒绝访问`，用户在普通 PowerShell 同样复现。已停止重试，没有修改 ACL、Codex 配置、系统安全策略，也没有更换环境绕过。具体失效的随机临时目录已被运行器清理，尚不能给出精确的最小 ACL 修复命令。原生本地链路恢复后，仍需验证两页冲突、真实认证/过期、图片及导出私密性、取消/旧回调，并目检手机布局；实体手机及 Safari 另验。

本轮 Functions 打包生成产物且打印编译成功，但 Wrangler CLI 此后持续不退出，已停止本次进程。仅关闭进程级遥测、直接调用已安装 CLI 仍相同，未改持久设置。该结果只能证明编译阶段产出，不能记录为命令退出码 0；正常结束与原生运行时验收均保留待办。

## 5. 正式发布与验收清单

1. 本地必需检查通过，原生链路阻塞解决；审核整个分支，记录未完成项。
2. 站主审阅最终改动并授权当次生产备份、增量迁移和主分支普通推送。合并前检查本地/远端更新，不自动 stash、不强推。
3. 设置上表 Secret，验证新部署读取到站主绑定和数据库表；不要在页面、构建日志或 API 响应中回显秘密。
4. 在正式站保存一份私密草稿，使用另一个未登录浏览器确认正文、配图、导出和任务接口均被拒绝。
5. 由站主选择用于验收的内容，明确同意后发起发布。检查 Actions 的干净安装及完整 `verify`、普通提交的 `Writer-Job` 标记、准确提交对应的本站 Cloudflare 检查，以及实际线上页面。
6. 本地 `fetch` 后核对文章和素材字节，再正常合并远端内容。验收内容的清理由站主选择，不能擅自发布或删除测试文章。

“已推送”只表示内容提交已进入 main；只有准确提交对应的 Cloudflare 检查成功才显示“已上线”。其他 App、其他提交、其他 Pages 项目的成功均不能替代。部署失败时保留提交和草稿，优先修复构建、重新查询，不重复提交正文。

## 可视化写作与文章目录

### 造物台项目与页面文案

侧栏「造物台项目」导入已发布作品，「新项目」创建私密草稿；「页面文案」固定导入造物台单页。新项目可填项目名称、摘要、一句话介绍、分类、状态、排序、标签、链接与制作正文，选择自动或六种图片动效。照片图库最多6项，可为每项选择主图、说明和暗色替图；新增配图总上限20张，包含亮暗版本与正文图。原site/desk模型完整保留，切换照片是明确操作。

页面文案提供普通表单、三条滚动提示和最多12条工作手记，不要求编辑JSON、YAML或动画源码，不接受上传图片。两种内容沿用现有私密保存、冲突、恢复、导出和发布确认。保存不会修改正式站；实际发布仍由站主明确点击，不能以源码校验或空任务代替真实发布验收。

新文章和普通草稿默认使用「可视化编辑」。直接输入文字，选中段落后在「段落格式」中选择「章节标题」或「小标题」；粗体、斜体、列表、引用和链接使用正文上方的按钮。撤销、重做及 Ctrl/Cmd+B、I、Z 均可使用。粘贴网页文字会去除外来排版，配图仍需填写说明并确认上传。

「Markdown 源码」保留原来的直接编辑方式。只切换模式或修改标题、摘要等资料不会重写正文。源码正文发生修改后再切回可视化，会重新建立正文的撤销记录；请先保存重要版本。包含视频、HTML、表格、脚注等特殊排版的旧文章会提示并使用源码模式，完整保留原文，禁止有损转换。

「章节标题」对应 H2（`##`），「小标题」对应 H3（`###`），发布后自动进入文章的「本文目录」。桌面显示在正文右侧，手机显示在正文前。文章标题已是 H1；单纯加粗不会进入目录。不需要手写目录或修改既有文章的发布格式。

「代码块」按钮可把选中的多段代码放进同一个块；没有选中内容时插入空块并把光标放进块内。默认 Python，可在「代码语言」切换 JavaScript、TypeScript、JSON、Bash 或纯文本。可视化模式直接输入或粘贴代码，Ctrl/Cmd+Enter 继续正文；选择「正文」可移除代码格式。源码模式也提供代码按钮与「转为正文」，自动处理 Markdown 围栏，已有代码不重复包裹。语言更改保留代码文字和附带信息，列表或引用内的复杂源码围栏会明确提示手动处理，避免破坏原文。

代码格式支持撤销与重做；页面预览会安全展示代码，发布后沿用站点现有语法高亮。桌面写作台提供同名按钮与语言选择，实际安装版须更新后使用。

可视化正文的「加粗／斜体／删除线」作用于选中文字，支持与强调组合、撤销和重做。删除线保存在无属性的 `<del>文字</del>` 中，避免中文句中组合格式时露出符号；原有 `~~文字~~` 也可读取。只有完整配对的删除线标签可进入可视化，其他 HTML 和未配对标签仍保留源码。预览和文章页面显示对应格式，代码中的符号保持原文。代码语言菜单另外提供 C 与 C++（分别保存为 `c`、`cpp`），发布后使用站点现有语法高亮，无需更改文章资料。

本地写作台也提供「正文／章节标题／小标题」按钮，操作当前段落或选中的行。安装版需要更新应用才能出现新按钮；网站部署不会自动更新电脑中的应用。

## 6. 恢复与回退

触发应答丢失时查询原任务，不重新派发。任务开始前可取消；取得推送许可后须核对实际运行和提交。运行已结束但推送仍待确认时，可检查日志与仓库后明确结束该任务以解除占用；这不证明未推送，不撤销提交，任务快照仍保留。

撤销功能使用新提交 `git revert`，并关闭写作入口/发布能力后重新部署；不 reset、不强推。保留新增 D1 表和私密草稿供导出恢复。删除令牌或停止工作流不会撤销已经获得许可并完成的 Git 推送，须查看真实结果。
