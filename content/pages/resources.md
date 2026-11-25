---
# 资源页内容（站点内容层；主题不持有正文）。
# 可在本地「写作台」或云端写作台直接增删分类与资源条目：
#   · 名称 name（必填）/ 链接 href（必填）/ 一句话简介 summary（必填）
#   · 可选：角标 badge、按钮文案 cta、提取码 code、详细说明 detail、封面 cover、配图 images、标签 tags
# ★ 大体积安装包与小说建议放到 Cloudflare R2（如 files.northcedar.top）、GitHub Releases 或网盘，
#   这里填写外链地址与提取码（code），不要直接提交大文件进博客仓库。
title: 资源
intro: 自用与私藏的网络加速、效率工具、修图剪辑、AI 应用、动漫小说与宝藏网站。
groups:
  - title: 网络代理与加速
    note: 手机端新手推荐先从免配置应用上手，进阶再自行搭建节点配合客户端使用；附网速与 IP 检测站。
    items:
      - name: 旋风加速器
        href: https://www.23420154.com/M2EVSLS
        summary: 新手首选手机网络加速器，每天提供免费时长，无需额外配置点开即用。
        detail: "适合刚入门先解决基础外网访问，再慢慢折腾其他工具。可直接点击上方按钮通过该链接下载，或直接拉取我整理好的纯净安装包：[下载旋风加速器 Android APK（19.5 MB）](https://files.northcedar.top/apps/xuanfeng-accelerator.apk)。"
        badge: Android · 新手首选
        cta: 前往下载
        tags: [新手友好, 免配置, Android]
      - name: FlClash
        href: https://files.northcedar.top/apps/FlClash.apk
        summary: 界面简洁干净的跨平台代理客户端，支持 Clash.Meta 内核，需自备节点。
        detail: "界面清爽无广告，适合手机端日常使用；需要自己准备节点。如果想学习自己搭建节点，可以看这份教程：[自建节点视频教程（YouTube）](https://m.youtube.com/watch?v=chcFg878840&pp=0gcJCSQMAYcqIYzv)（需先开启网络加速，小白建议先用上一项的旋风加速器）。更多平台版本见 [GitHub Releases](https://github.com/chen08209/FlClash/releases)。"
        badge: Android · 开源
        cta: 下载 APK
        tags: [代理, Clash, 开源]
      - name: Clash Verge Rev
        href: https://github.com/clash-verge-rev/clash-verge-rev/releases
        summary: 桌面端主流 Clash 图形客户端，支持 Mihomo 内核与 TUN 虚拟网卡，需自备节点。
        detail: "支持 Windows / macOS / Linux，规则分流与界面交互都很成熟。不会从 GitHub 下载或拉取较慢，可配合「实用工具」里的 [gh-proxy](https://gh-proxy.com/) 加速；想自己搭节点可参考 [自建节点视频教程（YouTube）](https://m.youtube.com/watch?v=chcFg878840&pp=0gcJCSQMAYcqIYzv)。"
        badge: 桌面端 · 开源
        cta: GitHub 下载
        tags: [桌面端, Clash, 开源]
      - name: v2rayN
        href: https://github.com/2dust/v2rayN/releases
        summary: 经典老牌桌面端代理客户端，兼容 Xray / sing-box 等多协议，需自备节点。
        detail: "Windows 下装机量极高的代理管理软件，协议支持全面、细粒度路由灵活。建议在 Releases 中优先下载带 Core 的完整压缩包；想自己搭节点同样可看 [自建节点视频教程（YouTube）](https://m.youtube.com/watch?v=chcFg878840&pp=0gcJCSQMAYcqIYzv)。"
        badge: Windows · 开源
        cta: GitHub 下载
        tags: [桌面端, V2Ray, 开源]
      - name: Speedtest by Ookla
        href: https://www.speedtest.net/
        summary: 权威在线测速网站，可直观测试宽带或网络代理后的上下行速率与延迟。
        detail: 打开即测，适合切换不同节点后对比延迟（Ping）、抖动与实际下载上传带宽，快速判断当前代理线路质量。
        badge: 在线测速
        cta: 打开测速
        tags: [测速, 网络检测]
      - name: MyIP
        href: https://www.myip.com/
        summary: 快速查看当前出口 IP 与归属地，验证网络代理是否生效以及落地地区。
        detail: 开启代理后打开页面即可确认当前显示的 IP 地址、所属国家/地区与运营商，排查代理或分流规则是否按预期生效非常顺手。
        badge: IP 检测
        cta: 查看 IP
        tags: [IP查询, 网络检测]

  - title: 实用工具
    note: 装机必备与效率神器集合；下面不少工具托管在 GitHub，不会从 GitHub 下载的话搜一下或问 AI 就能搞定，非常简单。
    items:
      - name: Watt Toolkit（原 Steam++）
        href: https://github.com/BeyondDimension/SteamTools/releases
        summary: 合法合规的开源免费网络加速工具，可一键直连 GitHub 与 Steam，微软应用商店也能直接搜到。
        detail: "本分类下面很多工具都需要从 GitHub 下载，装上 Watt Toolkit 开启 GitHub 加速即可顺畅直连。官网目前在维护，最省事的方式是直接在 Windows「微软软件商城（Microsoft Store）」里搜索 Watt Toolkit 一键安装，或点击上方按钮从 GitHub Releases 下载；不想安装客户端也可复制 GitHub 链接到 [gh-proxy（GitHub 文件加速）](https://gh-proxy.com/) 中转高速拉取。"
        badge: 跨平台 · 开源免费
        cta: GitHub 下载
        images: [/resources/covers/watt-toolkit.webp]
        tags: [GitHub加速, 开源, 必备]
      - name: GitHub 文件加速（gh-proxy）
        href: https://gh-proxy.com/
        summary: 免安装的网页端 GitHub 代理下载站，复制 Releases 或文件链接即可高速拉取。
        detail: 如果不想在本地安装 Watt Toolkit 或其他加速工具，直接把 GitHub 里的安装包或源码链接粘贴到这个网页中转下载即可，省心顺手。
        badge: 在线工具
        cta: 打开网站
        tags: [GitHub, 代理下载, 免安装]
      - name: 图吧工具箱
        href: https://www.tbtool.cn/
        summary: 新电脑到手必装的全能硬件工具箱，硬件检测、性能烤机、磁盘分区一应俱全。
        detail: 电脑刚到货第一件事就是装它！内置 CPU / 显卡 / 内存 / 屏幕 / 外设检测、烤机测试以及 DiskGenius 等磁盘分区工具——想查配置、验新机或调整磁盘分区大小，凡是和硬件相关的都能在里面找到，绿色纯净无捆绑。
        badge: Windows · 装机必备
        cta: 官网下载
        images: [/resources/covers/tbtool.webp]
        tags: [硬件检测, 磁盘分区, 装机必备]
      - name: LinkSwift（网盘直链下载助手）
        href: https://github.com/hmjz100/LinkSwift
        summary: 基于篡改猴（油猴）插件的网盘高速下载助手，配合下载器轻松提速。
        detail: 使用前需先在浏览器安装「篡改猴（Tampermonkey）」扩展，再按仓库说明导入脚本并在篡改猴中简单配置即可；过程非常简单，遇到不清楚的步骤直接问 AI 就能一步步搞定。
        badge: 油猴脚本 · 开源
        cta: 前往仓库
        images: [/resources/covers/linkswift.webp]
        tags: [网盘加速, 油猴脚本, 开源]
      - name: Filee
        href: https://github.com/KnifeLemon/Filee
        summary: 轮盘拖拽式万能文件格式转换神器，涵盖音视频、图片、文档等数百种格式。
        detail: 还在靠傻改后缀名把 MP4 转 MP3？用 Filee 选中文件拖到轮盘对应格式就能快速无损转换，涵盖音视频、图片、字幕等几百种常见格式，效率极高。
        badge: Windows · 开源
        cta: 前往仓库
        images: [/resources/covers/filee.webp]
        tags: [格式转换, 效率, 开源]
      - name: DashBeam
        href: https://github.com/tonyantony300/dashbeam
        summary: 端到端直连的 P2P 跨网大文件传输工具，不经过中转服务器，跑满自家带宽。
        detail: 文件传输全程点对点完全私密、不落云端服务器，不限同一局域网——只要双方都联网，哪怕远在天涯海角也能直接互传超大文件，速度轻松跑满带宽，彻底告别微信和 QQ 的体积限制。
        badge: P2P 传输 · 开源
        cta: 前往仓库
        images: [/resources/covers/dashbeam.webp]
        tags: [文件传输, P2P, 大文件]
      - name: Scrapling
        href: https://github.com/D4Vinci/Scrapling
        summary: 具备自适应反爬能力的 Python 网络爬虫工具，命令行与 AI Agent 均可直接调用。
        detail: 面向进阶用户的轻量抓取框架（需敲命令行），能快速把目标网页的文字内容提取出来并自适应反爬机制，也可以直接接入你的 AI Agent 当作网页抓取工具使用。
        badge: Python · 命令行
        cta: 前往仓库
        tags: [爬虫, CLI, AI工具]
      - name: HiBit Uninstaller
        href: https://hibitsoft.ir/Uninstaller.html
        summary: 强力软件卸载与残留清理工具，连顽固流氓软件与注册表残留都能扫干净。
        detail: 觉得某些流氓软件（比如 360 全家桶）怎么删都删不干净？HiBit Uninstaller 支持强制卸载并在卸载后深度清理残留文件与注册表，官网同时提供安装版和免装绿色版，强烈推荐常备。
        badge: Windows · 免费
        cta: 官网下载
        tags: [软件卸载, 注册表清理, 必备]
      - name: Video DownloadHelper
        href: https://chromewebstore.google.com/detail/video-downloadhelper/lmjnegcaeklhafolokijcfjliaokphfk
        summary: 老牌 Chrome 网页视频下载插件，轻松保存没有下载按钮的网页视频。
        detail: 看到精彩网页视频却找不到下载按钮时，装上这款 Chrome 插件就能自动嗅探并下载页面里的视频；遇到分段加密流（HLS/DASH）时按插件提示安装官方配套组件即可合并保存。
        badge: Chrome 插件
        cta: 应用商店安装
        tags: [浏览器插件, 视频下载]

  - title: 修图与摄影
    note: 桌面端与手机端常用调色、修图和视频剪辑工具。
    items:
      - name: Adobe Lightroom Classic（PC 免费版 + Android）
        href: https://pan.baidu.com/s/14Hq4EP3r8buklSoI7DJ5UA?pwd=NoCe
        summary: 摄影后期与 RAW 批量调色标杆工具，提供 PC 免费版网盘与 Android 手机端直链。
        detail: "免费版 Lightroom，无需多言。上方主按钮为 Windows PC 免费版压缩包（2.73 GB，解压即可使用）；提示：在网盘下载时，可以在上方「实用工具」里找网盘下载加速工具（如 LinkSwift）提速。手机端可直接点击此处高速下载：[Lightroom Android APK（120 MB）](https://files.northcedar.top/apps/Lightroom.apk)。"
        badge: Windows / Android
        cta: 网盘下载 PC 版
        code: NoCe
        tags: [调色, 摄影后期, RAW]
      - name: Photon Studio
        href: https://tenzen.studio/photon/
        summary: 轻量级免费 Photoshop 平替，仅几百兆体积，功能与快捷键和 PS 几乎一致。
        detail: "Photoshop 动辄十几个 GB 太占空间，Photon Studio 体积轻巧却几乎具备 PS 的核心功能，而且快捷键一模一样，用习惯 PS 的人打开就能直接上手。可前往官网或直接通过 [Microsoft Store（官方商店页）](https://apps.microsoft.com/detail/9PLD16DV387N) 安装，也可以在微软软件商城直接搜索 Photon Studio 获取。"
        badge: Windows · 免费
        cta: 前往官网
        images: [/resources/covers/photon-studio.webp]
        tags: [PS平替, 轻量修图, 免费]
      - name: DaVinci Resolve（达芬奇）
        href: https://www.blackmagicdesign.com/cn/products/davinciresolve
        summary: 电影级专业视频剪辑与调色套件，官方直接提供功能极强的永久免费版。
        detail: 免费版达芬奇，无需多言。因为完整安装包体积极大，直接从 Blackmagic Design 官网下载官方免费版最省心且始终保持最新，剪辑、调色、音频与特效全套配齐。
        badge: 跨平台 · 官方免费版
        cta: 官网下载
        tags: [视频剪辑, 调色, 专业]
      - name: 像素蛋糕（PixCake）
        href: https://www.pixcakeai.com/
        summary: 主打人像精修与商业级批量出图的 AI 修图软件，修图效率极高。
        detail: AI 磨皮、祛瑕、肤色统一与光影重塑效果非常自然，批量修图省时省力，啥也不说了，AI 修图真好用。
        badge: AI 修图
        cta: 打开官网
        tags: [AI修图, 人像后期]

  - title: AI 工具与应用
    note: 编程 Agent 模型切换、大模型客户端、公益 API 中转站、手机端 Agent 与学术写作工具。
    items:
      - name: CC Switch
        href: https://github.com/farion1231/cc-switch
        summary: 让 Codex / Claude Code 等编程 Agent 通过 API 自由接入任意大模型的切换工具。
        detail: 通过 CC Switch 可以把 Codex、Claude Code 等 Agent 通过自定义 API 接入各种大模型（例如在 Codex 中直接调用 DeepSeek 等模型），多配置切换直观方便。
        badge: 桌面端 · 开源
        cta: 前往仓库
        tags: [Agent, API切换, 开源]
      - name: Claude（Android APK）
        href: https://files.northcedar.top/apps/Claude.apk
        summary: Anthropic 官方 Claude 手机端安装包，解决国区 Google 账号不便下载的问题。
        detail: 如果你的 Google 账号地区在中国，在应用商店往往不便直接下载 Claude，可直接拉取这里整理的纯净 APK 安装包（62.5 MB，不含任何个人账号数据）。
        badge: Android · 直链
        cta: 下载 APK
        tags: [Claude, Android, 大模型]
      - name: 公益 API 中转站（0z.hk / ly.77625）
        href: https://newapi.0z.hk/dashboard/overview
        summary: 两个可免费体验的公益大模型 API 中转站点，适合测试接口或轻度数据收集。
        detail: "主入口：[newapi.0z.hk](https://newapi.0z.hk/dashboard/overview)，备用入口：[ly.77625.xyz](https://ly.77625.xyz/)。用来跑测试、做轻量数据收集很方便，不过比较火的旗舰模型高峰期会比较卡，按需使用即可。"
        badge: 免费 API 中转
        cta: 打开主站
        tags: [API中转, 免费, 大模型]
      - name: Mika & OpenMinis（手机端 Agent）
        href: https://github.com/wangzan101/Mika
        summary: 两款手机端开源 AI Agent，可读写手机文件并协助操作手机或完成移动开发。
        detail: "两者各有专长：[Mika](https://github.com/wangzan101/Mika) 针对手机交互做了专门优化，更适合在后台默默帮你操作手机、不抢占屏幕；[OpenMinis](https://github.com/OpenMinis/OpenMinis) 自带独立 Linux 沙箱，不太适合直接帮你点击翻页，但非常擅长在手机上改文件、跑脚本和做开发，适合专业用户。"
        badge: Android · 开源 Agent
        cta: 查看 Mika
        tags: [手机Agent, 开源, 自动化]
      - name: ClawsGO Science
        href: https://clawsgo.science/?inviteCode=TMEH2N
        summary: 面向科研与学术论文撰写的专业 AI 写作助手平台。
        detail: 专门针对学术调研、文献梳理与论文结构写作做了优化，比通用对话框写论文专业不少，科研赶稿很省心。
        badge: AI 写论文
        cta: 打开网站
        tags: [论文写作, 科研, AI]

  - title: 动漫与小说
    note: 免费追番站点、高画质追番客户端、免费小说站，以及我私藏强推的全本 TXT 直链。
    items:
      - name: 动漫共和国
        href: https://www.dongman.to/
        summary: 番剧收录非常齐全的免费在线动漫站，新番老番打开即看。
        detail: 资源库完整、完全免费，网页端打开就能直接追番；如果想在手机或电脑上获得更高清的画质与播放体验，推荐搭配下面的 Kazumi。
        badge: 在线追番 · 免费
        cta: 打开网站
        tags: [动漫, 追番, 免费]
      - name: Kazumi
        href: https://kazumi.app/
        summary: 跨平台免费开源追番客户端，番源齐全且支持开启高画质播放。
        detail: 基于自定义规则聚合片源，完全免费，画质能开得很高、播放体验流畅，手机和电脑多端都能装。
        badge: 跨平台 · 高画质
        cta: 前往官网
        tags: [动漫, 客户端, 高画质]
      - name: 《诡秘之主》全本精校 TXT
        href: https://files.northcedar.top/books/lord-of-mysteries.zip
        summary: 爱潜水的乌贼代表作，我看过最好看的小说，强烈推荐！
        detail: 蒸汽朋克、克苏鲁诡谲氛围与严谨的二十二条途径序列体系完美融合，伏笔精妙、群像出彩，是我读过最好看的小说，强烈推荐没看过的一定去读！压缩包内为精校全本 TXT（4.55 MB，解压即读）。
        badge: TXT · 强烈推荐
        cta: 下载全本
        tags: [小说, 奇幻, 强推]
      - name: 《宿命之环》全本 TXT
        href: https://files.northcedar.top/books/circle-of-inevitability.zip
        summary: 《诡秘之主》同世界观续作（作者：爱潜水的乌贼），读完第一部可按兴趣续读。
        detail: 承接《诡秘之主》的续作，个人感觉写得没有第一部那么惊艳，但如果看完第一部想继续补全诡秘世界观与后续剧情，也可以一并收下（压缩包 3.77 MB，解压即读）。
        badge: TXT · 续作
        cta: 下载全本
        tags: [小说, 续作, 奇幻]
      - name: 氪星小说
        href: https://www.kxxs.top
        summary: 免费在线看小说与打包下载全本 TXT 的小说站点，分类齐全。
        detail: 想找其他完本或热门网文时来这里搜就行，既支持网页免费在线阅读，也能直接下载 TXT 放进手机或电纸书离线看。
        badge: 小说阅读 / 下载
        cta: 打开网站
        tags: [小说站, TXT下载, 免费]

  - title: 游戏
    note: 买正版省钱平台、Steam 加速工具，以及纯净脱敏版 Minecraft 启动器。
    items:
      - name: SteamPY
        href: https://steampy.com/
        summary: Steam 游戏 CDKey 与低价交易平台，买 Steam 游戏能省下不少钱。
        detail: "入手 Steam 正版游戏前先来这里比价，热门大作与史低 Key 往往便宜一大截。手机端也可以直接下载官方客户端：[下载 SteamPY Android APK（46.2 MB）](https://files.northcedar.top/apps/SteamPY.apk)。"
        badge: 网页 / Android
        cta: 打开网站
        tags: [Steam, 低价买游戏, CDKey]
      - name: Watt Toolkit（Steam 加速）
        href: https://github.com/BeyondDimension/SteamTools/releases
        summary: 合法合规的开源免费加速工具，一键解决 Steam 商店、社区打不开的问题，微软应用商店也能搜到。
        detail: 玩 Steam 必备神器，免费加速商店、社区、创意工坊并支持本地令牌与账号切换，同时还能加速 GitHub（详见上方「实用工具」分类）。官网维护中，推荐直接在 Windows 微软软件商城（Microsoft Store）搜索 Watt Toolkit 安装，或点击上方前往 GitHub Releases 获取。
        badge: 跨平台 · 免费
        cta: GitHub 下载
        images: [/resources/covers/watt-toolkit.webp]
        tags: [Steam加速, 开源, 游戏工具]
      - name: PCL2（自改去强制更新旧版）
        href: https://files.northcedar.top/apps/PCL2-no-force-update.zip
        summary: 我自己亲手改掉强制更新的 Plain Craft Launcher 2 旧版，各版本均可正常下载！
        detail: 之前旧版 PCL2 会弹窗强制更新，我亲手改掉了强制更新机制并保留了配套防更新文件，所以整文件夹打包放出（13.55 MB），解压即用且可正常下载各 Minecraft 游戏版本。已彻底清除我的地图、模组、日志与账号信息，完全纯净。
        badge: Minecraft · 自改纯净版
        cta: 下载压缩包
        tags: [Minecraft, 启动器, 自改]
      - name: BlockHelm Launcher
        href: https://github.com/zqq-699/BlockHelm-Launcher
        summary: UI 颜值高、交互更方便的开源 Minecraft 启动器，日常体验比 PCL2 更顺手。
        detail: 界面现代简洁，整合了版本下载、联机与资源中心，个人用下来觉得比 PCL2 更好用；链接直达官方 GitHub 仓库下载纯净最新版，不含任何个人数据。
        badge: Minecraft · 开源
        cta: 前往仓库
        images: [/resources/covers/blockhelm-launcher.webp]
        tags: [Minecraft, 启动器, 开源]

  - title: 接码平台与地址生成
    note: 注册海外网站、外区账号或填写测试账单地址时的顺手工具。
    items:
      - name: HeroSMS
        href: https://hero-sms.com/cn
        summary: 覆盖 180+ 国家的国外手机号接码平台，用于接收海外网站与平台注册验证码。
        detail: 注册海外网站或应用收不到国内短信时，可以按需使用虚拟号码在线接收短信验证码，同时支持 API 自动化调用。
        badge: 海外接码
        cta: 打开网站
        images: [/resources/covers/hero-sms.webp]
        tags: [接码, 验证码, 海外注册]
      - name: USAddressGen（美国免税州地址生成）
        href: https://usaddressgen.com/tax-free-address/
        summary: 一键生成美国免税州标准地址，适合外区账号注册与免税账单填写。
        detail: 专门生成俄勒冈、特拉华等美国免消费税州的规范街道与邮编信息，注册美区服务时非常省事。
        badge: 免税州地址
        cta: 打开网站
        tags: [免税州, 地址生成, 外区注册]
      - name: 美国地址生成器（全球地址）
        href: https://www.meiguodizhi.com/
        summary: 全球多国地址与资料生成器，邮编、街道、邮箱、姓名、住址一应俱全。
        detail: 支持美国及全球多个国家和地区的规范虚拟地址一键生成，街道门牌、邮编、随机姓名与辅助资料一步配齐，开箱即用。
        badge: 全球地址生成
        cta: 打开网站
        tags: [全球地址, 资料生成]

  - title: 懂得都懂
    note: 懂的人自然懂，请在合规网络环境下按需自取。
    items:
      - name: 哔咔漫画（PicACG）
        href: https://files.northcedar.top/apps/picacg.apk
        summary: 哔咔漫画 Android 手机版安装包直链，懂得都懂。
        detail: 纯净标准 APK 安装包（8.58 MB，已核验不含任何个人账号数据），手机端下载安装即用。
        badge: Android · APK
        cta: 下载 APK
        tags: [漫画, Android]
      - name: 禁漫天堂（JMComic）
        href: https://18comic.vip/
        summary: 禁漫入口，懂的都懂——回家了。
        detail: 常用直达入口地址，访问时一般需要配合网络代理；收藏防迷路。
        badge: 在线站点
        cta: 打开网站
        tags: [漫画, 站点]
      - name: 衣姿 PoseWear
        href: https://posewear.pages.dev/#pose
        summary: 姿势库、服装库与人物库超全的 AI 图片生成工作台，需填入自己的 API Key。
        detail: 内置丰富的多角度姿势、穿搭、人物与场景控制面板，当正常的 AI 生图参考与出图网站就已经非常顺手；右上角开启 18+ 模式还能解锁新世界，需自备生图 API Key 使用。
        badge: AI 生图 · 需自备 Key
        cta: 打开网站
        images: [/resources/covers/posewear.webp]
        tags: [AI绘图, 姿势库, 工作台]

  - title: 有趣的网站
    note: 没事逛一逛总能发现惊喜的宝藏互联网站点。
    items:
      - name: Internet Archive（互联网档案馆）
        href: https://archive.org/
        summary: 非营利“互联网博物馆”，通过时光机回看各大网站多年前的历史老版本。
        detail: 旗下的 Wayback Machine 收录了超过一万亿张历史网页快照，输入任意网址就能穿越回几年前甚至二十年前的老界面；站内还免费保存着海量绝版老软件、怀旧网页游戏、电子书与纪录片，是名副其实的互联网数字图书馆。
        badge: 互联网博物馆
        cta: 打开档案馆
        images: [/resources/covers/internet-archive.webp]
        tags: [时光机, 档案, 宝藏网站]
      - name: Yandex
        href: https://yandex.com/
        summary: 俄罗斯最大的搜索引擎，无需网络代理即可检索大量国际网站与外网资料。
        detail: 直连即可搜索不少海外网页，而且它的「以图搜图」识别准确度极高，找高清原图、画师出处或冷门资源时往往比常见搜索引擎更好使。
        badge: 搜索引擎 · 免代理
        cta: 打开搜索
        images: [/resources/covers/yandex.webp]
        tags: [搜索, 以图搜图, 国际站]
      - name: Anywear（Decart AI 赛博试穿）
        href: https://anywear.decart.ai/
        summary: 基于实时视频生成模型的 AI 赛博试衣间，把各大网站的衣服直接“穿”在身上。
        detail: 区别于只能传静态照片的传统换装，Anywear 用实时视频模型驱动，打开摄像头就能动态实时试穿——转身、换姿势衣服都会自然贴合；还能直接从各大购物网站拖入心仪单品“赛博试穿”，网购前先看上身效果非常有趣。
        badge: AI 实时试衣
        cta: 去试穿
        tags: [AI试穿, 黑科技, 有趣]
---
