---
title: 我的C语言学习笔记
date: 2026-10-29
updated: 2026-11-10
summary: 如标题所示，本文主要是用来记笔记的，有兴趣或者也想学习C语言的小伙伴可以看看
tags: [个人, 备忘]
draft: false
---
最基础的输入输出、if语句就不写了，开头主要先记与python不一样的地方

## 学校的知识点:(
1.int x = '\144';是八进制数（\后加上三个不大于7的数）
   int x = '\x64';是十六进制数（\加x再加两个数或A~F）
   也可以x = 0144;   or  x = 0x64;

2.'a'是字符，占一个字节；  "a"是字符串(a\0)占两个字节

3.三目运算符，下面是例子。（?是判断，真就运行冒号前面的。反之就运行后面的）
```c
#include <stdio.h>

int main()
{
    int a, b, c, max;
    scanf("%d %d %d", &a, &b, &c);
    max = a>b ? (a>c ? a:c) : (b>c ? b:c);
    printf("%d\n", max);

    return 0;

}
```

4.当输入中有字符或字符串时，不要用空格来隔开，尽量用逗号，因为空格会被当成字符赋进变量里

5.char a;是单个字符
   char str[];是字符串(%s)，或者用循环和getchar也可以实现输入字符串

6.b = %8.3f;共8位数，小数点后三位，前五位，右对齐
   b = %-8.3f;左对齐
   %2d  从头开始取两位，eg:输入2000，输出20
7.一个回归年：365.2422天

8.floor向下取整；ceil向上取整；trunc取整（去小数）

9.1 byte = 8 bit
   一个int四个字节；float四字节；double八字节；char一字节

10.%hd短整型，%hu无符号短整型

11.char str[] = "ab\0cd";
    printf("%d\n", sizeof(str));   //输出结果是6，sizeof会把这个变量在**内存中占的总字节数**计算出来，这串str有四个字母和中间一个\0转义字符和字符串末尾自带的\0，所以是6
   printf("%d\n", strlen(str));   //结果就是2，strlen是计算字符串的**有效长度**，遇到第一个\0就停了

   sizeof是静态运算符，它的结果在编译时就决定了，sizeof括号里面的运算不会做。如a = 6;sizeof(a + 1.0)结果是8，因为结果是浮点型，但是printf("%d",a)结果还是6。sizeof只看括号内结果的类型，不运算。

12.x = 3 << 1; 这个“<< 1”是让3变为二进制再**往后移**一位：3的二进制是11，往后移一位变为110，所以此时x变成6了
    x = 8 >> 2;同理，8的二进制是1000，**>>是往前移**两位，所以变为10，x = 2;

13.a:97 A:65 0:48

14.||或语句时前面为**真**时后面的语句不执行；&&前面为**假**时后面的语句不执行

15.
```c
    x = 0;
    a = ++x * ++x;
    //结果是4，因为会先把两个++x全都算完之后才进行乘法运算
```

16.我们知道x *= a+b;是x = x*(a+b),但是在define函数中x *= a+b;是x = x*a +b;

17.
```c
    int a=4,b;
    a = (++a, b=a+10);
    //最后a = 15;因为逗号运算是从左往右算，最右边的值赋给a
```

18.
```c
    x = 0;
    printf("x = %d, y = %d\n", ++x, ++x);
    //结果是x = 2, y = 2。因为printf里面是从右往左执行的（老一点的编译器）
    x = 0;
    printf("x = %d, y = %d\n", x++, x++);
    //结果是x = 1, y = 0。先把x的值赋给y =，再++，再给x =，再++
```

19.x = 3&4;这个是按位运算
```text
先把3和4都写成二进制
010
100
然后再上下一位一位对着比，&就是两个都是1才为1，所以3&4结果是000，也就是0
```
   x = 3|4;
```text
一样先写成二进制
010
100
一位一位对着看，|是有1就为1，所以结果是110，也就是7
```

20.c语言中文本输入最标准的写法
```c
    int c; // 必须是 int
    // getchar() 函数的标准返回值是 int（为了能容纳 0~255 的普通字符，以及 -1 这个特殊的 EOF）
    while ( (c = getchar()) != EOF ) { /* ... */ }
```
   Windows系统下先按 Ctrl + Z，然后再按回车，输入结束
   Linux / Mac (包括WSL)：在行首（或者随便输入后）按 Ctrl + D 结束

21.判断是否是字母的三大金刚
   要加一个头文件#include <ctype.h>
   isalpha(c):判断c是不是英文字母
   islower(c):判断c是不是小写字母
   isupper(c):判断c是不是大写字母
