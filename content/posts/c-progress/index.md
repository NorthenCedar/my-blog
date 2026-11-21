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

  &#32;&#32;&#32;&#32;p1 = p2;  // 相当于p1.x = p2.x;  p1.y = p2.y;
```c
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

- 和数组不同，结构变量的名字并不是结构变量的地址，必须使用&运算符

- struc date \*pDate = &today;

### 结构作为函数参数

- 整个结构可以作为参数的值传入函数

- 这时候是在函数内新建一个结构变量，并复制调用者的结构的值

- 也可以返回一个结构，这与数组完全不同
```c
#include <stdio.h>
#include <stdbool.h>

struct date {
    int month;
    int day;
    int year;
};

bool isLeap(struct date d);
int numberOfDays(struct date d);

int main(int argc, char const **argv) {
    struct date today, tomorrow;

    printf("Enter today's date (mm dd yyyy): ");
    scanf("%i %i %i", &today.month, &today.day, &today.year);   // &的优先级高于.

    if (today.day != numberOfDays(today)) {
        tomorrow.day = today.day + 1;
        tomorrow.month = today.month;
        tomorrow.year = today.year;
    } else if (today.month == 12) {
        tomorrow.day = 1;
        tomorrow.month = 1;
        tomorrow.year = today.year + 1;
    } else {
        tomorrow.day = 1;
        tomorrow.month = today.month + 1;
        tomorrow.year = today.year;
    }

    printf("Tomorrow's date is %i-%i-%i\n", tomorrow.month, tomorrow.day, tomorrow.year);

    return 0;
}

int numberOfDays(struct date d) {
    int days;
    
    const int daysPerMonth[12] = {31,28,31,30,31,30,31,31,30,31,30,31};

    if (d.month == 2 && isLeap(d))
        days = 29;
    else
        days = daysPerMonth[d.month - 1];

    return days;
}

bool isLeap(struct date d)
{
    bool leap = false;

    if ((d.year % 4 == 0 && d.year % 100 != 0) || d.year % 400 == 0)
        leap = true;

    return leap;
}
```
### 输入结构

- 没有直接的方式可以一次scanf一个结构

- 如果准备写一个函数来读入结构

```c
#include <stdio.h>

struct point {
    int x;
    int y;
};

void getStruct(struct point);
void output(struct point);
int main() {
    struct point y = {0,0};
    getStruct(y);
    output(y);

    return 0;
}

void getStruct(struct point p) {
    scanf("%d", &p.x);
    scanf("%d", &p.y);
    printf("%d %d\n", p.x, p.y);   // 这里会输出你输入的值
}

void output(struct point p) {
    printf("%d %d\n", p.x, p.y);   // 这里会输出0 0，因为p是局部变量，函数结束时会销毁
}
```

但是读入的结构如何送回来呢

- 记住c在函数调用时是传值的

  &#32;&#32;&#32;&#32;所以函数中的p与main中的y是不同的

  &#32;&#32;&#32;&#32;在函数读入了p的数值之后，还没有任何东西回到main，所以y还是{0,0}

### 解决方案

熬不动了，明天接着写，欲知后事如何，且听下回分解