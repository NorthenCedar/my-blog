# 阶段 3 · 视觉草案（一次性原型）

> **这是原型，不是产品代码。** 它存在的唯一目的是回答一个问题：*这个站该长什么样*。
> 选定方向后它会变成阶段 4 的规范文档，这些 HTML 本身不进入实现。

## 怎么打开

直接双击任意 `index.html`，浏览器打开即可看。无需构建、无需依赖、无需服务器。

页面**底部有一条黑色切换栏**：`草案 A / B / C` 切三套版式，`首页 / 短文 / 技术文 / 长文`切页面。
（这条栏是原型自己的外壳，最终站点不会有。）

```
prototype/
├─ draft-a/   A · 索引式   —— index.html + 3 个文章页
├─ draft-b/   B · 海报式   —— index.html + 3 个文章页
├─ draft-c/   C · 印刷品   —— index.html + 3 个文章页
├─ build.mjs  生成器（读 content/posts/ 的真草稿 → 注入模板）
├─ drafts/    base.mjs（共享底座）+ a.mjs / b.mjs / c.mjs（三套版式）
└─ _shots/    无头 Chrome 截的验证截图
```

内容**不是手抄的**：三套草案共用同一份真草稿，由 `build.mjs` 从 `content/posts/` 读取并转换。
改内容只需改 `content/`，然后 `node prototype/build.mjs`。

## 三套的区别

| | A · 索引式 | B · 海报式 | C · 印刷品 |
|---|---|---|---|
| 首屏 | 大标题 + 简介，白底 | 满幅黑块，文字压底 | 无首屏块，直接进简介 |
| 列表 | 三列（日期 / 标题+摘要 / 标签） | 超大标题堆叠 | 目录式两列（日期 / 标题） |
| 文章标题 | 大到 3.6rem | 大到 3.8rem，压在黑块里 | 收敛到 2.4rem |
| 正文行宽 | 34em | 34em | 46rem 容器内 |
| 桌面侧栏 | 有（目录 + 标签，sticky） | 无（目录横排成条） | 无（目录是顶部一个框） |
| 强调色的出现 | hover 下划线、当前导航 | **大面积**：hover 整条标题变橙、页脚链接 | 几乎不出现，只在 hover 与焦点环 |
| 气质 | 瑞士网格、目录感 | 海报、有冲击力 | 安静、像印刷品 |

三套都遵守已冻结的决策：黑底代码块、双 token 强调色（`#E4572E` 只用于 ≥24px/hover/图形，`#C2410C` 用于小字）、无暗色模式、无第三方脚本、无网络字体。

## 移动端

断点 860px（A、C）/ 640px（B）。已在**真实 390px 视口**下逐套截图验证（见 `_shots/mobile-*.png`）：
文字正常换行、导航自动折行、无横向裁切。

## 已知限制（不要在评审时误当成设计缺陷）

1. **字体是系统回退**。设计意图是 Archivo（标题 grotesk）+ Public Sans（正文）+ 思源黑体（中文）。
   本机没装 Archivo / Public Sans，所以实际回退到 **Segoe UI + Noto Sans SC**。
   最终站点会自托管裁剪后的 WOFF2 子集 —— 届时字形观感会变，这是预期内的。
2. **代码块是单色的**。阶段 6 才接 Astro 内置的 Shiki（构建期高亮、零客户端 JS），
   这里只有黑底白字 + 语言标注 + 复制按钮。
3. **不做行号**（阶段 2 已定）。
4. **文档标题的层级**：文章页每页只有一篇，`<h1>` 唯一，语义正确。
5. **顶部说明条与底部切换栏是原型外壳**，最终站点不存在，别把它们当设计的一部分。

## 重新生成

```powershell
cd <博客仓库>
node prototype\build.mjs
```

截图（需要 Chrome，且需要比文件沙箱更宽的权限 —— 无头 Chrome 的进程间通信用命名管道）：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --no-sandbox `
  --force-device-scale-factor=1 --window-size=1440,1500 `
  --screenshot="prototype\_shots\x.png" "file:///<博客仓库>/prototype/draft-a/index.html"
```

**注意**：Chrome 在 Windows 上把 `--window-size` 钳制到最小约 500px 宽，
所以「390px 手机」必须用 `_shots/_mobile-*.html` 里的 iframe 包装页来造真实视口，
直接写 `--window-size=390` 得到的是「500px 布局裁成 390px」的假图。
