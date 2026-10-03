---
title: 关于
# 头像与社交账号（站主 2026-09-26 要求）。改这里不用碰代码：
#   avatar      头像文件名 —— 图片放 src/assets/about/（要参与构建期优化，这是内容层唯一的例外）
#   avatarName  头像下面那行字
#   social      社交账号卡片：icon 取 github / mail / rss / douyin / bilibili，name 是卡片上的字
#   stack       技术栈（2026-09-28 要求）：group 是分组小标题，items 是该组条目。
#                每一项都在本仓库里有出处（依赖见 package.json、部署见 wrangler.toml、
#                接口见 functions/api/、字体见 public/fonts/）—— 改之前先确认它还在用。
#   signature   手写签名图（站主 2026-10-03 提供原件，已抠白底转墨绿）—— 同 avatar 的目录。
#                显示为深底切片「FIG.01 HAND」，落笔动画是横向揭幕。
# signatureNote 签名切片底部那行小字（等宽字，读数感）。
avatar: avatar.jpg
avatarName: 北杉
signature: sign.png
signatureNote: HANDWRITING · 北杉
social:
  - icon: github
    name: GitHub
    href: https://github.com/NorthenCedar
  - icon: mail
    name: 邮箱
    href: mailto:a13655515876@163.com
  - icon: rss
    name: RSS
    href: /rss.xml
  - icon: douyin
    name: 抖音
    href: https://www.douyin.com/user/MS4wLjABAAAA_s1DtB8crLmTepK0rZPjJr7U8W2Lm7EGWVti1q4Zwlgp52SGKtZsqL-1_U7_HOK_?from_tab_name=main
  - icon: bilibili
    name: 哔哩哔哩
    href: https://space.bilibili.com/515563135?spm_id_from=333.1007.0.0
stack:
  - group: 构建
    items:
      - Astro（静态生成）
      - TypeScript
      - Markdown 内容集合
      - Vitest
  - group: 服务
    items:
      - Cloudflare Pages（部署）
      - Pages Functions（评论与点赞接口）
      - Cloudflare D1（存评论、留言、点赞）
      - 站点统计 PV / UV（服务端计数，零第三方）
  - group: 呈现
    items:
      - 自托管字体（零第三方请求）
      - 构建期图片优化（WebP + 多档尺寸）
      - 全 CSS 动效（无动画库，时间轴不写脚本）
      - 页面过渡（2.2 秒四阶段，纯 CSS 时间轴）
      - 跟手光标（白点 + 圆盘 + 涟漪，无位图）
      - RSS / Sitemap
---

我叫郑云嘉，是一个大学生。这个博客写我个人的成长经历。

真正留在我身上的东西有四种：钢琴的手感、街舞的肌肉记忆、唱歌的自信，还有相机的眼睛。它们的共同点很有意思——都不是被考级、比赛、证书逼出来的，反而是那些"没用了"之后自己留下来的。

（这段出自[《钢琴八级之后》](/posts/piano-eight-level-and-after/)，整篇是这句话的长版本。）

我在这里写随笔、放照片、记一些用 AI 折腾项目的经历。写得好不好另说，先写。

想联系我，发邮件到 <a13655515876@163.com>。
