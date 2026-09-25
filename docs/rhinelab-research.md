# 莱茵生命视觉语言 · 设计参考调研

> **用途**：视觉方向改为「明日方舟·莱茵生命」风格的设计依据。
> **调研执行**：后台子代理，2026-09-26。**本文件是它的报告，由主代理核实并落盘。**
> **核实声明**：主代理**亲自复核**了 `astro-arknights` 的仓库自述（GitHub API 原始响应）。
> 其余条目未逐项复核，按子代理报告如实记录，并保留其"事实 / 推断 / 没查到"的标注。
>
> **调研环境限制（决定置信度）**：子代理会话的 shell 完全不可用
> （`pwsh` 每条命令都报 `SetNamedSecurityInfoW failed (Win32 5): grantWrite(<本机工作区>)`），
> 因此 agent-reach 的 CLI 后端全部无法调用，改用内置联网工具。
> 可达：`api.github.com`、`cdn.jsdelivr.net`、gameres.com、MDN、web.dev、dengekionline.com。
> 不可达：`github.com`、`raw.githubusercontent.com`、`web.archive.org`、`r.jina.ai`、`uithub.com`、
> `ngabbs.com`(403)、`arknights.fandom.com`、bilibili opus(验证码)、`arknights.jp`(JS 渲染正文为空)。

---

## 0. 最重要的结论（先说）

**没有找到任何官方出处的莱茵生命配色规范。** 所有色值都来自第三方粉丝实现。
官方没有公开的莱茵生命设计规范；能查到的最接近"设计依据"的东西是**官方特别映像**与**玩家仿制 PPT 模板**，
而这两个恰好是下面那个真实实现主题自述的设计来源。

---

## 1. 莱茵生命的视觉语言

### 1.1 唯一真正实现了它的仓库

