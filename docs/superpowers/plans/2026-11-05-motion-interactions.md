# 三处交互动效实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在已确认外观上实现可打断、可降级的三处连续动效。
**Architecture:** motion-loader 负责交互意图预热和只读 ready 查询，motion-engine 只导出 GSAP/Flip。三个控制器分别负责播放器玻璃壳、归档布局变换、原生作品弹窗，互不共享页面状态。
**Tech Stack:** Astro、TypeScript、GSAP 3.15.1、Vitest；happy-dom 21.0.4 仅用于真实 DOM 控制器测试。
**Spec:** docs/superpowers/specs/2026-11-05-motion-interactions.md

## Global Constraints
- PowerShell 固定 7.6.9，先备份 package.json/package-lock.json。
- 不发布、不改首页结构、不重写三维场景，保留当前音乐功能与原生导航。
- 初始脚本不静态导入 GSAP，动态库不可用时操作立即生效。
- 颜色从 tokens 获取，减少动态直接到终态，退出页面释放动画与监听。

## Review Focus
- 打开尚未完成即关闭、关闭尚未完成又打开，终态与最新按钮状态一致。
- 中文输入法正在组词、极快筛选与空结果，不丢失输入、链接和计数。
- 原生 Esc、点击遮罩及直接 dialog.close 都归还实际封面节点并恢复焦点/滚动。
- 手机旋转、窗口缩放或减少动态变化时，不残留变形与占位节点。
- 库首次加载慢或失败，内容可读可操作，保持无脚本链接回退。

### Task 1: 共享引擎与播放器形变

**Files:** package.json、package-lock.json、tests/_deps.ts、src/scripts/motion-loader.ts、src/scripts/motion-engine.ts、src/scripts/player-morph.ts、src/components/MusicPlayer.astro、src/scripts/music-player.ts、tests/ui-motion.test.ts
**Interfaces:** 提供 primeMotion(element):()=>void、getMotion():MotionEngine|null；createPlayerMorph(root) 提供 setOpen(open)、dispose()。
- [x] 写真实 DOM 回归：资源未就绪立即展开；开→关→开保留最新终态；减少动态和销毁清理。运行定向测试，预期缺少控制器时失败。
- [x] 安装固定版本，登记白名单；玻璃壳与正文分层，使用 GSAP timeline 驱动变换，快速反向先 kill 并保留当前属性。
- [x] 定向测试通过，核对播放器原有队列测试；记录任务完成与本地提交。

### Task 2: 归档筛选重排

**Files:** src/pages/archive.astro、src/scripts/archive-filter.ts、src/scripts/archive-motion.ts、tests/archive-motion.test.ts
**Interfaces:** 使用 Task 1 的 primeMotion/getMotion；createArchiveMotion(host) 提供 run(update)、dispose()，initArchiveFilters(doc) 提供清理函数。
- [x] 写真实 DOM 回归：搜索/排序/清空、中文组词、连续输入、空结果与旧节点事件保留，预期缺少初始化函数时失败。
- [x] 将现有内联过滤逻辑移入控制器，先记录布局再同步改变 hidden 与 DOM 顺序；Flip 移动保留节点，短退场与轻淡入，下一次操作打断上次动画。
- [x] 定向测试通过，并检查实际构建归档及键盘操作；记录任务完成与本地提交。

### Task 3: 作品详情连续展开与全局验收

**Files:** src/components/ForgeProject.astro、src/scripts/forge.ts、src/scripts/project-dialog-motion.ts、src/styles/forge.css、tests/project-dialog-motion.test.ts、tests/forge-output.test.ts、tests/build-output.test.ts、tests/gallery-spiral.test.ts、docs/writing-guide.md、docs/rhinelab-spec.md
**Interfaces:** 使用 Task 1 的 primeMotion/getMotion；initProjectDialogs(body,isReduced) 提供 finishMotion()/dispose()，与现有造物台静态开关及 pagehide 清理连接。
- [x] 写原生 dialog 控制器回归：打开/关闭归还同一封面、快速关闭、重复打开、外部 close、降级与销毁，预期缺少模块时失败。
- [x] 模态层改为全视口透明 dialog、独立遮罩和可滚动卡片；独立飞行层搬运原封面，Flip 在卡片与详情槽之间过渡，标题位置衔接；最后归还节点并清理。
- [x] 更新真实依赖体积记录：保留完整闭包预算，并新增首屏静态闭包不加载 GSAP 的断言。
- [x] 定向回归与 npm run verify 通过；浏览器核对三处桌面/窄屏和快速操作；更新手册与工程记录。
- [x] 用独立上下文做一次整批审查，修复重要问题并复验，保留本地预览，不发布。

## Native execution
用户已明确要求实现这三项，在当前隔离工作区自行执行，不重复请求方案批准。任务共用的只有 motion-loader/engine；后两项消费相同接口。任务步骤中的命令统一通过断言 7.6.9 的 PowerShell 工作区脚本运行，长输出写入工作区。
