# 单册灯箱与阅读目录实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 完成可打断、可降级的照片灯箱和阅读目录动效。
**Architecture:** 单册业务从Astro脚本移到photo-wall.ts，lightbox-motion.ts只负责布局变换；toc-motion.ts消费post-rail的当前链接回调。复用motion-loader，两个子功能独立验收。
**Tech Stack:** Astro、TypeScript、GSAP3.15.1、Vitest/happy-dom。
**Spec:** docs/superpowers/specs/2026-11-05-wall-toc-motion.md

## Global Constraints
- 本地隔离工作区，不发布；PowerShell7.6.9；不添加依赖。
- 颜色来自tokens；不触碰螺旋盘和三维；保留真实大档、延迟预取及无脚本链接。
- 引擎未就绪不阻塞操作，减少动态与离开页面安全清理。

## Review Focus
- 打开、连续换图、关闭、再次打开同图时旧解码不覆盖新会话。
- 大图慢、加载失败、当前缩略图离屏时仍可关闭与恢复焦点。
- 窗口尺寸变化、bfcache、减少动态变化不残留变换和背景锁。
- 长目录内部滚动及多行标题，指示线对应实际当前链接且不滚动正文。
- 原生锚点/修饰点击/无库保持正常操作，首屏不预加载GSAP。

### Task 1: 单册照片墙灯箱

**Files:** src/components/PhotoWall.astro、src/scripts/photo-wall.ts、src/scripts/lightbox-motion.ts、src/styles/tokens.css、tests/photo-wall-motion.test.ts、tests/gallery-image-load.test.ts
**Interfaces:** initPhotoWall(doc, imaging?, engine?)返回清理函数；imaging沿用showBig(img,big,onReady)、prefetch、intentPrefetch。createLightboxMotion(root,img,engine?)提供open(from)、change(direction)、close(to,done)、finish、dispose。
- [x] 真实DOM回归：保留图注直到解码就绪；关闭后过期解码无效；重开同图、修饰点击、循环切换、焦点/overflow/inert恢复。先运行预期模块不存在FAIL。关键检验示例：open第一图、step到第二图、触发第一个ready后仍不更新第二图图注、close后ready不显示。
- [x] 实现单一大图上的位移/缩放，使用gsap.fromTo(image,from,{x:0,y:0,scaleX:1,scaleY:1,duration:.38})；关闭使用最新显示帧缩略图边界，离屏淡出。所有旧回调以会话与请求版本隔离。
- [x] 更新静态加载测试的源码范围到新控制器，保留原断言；运行灯箱、图片、相册相关回归及构建，预期PASS。
- [x] 浏览器核对桌面/手机、连点和Esc；本地提交。

### Task 2: 文章阅读目录

**Files:** src/components/Toc.astro、src/scripts/toc-motion.ts、src/scripts/post-rail.ts、src/layouts/Post.astro、tests/toc-motion.test.ts、tests/post-rail.test.ts、tests/build-output.test.ts、docs/writing-guide.md、docs/rhinelab-spec.md、content/pages/log.md
**Interfaces:** initPostRail(doc,onActive?)兼容原调用，回调(link,changed)；createTocMotion(nav,engine?)返回moveTo(link,reveal)、finish、dispose。
- [x] 写DOM回归，预期缺少模块FAIL：活动行几何定位、目录内部滚动、窗口变化、减少动态、销毁，现有post-rail测试保持通过。关键检验：目录滚动40px后markerY随链接减少40，不动window.scrollY；缺少库时也有正确marker。
- [x] 在Toc增加aria-hidden指示线，优先transform的y/scaleY/x更新；post-rail同步aria-current并调用onActive，原生锚点不拦截。
- [x] 定向回归与npm run verify，预期PASS；若预算失败按真实新增闭包量调整且记录，保留引擎首屏禁入约束。
- [x] 实测桌面、窄屏、多行与长目录；更新手册/工程记录/日志，完成一次独立整批只读审查，修复重要问题，保留预览。

## Native execution
用户已经明确要求开始实现，直接在现有隔离工作区自行执行；不重复请求方案审批。两个任务仅共享现成motion-loader，不共享页面状态；任务2消费的onActive回调在同一任务内定义。
