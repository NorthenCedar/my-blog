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

    today.month = 11;
    today.day = 21;
    today.year = 2026;

    printf("Today\' date is %i-%i-%i.\n", today.year, today.month, today.day);
    // %i是整数格式说明符，和%d基本相同。输出时都按十进制输出，两者可互换使用，输入时%i能自动识别进制

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

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;struct date today = {11, 21, 2026};

- 具体指明哪个是谁的

  &#32;&#32;&#32;&#32;struct date thismonth = {.month = 11, .year = 2026};  // 和数组一样，没赋值的自动赋为0

### 结构成员

- 结构和数组有点像

- 数组用\[\]和下标访问其单元，结构用.运算符和名字访问其成员

### 结构运算

- 要访问整个结构，直接用结构变量的名字

- 对于整个结构，可以做赋值、取地址，也可以传递给函数参数

  &#32;&#32;&#32;&#32;p1 = (struct point){5, 10};  // 相当于p1.x = 5;   p1.y = 10;

  &#32;&#32;&#32;&#32;p1 = p2;  // 相当于p1.x = p2.x;  p1.y = p2.y;```c
#include <stdio.h>

struct date {
    int month;
    int day;
    int year;
};

int main(int argc, char const **argv) {
    struct date today;

    today = (struct date) {11,31,2026};

    struct date day;

    day = today;
    day.year = 2025;

    printf("Today's date is %i-%i-%i\n", today.year, today.month, today.day);
    printf("Day's date is %i-%i-%i\n", day.year, day.month, day.day);

    return 0;
}
```

### 结构指针

- 和数组不同，结构变量的名字并不是结构变量的地址，