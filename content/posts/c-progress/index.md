---
title: c语言进阶
date: 2026-11-21
summary: 之前的c语言入门都会了看这篇c语言进阶
tags: [教程, 个人, 备忘]
draft: false
---
## 结构

### 声明结构类型

```c
#include <stdio.h>

int main(int argc, char const *argv[])
{
    struct date {
        int month;
        int day;
        int year;
    };   // 分号不能忘

    struct date today;

    today.month = 07;
    today.day = 31;
    today.year = 2014;

    printf("Today\' date is %i-%i-%i.\n", today.year, today.month, today.day);

    return 0;
}
```

### 在函数内/外

- 和本地变量一样，在函数内部声明的结构类型只能在函数内使用

- 所以通常在函数外部声明结构类型，这样就可以被多个函数所使用了

### 声明结构的形式

```c
strcut point {

    int x;

    int y;

};

struct point p1, p2;
```

p1和p2都是point；里面都有x和y的值

```c
struct {
    int x;
    int y;
} p1,p2;
```

p1和p2都是一种无名结构，里面有x和y。（不太常用）

```c
struct point {
    int x;
    int y;
} p1,p2;
```

p1和p2都是point，里面有x和y的值

### 结构的初始化

- 直接用大括号一一按顺序赋值

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;struct date today = {07, 31, 2014};

- 具体指明哪个是谁的

  &#32;&#32;&#32;&#32;struct