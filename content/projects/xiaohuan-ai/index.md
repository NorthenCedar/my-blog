---
title: 给小幻一个新固件
summary: 不改外壳、不搭电脑网关，靠逆向原厂固件和二进制补丁，给一颗圆形小屏幕加上本地唤醒、30 秒连续对话和情绪字幕。
tagline: 让小幻可以思考，听清
category: ROBOTICS
status: 已完成
order: 4
tags:
  - 桌宠
  - AI
  - 固件
visual: image
effect: develop
images:
  - src: ./file_00000000c7bc81fdb05b072423706bf5.jpg
    alt: file 00000000c7bc81fdb05b072423706bf5
    darkSrc: ./file_00000000698481fd92c71bee9b1c8068.jpg
links:
  - label: 看看怎么做的
    href: /posts/huanzhu-ai/
preview: {}
---
最初是在网上刷到了这颗叫「幻珠」的小桌宠，一眼就被它圆圆的屏幕和眨来眨去的大眼睛吸引了。买回来后发现原厂只带展示和音乐律动，但拆开一看里面本来就是一颗自带麦克风、扬声器和 Wi-Fi 的 ESP32-S3，干脆直接对固件动手改造。

现在它拔掉电脑也能独立在桌边联网运行。大眼睛待机时喊一声「小幻」就能本地唤醒、免唤醒连续对话 30 秒，回话时还会同步在圆屏下方浮出浅色情绪字幕。文章里记录了逆向补丁、唤醒调校和字幕渲染的过程，也附了演示和固件下载。