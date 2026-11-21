# 北杉札记

北杉札记是我的第一个项目。我用这个博客记录学习和生活，也把拍过的照片与做过的作品收在这里。

[访问博客](https://northcedar.top) · [更新记录](content/pages/log.md) · [维护手册](docs/writing-guide.md)

## 站点功能

- 文章可按年月和标签查找。长文配有阅读目录，代码块可以展开和复制。[归档](https://northcedar.top/archive/)
- 照片按册整理，造物台展示站点实验和手工作品。[相册](https://northcedar.top/gallery/) · [造物台](https://northcedar.top/forge/)
- 读者可以留言、回复和回看通知。站主可保存私密草稿，发布文章前会收到具体的正文校验提示。[留言板](https://northcedar.top/guestbook/)

配套的本地编辑器（写作台）在独立仓库 [blog-desk](https://github.com/NorthenCedar/blog-desk)，
两边通过 `content/` 下的 Markdown 文件对接。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 站点 | Astro 7 | 静态页面与按需加载的浏览器交互 |
| 样式与字体 | 原生 CSS、设计 token、自托管 WOFF2 | 样式与字体随构建输出 |
| 服务端 | Cloudflare Pages Functions + D1 | 访客功能、统计与云端写作 |
| 部署 | Cloudflare Pages | 本站通过 `main` 分支触发生产构建 |

项目依赖及锁定版本见 [package.json](package.json) 和 [package-lock.json](package-lock.json)。播放器通过外部服务加载歌单。

## 本地开发

使用 [.node-version](.node-version) 指定的 Node.js 版本，在仓库根目录运行以下命令。

```bash
npm ci
npm run dev
```

开发服务器会给出访问地址。改完后运行 `npm run verify`，同时检查构建和测试。需要在本地使用评论等接口时，依次运行 `npm run db:init`、`npm run build` 和 `npm run dev:cf`。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生成相册素材、构建站点、导出公开音视频和留言目标，并生成浏览器防护规则 |
| `npm run preview` | 预览 `dist/` 的静态页面 |
| `npm test` | 运行 Vitest，部分检查依赖本次构建产物 |
| `npm run verify` | 完整构建和测试，提交前运行 |
| `npm run db:init` | 初始化或迁移本地 D1 |
| `npm run db:init:remote` | 迁移配置中绑定的远端 D1 |
| `npm run dev:cf` | 使用 Wrangler 本地运行静态产物和 Pages Functions |

## 部署

1. 在 Cloudflare Pages 连接自己的 GitHub 仓库，选择生产分支，构建命令填 `npm run build`，输出目录填 `dist`。
2. 创建自己的 D1 库 `beishan-comments`，在 `wrangler.toml` 填写自己的 Pages 项目名和 `database_id`，沿用 `COMMENTS_DB` 绑定。使用自有域名时同步更新 `astro.config.mjs` 的 `site`。
3. 核对远端 D1，已有数据先备份，再运行 `npm run db:init:remote`。推送生产分支即可触发 Pages 部署。

## 环境变量

使用留言管理接口时，在 Pages 项目里将 `ADMIN_TOKEN` 配为 Secret，并触发新部署。
云端写作发布流程绑定本站域名、GitHub 仓库和 `main` 分支，独立部署需适配这些入口与密钥。[云端写作配置](docs/cloud-writer-setup.md)

## 目录与文档

- `content/posts/<slug>/index.md` —— 文章，正文图片放同目录
- `content/pages/*.md` —— 页面（关于 / 留言 / 说说 / 更新日志 / 友链）
- `content/gallery/<专辑>/` —— 相册
- `content/projects/<slug>/` —— 造物台项目
- `content/site.md` —— 站名、简介、联系方式等文案层
- `src/` —— 页面、组件、样式和浏览器脚本
- `src/tag-registry.ts` —— 标签注册表
- `functions/api/` 与 `migrations/` —— Pages 接口与 D1 数据库迁移
- `tests/` —— 内容、交互、接口和构建产物测试

生产构建只输出已发布的文章与相册。公开仓库中的草稿源码对读者可见。

[内容模型](docs/content-model.md) · [架构](docs/architecture.md) · [设计规格](docs/design-spec.md) ·
[设计决策](docs/site-decisions.md) · [装置规格](docs/rhinelab-spec.md)

## 隐私

- 访问记录保存 UTC 日期、访问时间和随机访客号。浏览器通过一年有效的 `nc_vid` Cookie 保留该访客号，UV 按访客号去重。
- 直达页面由中间件计数，浏览器脚本补记站内切页和页面恢复。计数用 IP 散列限流，每个来源最近 60 秒最多记 120 次。
- 评论和点赞也使用 IP 散列限流或去重。

## 许可

代码 MIT，含上游 LBEILC/RhineLabUI 的原始版权声明（见 [LICENSE](LICENSE)）。

**文章内容与美术素材不在授权范围内** —— 那是站主的个人创作，仅在本站展示。
