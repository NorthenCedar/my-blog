# 本站 HTTP 缓存防护

来源为官方 npm registry 的 `http-cache-semantics@4.3.0`（2026-10-04）。
`index.js` 以该包为基底；原版权声明和 **BSD-2-Clause** 许可证保留在 `LICENSE`，
原说明保留在 `UPSTREAM.md`。这是本站维护的本地加固，不是上游发布的修复版。

- 官方包：<https://registry.npmjs.org/http-cache-semantics/-/http-cache-semantics-4.3.0.tgz>
- 原包 SHA-512：`M5t5LlJpS1UHMjvwRQVdFHvPISGeLAxNcrWuJkeGh0KxsqCHZ1O3NXZU/8x7cD0BDcGW8kapxMKTvwlqrNkHkA==`
- 公告：<https://github.com/advisories/GHSA-ch52-4w7c-c8xp>
- 维护者讨论：<https://github.com/kornelski/http-cache-semantics/issues/56>

2026-10-21 核实：公告仍写明无修复版，维护者在 2026-10-04 将报告关闭为“不计划修复”，
理由是 RFC 9111 允许缓存带 Cookie 的响应，应由 `private` 控制跨用户共享。
4.3.0 仅改进状态码和 Vary；没有修改本公告涉及的 `max-stale` 分支。
本站采取比该解释更保守的防护，不能将“版本超出公告区间”视为行为已修复。

本地改动只涉及缓存复用判定：

1. 不可存储、`no-cache`、共享缓存的非显式公开 `Set-Cookie`、`proxy-revalidate`
   不允许通过客户端 `max-stale` 或服务器 stale 扩展绕过重验证。
2. 共享缓存的 `s-maxage` 过期后必须重验证；新请求带 Authorization 时，
   响应也必须明确允许认证响应共享。
3. 保留普通 `max-age=0` + `max-stale`、`public`/`immutable` 显式共享、
   私有缓存、`Vary: Cookie`、合法 stale 扩展的既有语义。
4. `stale-if-error` 回退也须匹配 URL、Host、方法及 Vary 字段，不能向不同 Cookie 请求返回旧正文。

根 `package.json` 的 `overrides` 固定官方 `http-cache-semantics@4.3.0`，不增加直接依赖。
`scripts/patch-http-cache-semantics.mjs` 从 Astro 的位置定位实际安装包：
先检查包名和版本，再检查原始源码 SHA256
`ede1cc404a492fa348eb9d97a3007a0d72aa717bd22cd86a56bd0824c19729ca`，
仅在匹配时复制此目录的加固源码并校验写入结果；遇到未知版本或未知源码立即失败。
已打补丁时只校验，不重复写入。Windows 换行转换会先规范化后校验。
根 `postinstall` 自动运行该脚本，`build` 也在首步校验，防止忽略安装生命周期后带未加固代码构建。
修改本地补丁后应重新安装官方原包，再执行脚本和回归；不要覆盖未审查的新版上游源码。

`tests/dependency-cache.test.ts` 从 Astro 的安装位置加载实际缓存包，覆盖攻击输入和正常复用。
本地加固通过 36 条缓存行为回归；官方原包在相同输入下为 29 失败、7 通过。
另有一条源码一致性断言，核对实际安装包和此目录中的审查源码。
审计工具显示 4.3.0 超出公告区间不能代替这些行为测试。待上游有可验证方案时，先跑此回归再删除本地加固。
