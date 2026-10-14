---
# 说说页内容（站点内容层）。
#
# 怎么发一条说说（详见 docs/writing-guide.md「发说说」一节）：
#   items 里加一条，新的写最上面（页面自己会按日期倒序，顺序其实不影响）：
#     - date: 2026-09-26          # 日期，YYYY-MM-DD
#       text: 要说的话            # 正文，一行或几句都行
#       href: https://…           # 可选：正文后面跟一个「链接」
#       images:                   # 可选：一条说说可以带多张图
#         - src: 名字.jpg         # 图片文件放在 src/assets/talks/ 下，这里只写文件名
#           alt: 图片说明         # 必填（站上有硬约束：所有图片 alt 非空）
#
# 图片为什么不在 content/ 下：站上所有图片都要参与构建期优化（转 WebP + 出 srcset），
# 只有 src/ 里的资源能被 Astro 处理 ⇒ 图片放 src/assets/talks/，这是唯一的例外。
title: 说说
intro: 短的、没成为文章的东西。碎碎念、随手拍的、看到的一句话，都放这儿。
items:
  - date: 2026-10-15
    text: 把chatgpt的plus套餐接到Claude里面用怎么那么快啊，我用codex改了相册页两个装置才用了10%左右，用Claude里面就做了给鼠标滚轮放大缩小的功能和修个bug直接给我这周额度干没了。:（
  - date: 2026-10-13
    text: 谁家agent给自己装个虚拟机用啊，我今天看我c盘莫名其妙少了十几G，就去问claude。以下是回答:"Cowork 的做法是给 Claude 一台虚拟机。通过 VM，Cowork 让 Claude 能像一个真人一样，在一个安全隔离的环境中自由地安装软件、执行任务，而不是困在一个只能回答问题的输入框里。"  我:???谁家AI这么会享受，自己买套房住。（我今天第一次用cowork这个模式）
  - date: 2026-10-13
    text: "整个高中都没怎么动过，现在让我去校园跑？？大学体测标准怎么比中考标准还高？我右腿这两天都好酸: 0"
  - date: 2026-10-12
    text: calude和codex是真好用啊，但是真的贵:( 不过我薅了chatgpt学生认证的4个月plus,哈哈哈哈 开始狂蹬
    images:
      - src: e88b0230-39f1-4585-bf95-c9d4ce180f13.jpg
        alt: 好贵：（
      - src: ii.jpg
        alt: 五个月的plus！！！
  - date: 2026-10-09
    text: 我用deepseek-v4.1-flash和最近的匿名模型space-bunny修螺旋盘的bug修了六七轮没修好，今早丢给claude的opus5.5两轮修好了，Claude不愧是当代最强啊（五条悟？）但用Claude花了我快五十块。。。
  - date: 2026-10-09
    text: 自在极意豪，我没招了啊
    images:
      - src: IMG_20261009_221622.png
        alt: 吸睛的聊天记录
  - date: 2026-09-28
    text: 已经连续三天晚上三点睡了，为了改ui，修bug，不过已经差不多做完了，不能再熬夜了。。
    images:
      - src: 20260928-1.jpg
        alt: 叹气
  - date: 2026-09-26
    text: 终于做的像一个真正的博客了！
---
