---
title: 我的C语言学习笔记
date: 2026-10-29
updated: 2026-11-02
summary: 如标题所示，本文主要是用来记笔记的，有兴趣或者也想学习C语言的小伙伴可以看看
tags: [个人, 备忘]
draft: false
---
最基础的输入输出、if语句就不写了，开头主要先记与python不一样的地方

## swich-case语句
swich-case语句用来替代需要多个if来判断输入的值的情况
遇到匹配的情况一直往下执行，直到遇到break才退出
```c
#include <stdio.h>

int main()
{
    int type;
    // 这行在C++中可以用：    const int THREE = 3; 此处定义一个**常量**，const意为常量，只读不可修改。
    // 但在c中，这里的THREE依旧是一个不可修改的变量。在C中想要达到此效果要在编译阶段实现：#define THREE 3
    scanf("%d", &type);
    switch (type){   //switch()括号里面的必须是整数或者整形的变量
    case 1:
        printf("这是第1条\n");    //试试输入1看看执不执行第二条
    case 1+1:    //case后面也可以是常数计算的表达式
        printf("这是第2条\n");
        break;
    case 3:
    //根据上面说的，此处可以用  case THREE:   case后面必须跟一个常量，不能是变量
        printf("这是第3条\n");
        break;
    default:   //如果不是上面几种情况就会执行此条
        printf("啊？什么\n");
        break;
    }

    return 0;

}
```

## do-while循环
### 是什么
在进入循环时不做检查，而是在循环完一轮循环体的代码后，再来检查循环的条件是否满足，如果满足则继续下一轮循环，不满足结束循环。while先判断，do-while先进循环一次。
### 语法：
```c
do
{
    循环语句
}while(循环语句);

/*
 附赠一个小礼物 随机数的写法
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int main()
{
    srand(time(0));
    int a = rand()%100+1;    //这个用来产生1到100的随机数（对100取余得到两位数，再+1就是1到100）
    printf("%d\n", a);

    return 0;
}
*/
```

## for语句
### 语法
for (初始条件; 循环继续的条件; 循环每轮要做的动作){
    循环体里的内容
}
里面的条件可以省，但分号不省
```c
// 写一个阶乘的例子
    int n;
    scanf("%d", &n);
    int fact = 1;

    int i = 1;
    for ( i=1; i<=n; i++){
        fact *= i;
    }

    printf("%d!=%d\n", n, fact);
```