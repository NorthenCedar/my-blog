# 北杉札记

个人博客。静态站点（Astro）+ Cloudflare Pages Functions + D1（评论）。

线上：<https://northcedar.top>

配套的本地编辑器（写作台）在独立仓库 [blog-desk](https://github.com/NorthenCedar/blog-desk)，
两边通过 `content/` 下的 Markdown 文件对接。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 站点 | Astro 7 | 静态输出，构建期跑完所有渲染 |
| 样式 | 原生 CSS + 设计 token | 无 CSS 框架、无预处理器 |
| 字体 | 自托管 WOFF2 | Archivo / Plex / Homemade Apple，零外部 CDN |
| 评论 / 点赞 / 计数 | Cloudflare Pages Functions + D1 | 三个接口 + 一个中间件 |
| 部署 | Cloudflare Pages | 推 `main` 即发布，1–3 分钟自动上线 |

**运行时依赖只有三个**：`astro`、`@astrojs/rss`、`@astrojs/sitemap`。
字体、图标、代码高亮全部自建或构建期完成，页面上不加载任何第三方 JS/CSS。

## 本地跑

```bash
npm install
npm run dev          # http://localhost:4321
```

需要 Node 20+。看构建产物用 `npm run preview` —— **不要直接双击 `dist/index.html`**，
本站资源全走 `/` 开头的绝对路径，`file://` 下会解析到盘根目录，整站样式与素材全部 404。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生成图 webp → Astro 构建 → 清掉草稿用到的资源 |
| `npm run preview` | 预览 `dist/` |
| `npm run test` | vitest |
| `npm run verify` | build + test，**提交前跑这个** |
| `npm run db:init` | 初始化**本地** D1（依次跑 0001–0006，可重复执行） |
| `npm run db:init:remote` | 迁移**线上** D1（跑 0002–0006，会真改数据，慎用） |
| `npm run dev:cf` | 用 wrangler 本地跑 Pages Functions |

> `npm run verify` 存在的理由：Cloudflare 只构建、不跑测试。测试留在本地，
> 靠提交前手动跑一遍来补这个缺口。

## 部署

1. fork 这个仓库。
2. 在 Cloudflare Pages 里连 GitHub、选这个仓库。
3. **改 `wrangler.toml` 里的 `database_id`** —— 那是原主的库，fork 的人必须换成
   自己的（`npx wrangler d1 create beishan-comments` 拿 id）。
4. 建 D1 库并迁移：`npm run db:init:remote`。
5. 配环境变量 `ADMIN_TOKEN`（留言管理接口的密钥，见下）。
6. 推 `main` ⇒ 自动部署。

## 环境变量

| 变量 | 用途 | 是否必需 |
|---|---|---|
| `ADMIN_TOKEN` | 留言管理接口的 Bearer 密钥 | 用到 `/api/admin/*` 才需要 |

**通过 `npx wrangler pages secret put ADMIN_TOKEN` 写进 Cloudflare，不要写进任何文件。**
仓库里没有任何密钥，包括占位符。

> 环境变量只对**新的一次部署**生效 —— 改完 Secret 必须重新触发一次部署，
> 否则线上仍按"没配"处理，表现为管理接口一律 500 而不是 401。

## 内容模型

- `content/posts/<slug>/index.md` —— 文章，正文图片放同目录
- `content/pages/*.md` —— 页面（关于 / 留言 / 说说 / 更新日志 / 友链）
- `content/gallery/<专辑>/` —— 相册
- `content/site.md` —— 站名、简介、联系方式等文案层
- 标签注册表：`src/tag-registry.ts`

`draft: true` 的文章**不构建**，但 `.md` 文件本身在仓库里是可读的 ——
**草稿的保密性 = 仓库的保密性**。

文档在 `docs/`：`content-model.md`（内容模型与标签表）、`architecture.md`、
`design-spec.md`（设计规范）、`site-decisions.md`（决策台账）、
`rhinelab-spec.md`（装置系列的完整规格与逐轮修正记录）。

## 隐私

- 评论与访问统计**不存 IP、不存 UA、不存来源**。
- 访客标识是 cookie 里一个随机 16 位串（`nc_vid`，一年有效），无随机数源依赖。
- 访问计数走 Cloudflare 中间件，不加载客户端 JS。

## 许可

代码 MIT，含上游 LBEILC/RhineLabUI 的原始版权声明（见 [LICENSE](LICENSE)）。

**文章内容与美术素材不在授权范围内** —— 那是站主的个人创作，仅在本站展示。
