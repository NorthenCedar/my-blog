---
title: 我的Python备忘录
date: 2026-10-25
updated: 2026-10-25
summary: 本人写代码经常会忘，所以新建一篇文章专门用来记录代码，此文会持续更新，日期是第一次发布日期
tags: [个人, 备忘]
draft: false
---

## range语句
1.range(num) 是从0开始到num-1结束。如range(5)取得的数据是:[0,1,2,3,4]
2.rnage(num1,num2) 是从num1开始到num2-1结束
3.range(num1,num2,step) 是从num1开始到num2-1结束,数字之间以step为步长。如range(5,10,2)取得的数据是:[5,7,9]
  eg:
```python
# 打印 99 乘法表
for i in range(1, 10):          # 外层循环控制行，i 从 1 到 9
    for j in range(1, i + 1):   # 内层循环控制列，j 从 1 到 i
        # 格式化输出，end="\t" 表示不换行，并用制表符隔开
        print(f"{j}*{i}={i*j}", end="\t")
    print()                     # 内层循环结束后，换行
```
今天就到这了，太困了，明天再写