**`QingXia-Ela/Rhine-Lab-Theme-Index-Page`**（React + SCSS，MIT，27★，2022-06 起）。
README 明确列出参考素材：B站[「莱茵生命PPT模板」(BV19Z4y187gi)](https://www.bilibili.com/video/BV19Z4y187gi)
与[「明日方舟莱茵生命特别映像」(BV1rr4y1b7sz)](https://www.bilibili.com/video/BV1rr4y1b7sz)。

**色值**（来源＝该仓库 SCSS 源码；性质＝**玩家仿制实现，非官方色卡**）：

| 色值 | 用途 | 来源文件 |
|---|---|---|
| `#e7e3dd` / `#eee` / `#dad8d4` | 页面底色，135° 三停点线性渐变 | `src/styles/index.scss` |
| `#111` | 核心实体面板（直角方块 6rem×4.5rem，无圆角） | `leftBlackBox/index.scss` |
| `#000` | 标签块底、分隔细线、十字装饰、四角标记 | 多处 |
| `#fff` | 浅色面板底 / 正文文字 | 多处 |
| `#888` @ opacity .6 | 黑色标签后的错位"幽灵"投影 | `paperClipInfo/index.scss` |
| `#ddd` + `linear-gradient(90deg,#eee,#c0c0bb)` | 右侧大面板的渐变描边 | `righrSwiper/index.scss` |
| （对照）`#2bf` / `#fe2` / `#18d1ff` | `astro-arknights` 的黄蓝强调色 —— **致敬官方简中官网，不是莱茵生命** | `arknights.config.tsx` |

**结构判断（事实）：这是一个浅底 + 黑墨系统，不是深色终端系统。**
场＝暖白/骨白；墨＝纯黑/近黑；面板靠黑白反相；几乎无彩色强调，唯一的"色"来自灰阶与渐变描边。

> ⚠️ **与站主前提的分歧，必须标注**：站主说莱茵生命是「白/乳白 + 绿」。
> **底色部分完全吻合**（`#e7e3dd` 就是暖骨白）。但**该实现里没有找到任何绿色色值**。
> 莱茵的官方绿应另有出处，子代理没查到，不编造。见 §6 第 2 条。

### 1.2 字体气质

事实（该仓库 README + `@font-face` + body 栈）：

- 拉丁：**Novecento Wide**（Medium 记作 `'NW'`，Bold 记作 `'NWB'`）—— 几何无衬线、超宽字身
- 中文：**思源黑体**（Source Han Sans）—— 无衬线
- 回退：Microsoft YaHei

→ 取向是**几何无衬线**，不是等宽，也不是衬线。

对照（通用舟味，非莱茵）：[腾讯游戏学院的方舟 UI/UX 分析](https://www.gameres.com/849200.html) 指出
方舟**基建系统**使用 Bender 这个"伪等距"工业字体（看上去像等距体，实际只有少部分字符等距），
而拉丁早年章节页用过 Trajan 这类 Old Style 衬线，且被该文批评为与插画不搭。
→ **Bender / Trajan 属于罗德岛/基建语汇，不是莱茵语汇，不要混用。**

### 1.3 几何母题（对站主预设的重要更正）

该主题**全部** SCSS 里实际出现的几何手法只有 6 种：

1. **直角方块**：核心面板 `#111`，6rem × 4.5rem，**无圆角**
2. **固定 5px 圆角 + L 形角标**（唯一出现 `border-radius` 的地方）：容器 1rem 内边距、`border-radius: 5px`，
   用 `::before/::after` 在**左下 + 右上对角**画 L 形括号，线宽 `3px solid #fff`，括号 1.5rem × 1rem
   → 圆角半径**写死 5px，不随元素尺寸缩放**。正确答案是"几乎无圆角，用角标代替圆角"。
3. **发丝分隔线**：`0.04rem`（≈2px）纯黑线，可贯穿 `300vw × 0.04rem` / `0.04rem × 300vh`
4. **四角定位点**：文字块四角各一个 `0.1rem × 0.1rem` 纯黑小方块（印刷 registration mark 的路数）
5. **渐变十字准星**：中心 2px 圆点，四臂 `1rem×1px` 与 `1px×1rem`，每臂用 `linear-gradient` 向中心渐隐
6. **悬停下划线揭示**：`30vw × 0.04rem` 黑线，`left` 从 10rem 动到 0

**明确"没找到"**：圆拱、胶囊形 / pill、同心圆、刻度线、虚线、网格。也没有 `border-radius: 50%`
（那个出现在 astro-arknights 的语音按钮上，不是莱茵）。

→ **圆角比例倾向结论：莱茵生命的块面是硬边的；"工业感"由角标 + 发丝线 + 定位点承担，不由圆角承担。**

### 1.4 材质与点缀

事实（同一仓库）：

- **渐变描边**：`border: .1rem solid #ddd` + `border-image: linear-gradient(90deg,#eee,#c0c0bb) 30 10`
  —— 用渐变做金属受光感，**不是模糊**
- **幽灵错位投影**：黑色标签后叠一个 `#888` @ opacity .6 的色块，偏移 `top 50% / left 10%`，
  制造"套印没对准"的丝网印刷感
- **3D 倾斜面板**：`perspective: 100px`，常态 `rotateY(-20deg)` `scale(0)` `translate3d(0,-50%,-3rem)`；
  hover → `rotateY(-10deg)` 并左移 0.4rem；进入态 `scale(1)`
- **未激活态失焦**：`filter: blur(5px)`
- 统一 `transition: all .8s`

**没有找到玻璃拟态 / `backdrop-filter`。** 该主题完全不用背景模糊来表现"亚克力面板"——
这是它与通用舟味的明显分野。

对照（通用舟味，GameRes 同文）：方舟大量使用背景模糊来分层级、并让玩家"窥见"下层页面；
另有 vignette 内投影、网点纸 / 散点噪点底图（Grain）、粗条纹警戒线、局部马赛克化。
→ **这些是罗德岛语汇**，莱茵生命要谨慎选择性使用（尤其网点 / 马赛克 / 噪点）。

### 1.5 版式特征

事实：

- 信息密度高、结构**左侧重**：左上"名字/信息/OS"三行 flex space-between；左中一个 `.2rem` 粗黑左边框
  竖条挂图标外链；左下版权；右侧 24rem 宽大面板内嵌 swiper
- **标签体系确实大量存在**：黑底白字 chip，`font-size 0.28–0.36rem`，`padding .04rem .4rem`
- 强调靠**黑/白反相**，不靠彩色
- 对齐：绝对定位 + rem 网格，**不是流式文档流**
- 缩放体系：`html { font-size: 50px }` 全站 rem
- 响应式：断点 992px 与 1280px；README 原话「**不推荐移动端横屏访问，效果很差！**」
  → 这一点**不能照抄**，本站是移动优先的博客。

---

## 2. 两个被排除的参考

### 2.1 `astro-arknights` —— 不是莱茵生命主题（主代理已亲自复核）

[Yue-plus/astro-arknights](https://github.com/Yue-plus/astro-arknights)，MIT 代码 + CC BY-NC-SA 4.0 内容，
TypeScript，32★，2024-08-05 建，仓库体积约 73 MB。

**官方自述（主代理从 GitHub API 取的原话）**：
> 「【开发中】基于 Astro 框架构建全特性静态网站生成器。其设计**致敬了明日方舟手游简中官方网站**。」

→ 它致敬的是**官方简中官网**（黄黑 `ark-blue` / `end-yellow` 系统），**不是莱茵生命**。
站主最初把它当作莱茵生命的参考，**这个前提不成立**。

技术栈 Tailwind + React + SCSS + pnpm workspace —— 与本项目的**原生 CSS + 零依赖**约束不符，**不采用**。

**反面教材（保留）**：其 `public/` 直接收录官方版权素材 —— 莱茵生命 logo、罗德岛 logo、
企鹅物流/黑钢国际/龙门 logo、干员立绘（`amiya_full.png` 等）、干员日配语音 mp3、官方 BGM mp3。

### 2.2 `vuepress-theme-rhinelab` —— 是个空壳

[Yue-plus/vuepress-theme-rhinelab](https://github.com/Yue-plus/vuepress-theme-rhinelab)
（自述"明日方舟莱茵生命阵营的 VuePress 主题"）**不含任何莱茵生命设计内容**：
`palette.styl` 是 VuePress 出厂默认值（`$accentColor = #3eaf7c` 等，且带 `TODO` 注释），
`Layout.vue` 是脚手架默认模板（"This is my custom page footer"），README 写"开发中"，2022-07 后停更。
**不要作为色值来源。**

**许可证冲突（需注意）**：该仓库 README 写「页面禁止用于商业使用」，而其 LICENSE 文件是 MIT —— 两句冲突。
按**更严格的非商用**处理更安全。

---

## 3. 陈词滥调清单（要避免的）

来源：[curiositech/windags-skills 的 `retrofuturism-web-design`](https://github.com/curiositech/windags-skills/blob/main/skills/retrofuturism-web-design/SKILL.md)（Apache-2.0）。
它把失败模式写成了**可检测条件** —— 可以直接当验收标准用：

1. **饱和过载**：同屏超过 **3 个**动效元素即显廉价 → 砍到 hero + 1 个强调元素
2. **衬线与无衬线打架**：同一视口混用两个子类型字体
3. **镀铬过量**：单页超过 **5 处**复杂渐变，或帧率掉到 **30** 以下 → 镀铬只留强调元素，背景用平色
4. **可访问性放弃**：琥珀色 CRT 文字 12px、正文对比度 <4.5:1、扫描线干扰阅读
5. **年代混乱**：同一区块出现 **3 个以上**不同年代的元素
6. 扫描线覆盖层必须 `pointer-events: none`
7. 动效必须响应 `prefers-reduced-motion`

**按密度的断点规则**：扫描线/CRT 效果在**移动端直接关掉**；
镀铬/金属渐变在**移动端只用平色**，平板才用双停点简单渐变，桌面才上多停点复杂镀铬。

（子代理的推断，未查到直接出处）最像"模板"的做法：整页压扫描线 + 全屏噪点 + 所有卡片都毛玻璃 +
所有标题都金属渐变 + 随机 glitch 抖动。**莱茵生命本体恰恰相反 —— 克制的、纸面的、印刷的，
靠留白和极细线活着。**

---

## 4. 落地到静态 Astro 的建议

**纯 CSS 且性能友好（只动 `transform` / `opacity`）**：

- 悬停下划线揭示：位移一条发丝线；写成 `scaleX` 更稳，只合成不重排
- 3D 倾斜面板：`perspective` + `rotateY` + `translate3d` → 纯合成层
- 角标、四角定位点、十字准星、渐变描边：`::before/::after` + `border` + `linear-gradient`，静态零运行成本
- 过场：`opacity` + `transform`
- 发丝线：用 1px 的 `border` 或 `background` 渐变，**不要用 `box-shadow` 模拟**

**移动端有性能代价的**：

- **`backdrop-filter`**：[web.dev](https://web.dev/articles/backdrop-filter)（Google，2019）原文 caution
  「**backdrop-filter may harm performance. Test it before deploying.**」，并建议不支持时**回退到一张图片而不是 polyfill**。
  [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter) 记录 **Baseline 2024**。
  → **本项目建议根本不用**：莱茵生命的证据表明它本来就不用毛玻璃。
  若一定要用，可用 backdrop root 规则把成本框住（祖先元素上有 `filter≠none` / `opacity<1` / `mask` /
  `clip-path` / `mix-blend-mode≠normal` / 嵌套 `backdrop-filter` / `will-change` 都会成为 backdrop root）。
  **多张同时滚动的卡片各挂一个 `backdrop-filter` 是最坏情况。** 另注意它会创建新 stacking context。
- 大面积 `blur()`、全屏噪点/扫描线覆盖层：移动端关掉
- `filter: blur(5px)` 做"未激活"态：会触发整块重绘，别放在滚动路径上
- 该主题 hover 把 `font-size` 从 .5rem 改到 .52rem —— **布局抖动的反面教材，别学**；用 `transform: scale`

**镀铬/金属不用图片素材又不显廉价**：

- 立场：证据里莱茵生命的手法是**渐变描边 + 灰阶 + 幽灵错位投影**，不是 chrome 高光。
  "镀铬"更接近 Y2K 语汇而非莱茵语汇 → 把金属感压到**最低剂量**。
- 手法（子代理的推断，基于 MDN 已核实的原语）：金属感靠**窄而密集的明暗交替 + 一道硬高光 + 一道硬暗边**，
  即多停点渐变里把相邻色标距离压到很小让过渡近乎硬边；横向拉丝用 `repeating-linear-gradient` 高频交替；
  旋压光晕用 `conic-gradient`；文字镀铬用 `background-clip: text`。
- 廉价感来源：停点太少（两三个色插值出奶油感）、高光不在几何中心、颜色偏黄绿（变黄铜）、大面积使用。
  **把镀铬限制在 ≤1 个强调元素、其余走平色。**

---

## 5. 版权边界（可引用的一手条文）

**Yostar 官方《アークナイツ二次創作ガイドライン》（2020-02-18 公布）**，
[電撃オンライン 全文照登](https://dengekionline.com/articles/26665/)（注明「原文ママ掲載」）；
原始公告见 [arknights.jp/news/117](https://www.arknights.jp/news/117)。

- **允许**：个人或无法人资格的团体，**非营利 + 仅限日本国内发表/流通**，可自由制作/展示/配布二次创作物。
  "非营利"包含只回收材料费与工具费。
- **须事先咨询**：有法人资格的企业/团体，或超出该指引判断基准的活动。
- **明令禁止（逐条）**：
  1. 偏离或损害本社游戏形象的内容
  2. 违反公序良俗的内容
  3. **直接以复制、扫描、采样、描摹等方式使用本社内容素材（插画、视频、音频、乐曲等），
     即创作性不存在或低下的东西** ← **硬边界**
  4. 冒充本社或游戏官方的活动
  5. 侵害或可能侵害第三方权利的内容
  6. 有被误认为本社官方产品之虞的内容

**边界结论：分界线是"创作性"。**

- **不能用**：官方 logo（含莱茵生命 logo）、角色立绘、官方 UI 截图素材文件本体、官方 BGM/语音、官方 PV 帧
  —— 凡"把官方素材文件搬进你的站"即落入禁止项 3
- **可以用**：自己用 CSS / 矢量 / 字体**重新创作**配色气质、几何语言、版式结构 —— 这不构成"复制素材"
- **必须做**：显眼声明「非官方粉丝作品」，否则落入禁止项 6（有被误认为官方之虞）

> **限定**：该指引适用地域写明**日本国内**，且是日服 Yostar 发布。
> 国服/全球服条款**没查到**（是"没查到"，不是"没有"）。
> `arknights.jp/fankit/guidelines`（ファンキット利用ガイドライン）为 JS 渲染正文取不到 → **记为未获取**。

---

## 6. 明确"没查到"的清单（不编造）

1. **官方出处的莱茵生命色卡** —— 无。所有 hex 出自第三方粉丝实现
2. **莱茵生命的绿色强调色** —— 未找到任何色值。"白/乳白 + 绿"只确认了前一半
3. **ファンキット利用ガイドライン 正文** —— JS 渲染，未获取
4. **孤星 / Lone Trail（莱茵主场活动）PV 设计考据正文** —— NGA 帖 403
5. **B站两个视频的内容本身** —— 未取到；仅确认它们被上述主题列为设计参考
6. **Rhine Lab logo 的构成/几何** —— 有"源自猫头鹰脸"的说法，出自 NGA 帖与 fandom，两处不可达，
   **不要引用**
7. **`astro-arknights` 的 `ark-blue` / `end-yellow` 确切 hex** —— jsDelivr 对该文件返回
   `application/javascript`，抓取工具拒收该内容类型；只拿到 token 名与内联字面值

---

## 7. 一句话给设计

把莱茵生命读成**浅骨白纸面 + 纯黑墨 + 禁欲灰阶**的印刷系统：用 2px 发丝线、L 形角标、四角定位点、
渐变描边、极少量 3D 倾斜面板建立"技术文档 / 实验室"气质；字体走几何无衬线（拉丁超宽 + 中文思源黑体）；
**放弃**扫描线、故障艺术、全屏噪点、毛玻璃与大面积镀铬 —— 那些是陈词滥调，且与莱茵生命本体的克制相冲突。
金属感若要用，只留 1 处、只做渐变描边级别，别做 chrome 文字。