```c
#include <stdio.h>
#include <ctype.h> // 必须包含这个头文件

int main() {
    char ch = 'A';
    
    if (isalpha(ch)) {
        printf("%c 是字母\n", ch);
    }
    if (isupper(ch)) {
        printf("%c 是大写字母\n", ch);
    }
    if (!islower(ch)) { // 加个感叹号代表“不是”
        printf("%c 不是小写字母\n", ch);
    }


    // 把字符串全转成大写
    char str[] = "Hello 123!";
    for (int i = 0; str[i] != '\0'; i++) {
        str[i] = toupper(str[i]); 
    }
    printf("%s\n", str); // 输出: HELLO 123!
    
    // 千万不要写 if (isalpha(ch) == 1)。因为在不同的编译器底层，isalpha 判断为真时，可能返回的是 1，也可能是 2、1024 等任意非零数字

    return 0;
}
```



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

### 整数正序循环拆解的例子
常规的 x % 10 只能抠出最后一个数字。
所以这里用了一个非常巧妙的 mask（掩码）：
1. 第一步算 mask：如果输入 123，用 while 循环算出 mask = 100。
2. 第二步除法（求首位）：123 / 100 = 1，打印出了 1。
3. 第三步取余（去首位）：123 % 100 = 23，把第一位砍掉了。
4. 第四步降级：mask / 10 变成 10。
5. 循环往复，直到 mask 变成 0。
```c
#include <stdio.h>

int main()
{
    int x;
    scanf("%d", &x);
    
    int mask = 1;
    int t = x;

    // 计算 mask（找到最高位的权重，比如输入123，mask就是100）
    while ( t > 9 ) {
        t /= 10;
        mask *= 10;
    }

    // 调试打印（为了让你看到 x 和 mask 的值）
    printf("x=%d, mask=%d\n", x, mask);

    // 正序拆分并输出每一位数字
    do {
        int d = x / mask;
        printf("%d", d);
        
        // 如果不是最后一位，打印一个空格
        if ( mask > 9 ) {
            printf(" ");
        }
        
        // 去掉已经输出的最高位
        x %= mask;
        // mask 降级
        mask /= 10;
    } while ( mask > 0 );
    
    printf("\n");
    
    return 0;
}
```

### 求最大公约数
这里利用辗转相除法求出最大公约数
```c
/*如果b等于0，计算结束，a就是最大公约数；
否则，计算a除以b的余数，让a等于b，而b等于那个余数；
回到第一步。

a    b    t
12   18   12
18   12   6
12   6    0
6    0
*/
#include <stdio.h>

int main()
{
    int a, b;
    int t;
    scanf("%d %d", &a, &b);

    while ( b != 0 ) {
        t = a % b;
        a = b;
        b = t;
    }

    printf("gcd=%d\n", a);
    
    return 0;
}
```

### 循环例子
给定一个数（比如输入 2），输出它及后面连续 3 个数（即 2, 3, 4, 5）能组成的所有互不相同的三位数。
```c
#include <stdio.h>

int main()
{
    int a;
    scanf("%d", &a);
    
    int i, j, k;
    int cnt = 0;

    // 用 for 循环直接把初始化、条件、自增写在一行，代码更短
    for (i = a; i <= a + 3; i++) {
        for (j = a; j <= a + 3; j++) {
            for (k = a; k <= a + 3; k++) {
                if (i != j && i != k && j != k) {
                    cnt++;
                    printf("%d%d%d", i, j, k);
                    if (cnt == 6) {
                        printf("\n");
                        cnt = 0;
                    } else {
                        printf(" ");
                    }
                }
            }
        }
    }
    return 0;
}
```

### 水仙花数
```c
#include <stdio.h>

int main()
{
    int n;
    scanf("%d", &n);
    
    int first = 1;
    int i = 1;
    
    // 1. 计算位数对应的起始值（比如 n=3，first 就是 100；n=4，first 就是 1000）
    while ( i < n ) {
        first *= 10;
        i++;
    }
    
    // 2. 遍历所有的 n 位数
    i = first;
    while ( i < first * 10 ) {
        int t = i;
        int sum = 0;
        
        // 3. 拆解 i 的每一位数字
        do {
            int d = t % 10; // 取出最后一位
            t /= 10;        // 去掉最后一位
            
            // 4. 计算这一位数字的 n 次方
            int p = d;
            int j = 1;
            while ( j < n ) {
                p *= d;
                j++;
            }
            
            // 5. 把每一位的 n 次方累加到 sum 里
            sum += p;
            
        } while ( t > 0 );
        
        // 6. 判断累加结果是否等于原数字
        if ( sum == i ) {
            printf("%d\n", i);
        }
        
        i++;
    }
    
    return 0;
}
```