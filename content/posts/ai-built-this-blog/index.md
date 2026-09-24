---
title: 我用手机 AI 指挥电脑 AI，从零搭了这个博客
date: 2026-09-16
summary: 一行代码没手写：把电脑里的 skills 列表发给手机上的 DeepSeek，让它生成提示词去指挥 Codex，从 0 搭了一个个人博客。
tags: [AI, 建站]
draft: false
---

先说清楚这件事有多离谱：我，一个 Python 学了不到半年的人，想拥有一个个人博客。正常的做法是学 HTML、CSS、JavaScript，再学一个框架，两个月过去了。我的做法不太一样：手机上一个 AI，电脑上一个 AI，我夹在中间负责传话和点头。

手机上是 DeepSeek，电脑上是 `codex` CLI，接的是 DeepSeek 的 `deepseek-v4-flash` 模型。整个流程分三层，各自的角色我用过一段时间后总结如下：

## 这套流水线的分工

- 手机上的 DeepSeek 负责"想"
  - 我把电脑上下载的 skills 和插件列表全文发给它
  - 它把我的模糊需求翻译成阶段化的严格提示词
  - 每个决策点都要求它附上"推荐答案 + 我来拍板"的格式，防止它替我乱选
- 电脑上的 Codex 负责"做"
  - 严格按阶段执行，一个阶段结束就停下来等确认，绝不跳步
  - 遇到不确定的事必须提问，不允许自己假设后一路做到底
  - 被明确要求：禁止 AI 味设计，不要紫蓝渐变，不要默认 Inter 加圆角卡片堆砌
- 我负责"验收"
  - 看不懂的代码让它解释到人话为止
  - 效果不对直接打回重来，不猜、不凑合
  - 不定期检查它有没有偷偷加没必要的依赖

## 第一步：把弹药从电脑搬到手机

Codex 的 skills 和插件列表都在本机，手机上是没有的，所以第一步是导出：

```bash
# 把 codex 的"家底"导出来
ls ~/.codex/skills/  > skills.txt
ls ~/.codex/plugins/ > plugins.txt
cat skills.txt plugins.txt

# 全文复制，微信文件传输助手发到手机
# 手机上的 DeepSeek 消化完，吐出阶段化提示词
# 提示词传回电脑，喂给 codex，开工
codex "按这份文档执行阶段 0，完成就停下等我确认"
```

## 第二步：提示词本身长什么样

这就是整件事的核心：我不直接给 Codex 下命令，而是让 DeepSeek 先帮我写一份"元提示词"。原文我贴一部分在下面——注意，这个代码块里有超长行，是故意的，测排版用的，你别管我（这句话也是故意这么写的，为了把行撑得更长一点，顺便测一下行内能不能混着用 `draft: true` 这样的代码）：

```text
== 第一原则 ==
先别写代码。按阶段走，每个阶段结束停下来等我确认。不确定的事问我，不要替我假设后一路做到底。

== 前置：设计载荷（我来提供） ==
我会给你 3 篇真实草稿作为排版依据，你不要用 Lorem ipsum：一篇长文（3000 字以上，含 2–3 级标题、引用、列表）、一篇技术文（带代码块、行内代码、外链）、一篇短文（500 字左右）。理想情况其中一篇带图，用来测正文图片呈现。如果我在阶段 3 之前还没给你，停下来催我，不要自己编假文章。

== 硬约束 ==
禁止 AI 味设计：不要紫蓝渐变、不要默认 Inter + 圆角卡片堆砌、不要一屏三列 feature grid、不要玻璃拟态。所有页面移动端必须可用。正文对比度 ≥ 4.5:1。内容层与表现层必须解耦：换主题不该动文章文件。
```

## 第三步：内容模型先定死

阶段 0 的要求是"内容模型先定死，后面不许乱改"。frontmatter 统一长这样：

```yaml
---
title: 我用手机 AI 指挥电脑 AI，从零搭了这个博客
date: 2026-09-16
summary: 一行代码没手写：把 skills 列表发给 DeepSeek，让它生成提示词去指挥 Codex，从 0 搭了一个个人博客。
tags: [AI, 建站]
draft: true
---
```

字段细节如下表，写死的部分谁也不能动（包括 AI）：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| title | string | 是 | 文章标题，列表页和详情页共用 |
| date | date | 是 | 发布日期，列表页按它倒序排 |
| summary | string | 是 | ≤ 80 字摘要，列表页与 meta description 共用 |
| tags | string[] | 是 | 1–3 个，别硬凑 |
| draft | boolean | 是 | 必须显式写。为 `true` 时生产构建排除，本地开发可见并标「草稿」 |
| updated | date | 否 | 有则显示「更新于」，须晚于 date |
| cover | string | 否 | 封面图路径，相对本文所在目录 |
| coverAlt | string | 否 | 封面图的替代文本；有 cover 就必须填 |
| slug | string | 否 | 覆盖文件夹名生成的 URL；中文标题必须写 |

我的配置就长这样：

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "base_url": "https://api.deepseek.com/v1",
  "api_key_env": "DEEPSEEK_API_KEY",
  "note_to_self_only": "this api key is bound to my personal blog project only, do not share it, do not commit it into any repository, and do not paste it into any chat window or screenshot under any circumstances, i am serious",
  "max_tokens": 8192
}
```

## 踩过的坑，挑三个真的说

1. AI 会过度设计。你只说"界面要好看"，它能给你整出一屏三列卡片、渐变、玻璃拟态全家桶。所以"禁止清单"必须前置写死，不要等它做错了再骂。
2. 测试内容必须自己来。技术文的长代码行、长文的长段落，全用真实草稿。Lorem ipsum 排出来什么都测不出来——你现在正在读的这篇文章，就是三份设计载荷之一，这个超长行代码块就是故意塞进来压排版用的。
3. 每次只推进一个阶段。有过一次我图快，让它一口气做完阶段 3 到阶段 5，结果视觉草案的地基不稳，后面全返工。宁可慢，不要并行。

模型和调用方式以 [DeepSeek 的 API 文档](https://api-docs.deepseek.com/) 为准，我上面的配置只是个示例，别照抄。

最后说句实话：这套流程里我最重要的技能不是编程，是"会问问题"。AI 把活干了，但活干成什么样，取决于我给的提示词。所以这篇名义上是建站记录，实际上是我的第一份 AI 协作文档——以后大概还会有很多份。
