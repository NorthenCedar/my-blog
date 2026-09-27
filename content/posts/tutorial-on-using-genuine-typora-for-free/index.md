---
title: 免费使用正版的Typora教程
date: 2026-09-27
summary: 本文主要介绍如何免费使用正版的Typora
tags: [教程, 工具]
draft: false
---

## 1.下载

来到Typora官网https://typoraio.cn/releases/all下载1.10.6版本安装。（1.10.8目前没了）

## 2.安装

安装时注意安装路径，后续会在里面操作。

## 3.激活主程序

1.从安装目录中找到以下文件

![image-20260928000308825](image-20260928000308825.png)

用编辑器打开（以vscode为例）
查找：e.hasActivated="true"==e.hasActivated（点放大镜图标查找）![image-20260928000959009](image-20260928000959009.png)
替换成：e.hasActivated="true"=="true"
保存后重启Typora，提示已激活![image-20260928001055091](image-20260928001055091.png)

## 4.隐藏左下角“未激活“文字

找到该文件![image-20260928001404148](image-20260928001404148.png)

编译器打开，查找：“UNREGISTERED”:“未激活”
替换：“UNREGISTERED”:“”

保存后重启Typora，即可免费使用正版且最新的Typora。