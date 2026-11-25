---
title: c语言进阶
date: 2026-11-21
summary: 之前的c语言入门都会了看这篇c语言进阶
tags: [教程, 个人, 备忘]
draft: false
cover: ./file_000000000d1481fda6641a9a2ed18b77.jpg
coverAlt: 我超喜欢这个白底红绿灯终端
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

结构里面的类型可以不一样，可以装int,同时也可以装一个struct date\* (结构里面装struct date\* 会在链表里面讲)

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

    today = (struct date){11,31,2026};

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

int main(int argc, char const **argv) {
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

- 之前的方案，把一个结构传入函数，然后在函数中操作，但没有返回回去

  &#32;&#32;&#32;&#32;问题在于传入函数是外面那个结构的克隆体，而不是指针

  &#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;传入结构和传入数组是不同的

- 在这个输入函数中，可以创建一个临时的结构变量，然后把这个结构返回给调用者

```c
#include <stdio.h>

struct point {
    int x;
    int y;
};

struct point getStruct(void);   // 让这个函数不需要参数，返回是一个struct point
void output(struct point);

int main(int argc, char const **argv) {
    struct point y = {0,0};
    y = getStruct();
    output(y);

    return 0;
}

struct point getStruct(void) {
    struct point p;
    scanf("%d", &p.x);
    scanf("%d", &p.y);
    printf("%d %d\n", p.x, p.y);
    return p;
}

void output(struct point p) {
    printf("%d %d\n", p.x, p.y);
}
```

### 结构指针作为参数

先来看指向结构的指针怎么写

```c
    struct date {
        int month;
        int day;
        int year;
    } myday;

    struct date *p = &myday;

    // (*p).month = 12;
    p->month = 12;  // 这行和上一行是等价的
    printf("%d\n", p->month);   // 或者printf("%d\n", myday.month);
```

- 用->表示指针所指的结构变量中的成员，我们来重写一下上面的程序

```c
#include <stdio.h>

struct point {
    int x;
    int y;
};

struct point *getStruct(struct point*);
void output(struct point);
void print(const struct point *p);

int main(int argc, char const **argv) {
    struct point y = {0,0};
    getStruct(&y);  // 这里传入的是地址
    output(*getStruct(&y));   // 这是用*取出将函数传回的指针里面的内容
    // 甚至还可以这样：*getStruct(&y) = (struct point){1,2};
    print(getStruct(&y));

    return 0;
}

struct point *getStruct(struct point *p) {
    scanf("%d", &p->x);
    scanf("%d", &p->y);
    printf("%d %d\n", p->x, p->y);
    return p;
}

void output(struct point p) {
    printf("%d %d\n", p.x, p.y);
}

void print(const struct point *p){
    printf("%d %d", p->x, p->y);
}
```

### 结构数组

语法：

struct date dates\[100\];

struct date dates\[\] = {

&#32;&#32;&#32;&#32;{4,5,2026}, {3,4,2026}};

```c
#include <stdio.h>

struct time {
    int hour;
    int minutes;
    int seconds;
};

struct time timeUpdate(struct time now);

int main(void) 
{
    struct time testTimes[5] = {
        {11, 59, 59}, {12, 0, 0}, {1, 20, 30}, {23, 59, 59}, {12, 1, 1}
    };
    int i;

    for (i = 0; i < 5; i++) {
        printf("Time is %.2i:%.2i:%.2i", 
            testTimes[i].hour, testTimes[i].minutes, testTimes[i].seconds);

        testTimes[i] = timeUpdate(testTimes[i]);

        printf("...one second later it is %.2i:%.2i:%.2i\n", 
            testTimes[i].hour, testTimes[i].minutes, testTimes[i].seconds);
    }
    return 0;
}

struct time timeUpdate(struct time now) 
{
    now.seconds++;
    if (now.seconds == 60) {
        now.seconds = 0;
        now.minutes++;

        if (now.minutes == 60) {
            now.minutes = 0;
            now.hour++;

            if (now.hour == 24) {
                now.hour = 0;
            }
        }
    }
    return now;
}
```

### 结构中的结构

struct dateAndTime {

&#32;&#32;&#32;&#32;struct date sdate;

&#32;&#32;&#32;&#32;struct time stime;

};

- 嵌套的结构

```c
struct point {

    int x;

    int y;

};

struct rectangle {

    struct point pt1;

    struct point pt2;

};
```

如果有变量：struct rectangle r;

就可以有：r.pt1.x、r.pt1.y、r.pt2.x 和 r.pt2.y

如果有变量定义：struct rectangle r, \*rp;

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;rp = &r;

那么这四种形式是等价的：r.pt1.x 、rp->pt1.x 、(r.pt1).x 、(rp->pt1).x

但是没有rp->pt1->x ，因为pt1不是指针

### 结构中的结构的数组

```c
#include <stdio.h>

struct point {
    int x;
    int y;
};

struct rectangle {
    struct point p1;
    struct point p2;
};

void printRect(struct rectangle r)
{
    printf("<%d, %d> to <%d, %d>\n", r.p1.x, r.p1.y, r.p2.x, r.p2.y);
}

int main(int argc, char const *argv[])
{
    int i;
    struct rectangle rects[] = {{{1, 2}, {3, 4}}, {{5, 6}, {7, 8}}}; // 2 rectangles
    for(i=0; i<2; i++) printRect(rects[i]);
    
    return 0;
}
```

## 联合

### 自定义数据类型

- typedef用来声明一个已有的数据类型的新名字

  &#32;&#32;&#32;&#32;比如：typedef int Length;   //&#32;**最后一个单词之前**是原来的类型，**最后一个单词**是新名字

  &#32;&#32;&#32;&#32;使得*Length*成为*int*类型的别名

- 这样，Length这个名字就可以代替int出现在变量定义和函数申明的地方了：

  &#32;&#32;&#32;&#32;Length a, b, len;     Length numbers\[10\];

```c
typedef struct ADate {
    int month;
    int day;
    int year;
} Date;    // Date是简化之后的名字，代替struct ADate

Date d = {11, 24, 2026};    // 等于struct ADate d = {11, 24, 2026};

// 但如果是以下写法
typedef struct{
    int month;
    int day;
    int year;
} Date;        // 这种写法是说有个无名结构新叫做Date，这个结构叫什么不重要了

// char *Strings[10];    // 这是声明了一个*变量*，名字叫Strings，由十个字符指针组成的数组
typedef char *Strings[10];   // 此时，Strings不再是变量名了，变成了一个全新类型的名字。
//这个全新类型是“包含10个char*的数组”，Strings和int,float一样是类型了
Strings my_names;
my_names[0] = "北杉";
my_names[1] = "张三";

typedef struct node{
    int date;
    struct node *next;    // 链表里面会讲
} aNode;      // aNode就是struct node的新名字
```

### 联合

- 联合和结构比较像，但结构是每一个成员有单独的内存空间，联合是所有成员共享同一块物理内存；

- 在这块公用内存里，任何时候只能存一个成员的值，存了一个就会把另外几个覆盖掉。

- 联合体所占的字节数取决于里面最大的那个成员的大小

  &#32;&#32;&#32;&#32;sizeof(union ...) = sizeof(每个成员) 的最大值

```c
#include <stdio.h>

typedef union {
    int i;
    char ch[sizeof(int)];
} CHI;

int main(int argc, char const *argv[])
{
    // 看看整数在内存里到底怎么存的
    CHI chi;
    int i;
    chi.i = 1234;   // 转换成16进制是0x000004D2
    
    // 遍历 int 所占的每一个字节（通常是 4 个字节）
    for ( i=0; i<sizeof(int); i++ ) {
        // 以十六进制形式打印每一个字节的内容
        printf("%02hhX", chi.ch[i]);     // X:以大写十六进制输出，02:至少输出2位数，不够前面补0(比如D会变成0D)，hh:告诉printf后面的参数是char类型的长度
        // %02hhX在后面文件里会讲
    }
    printf("\n");
    
    return 0;
}
```

上面那个程序输出的结果大概率是“D2040000”，为什么不是000004D2

&#32;注：1个十六进制数字4比特，1字节8比特，所以一个格子（字节）装两个十六进制数字，变成00 00 04 D2，是一个int所占的4字节

如果是小端模式（大多数Intel/AMD电脑，为了计算机计算方便，计算机都从低位开始算）都是低位字节存在前面（D2040000）

大端模式（一般网络路由器、服务器用，为了人类看着方便）就是低阶在后（000004D2）



那么联合到底有什么用呢

- 极致省内存，嵌入式开发常用，如果两个成员不需要同时出现就可以用

- 检测电脑是大端还是小端

- 结构体的变体

  &#32;&#32;&#32;&#32;有时候一个数据可能是 int，也可能是 double。我们可以在 union 里同时放这两个。再用一个额外的变量（比如 int type）来标记当前到底存的是哪一个。

```c
#include <stdio.h>

// 1. 定义标签：用来标记当前到底存的是什么类型
enum DataType {
    TYPE_INT,
    TYPE_DOUBLE
};

// 2. 定义联合体：用来共享内存，只存数据本身
union DataValue {
    int i;
    double d;
};

// 3. 定义结构体：把“标签”和“数据”打包在一起
struct Variant {
    enum DataType type;   // 标签
    union DataValue data; // 数据（可能是 int 也可能是 double）
};


int main() {
    // 声明一个变体变量
    struct Variant v1;

    // ==========================================
    // 场景 A：我当前想存一个整数
    // ==========================================
    v1.type = TYPE_INT;   // 贴上标签：这是 int
    v1.data.i = 42;       // 存数据

    // 怎么读取？必须先看标签！
    if (v1.type == TYPE_INT) {
        printf("当前存的是整数: %d\n", v1.data.i);
    } else if (v1.type == TYPE_DOUBLE) {
        printf("当前存的是小数: %f\n", v1.data.d);
    }

    // ==========================================
    // 场景 B：我想把它改成存一个小数
    // ==========================================
    v1.type = TYPE_DOUBLE; // 撕掉旧标签，贴上新标签
    v1.data.d = 3.14159;   // 存新的数据（这会覆盖掉刚才的 42）

    if (v1.type == TYPE_INT) {
        printf("当前存的是整数: %d\n", v1.data.i);
    } else if (v1.type == TYPE_DOUBLE) {
        printf("当前存的是小数: %f\n", v1.data.d);
    }

    return 0;
}
```

上面这个程序比设两个普通变量省内存