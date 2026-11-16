---
title: C语言入门
date: 2026-10-29
updated: 2026-11-16
summary: 了解c语言，也同样是一篇笔记
tags: [个人, 备忘]
draft: false
cover: ./cover.webp
coverAlt: 木桌上的程序流程图笔记、铅笔与机械键盘
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



4.当输入中有字符或字符串时，**不要用空格来隔开**，尽量用逗号，因为空格会被当成字符赋进变量里



5.char a;是单个字符
   char str[];是字符串(%s)，或者用循环和getchar也可以实现输入字符串



6.b = %8.3f;共8位数，小数点后三位，前五位，右对齐
   - b = %-8.3f;左对齐
   - %2d  从头开始取两位，eg:输入2000，输出20



7.一个回归年：365.2422天



8.floor向下取整；ceil向上取整；trunc取整（去小数）



9.1 byte = 8 bit
   - 一个int四个字节；float四字节；double八字节；char一字节



10.%hd短整型，%hu无符号短整型，%p是地址



11.char str[] = "ab\0cd";
    printf("%d\n", sizeof(str));   //输出结果是6，sizeof会把这个变量在**内存中占的总字节数**计算出来，这串str有四个字母和中间一个\0转义字符和字符串末尾自带的\0，所以是6
   printf("%d\n", strlen(str));   //结果就是2，strlen是计算字符串的**有效长度**，遇到第一个\0就停了

   **sizeof 是静态运算符**，它的结果在编译时就决定了，sizeof括号里面的运算不会做。如a = 6;sizeof(a + 1.0)结果是8，因为结果是浮点型，但是printf("%d",a)结果还是6。sizeof只看括号内结果的类型，不运算。



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



16.我们知道x \*= a+b;是x = x\*(a+b),但是在define函数中**x \*= a+b;是x = x\*a +b;**



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
   - Windows系统下先按 Ctrl + Z，然后再按回车，输入结束
   - Linux / Mac (包括WSL)：在行首（或者随便输入后）按 Ctrl + D 结束



21.判断是否是字母的三大金刚
   要加一个头文件#include <ctype.h>
   - isalpha(c):判断c是不是英文字母
   - islower(c):判断c是不是小写字母
   - isupper(c):判断c是不是大写字母
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





22.有趣的响铃：

```c
    char c = '\7';   // 这里是八进制数，但转换成10进制还是7；在ASCII码表中，十进制数7对应的字符是BEL（响铃）
    printf("%c", c);   // 运行到这个语句就会响一次铃，电脑主板会“滴”一声
```

## swich-case语句
- swich-case语句用来替代需要多个if来判断输入的值的情况
- 遇到匹配的情况一直往下执行，直到遇到break才退出
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

## 函数
### 基本语法
```c
#include <stdio.h>

// 定义函数：接收两个 int，返回一个 int
int getMax(int x, int y) 
{
    if (x > y) {
        return x; // 遇到 return，函数立刻结束，并把 x 交出去
    } else {
        return y;
    }
}

int main() 
{
    int a = 10, b = 20;
    
    // 调用函数，并把返回的结果存到 max 变量里
    int max = getMax(a, b); 
    
    printf("最大值是: %d\n", max); // 输出 20
    return 0;
}
```
如果无返回值则
```c
void printLine()     // 无返回值，无参数
{
    printf("------------------\n");
}
// 但如果函数声明在开头没有参数，但后续调用函数时传入参数，编译器会默认是int
// 所以如果写函数声明没有参数就写void f(void),否则就把参数写全，如void f(int , int ) 这种无参数名称的只能在声明里写

void printNarcissistic(int n) 
{
    // 无返回值，有参数
}
```
也可直接在开头加个声明，函数体在下面写
```c
#include <stdio.h>

int add(int a, int b); // 👈 这叫函数声明（只写头，加个分号，告诉编译器有这个函数）

int main() {
    printf("%d\n", add(2, 3));
    return 0;
}

// 👇 真正的函数定义在下面
int add(int a, int b) {
    return a + b;
}
```

### 值传递
比如你想写一个交换数字的函数
```c
void swap(int x, int y) { // 这里的 x 和 y 只是接收到复印件
    int t = x;
    x = y;
    y = t;
    // 此时，x和y交换值。
}
```
但是，当你调用 swap(a, b); 时，C 语言是怎么做的呢？它不会把真正的 a 和 b 直接递过去。
它做的是：复制。当 swap 函数执行完，复印件 x 和 y 被销毁了。而 main 函数里真正的原件 a 和 b，根本不知道复印件上发生了什么

那怎样才能直接修改原件呢？告诉它原件存放的地址。在 C 语言里，这就叫传递指针（指针传递）。
我们需要把 a 和 b 的内存地址传给函数。函数拿到地址后，顺藤摸瓜找到原件的内存，把里面的东西换掉。
```c
#include <stdio.h>

// 参数变成了 int *x，表示接收的是“地址”
void swap(int *x, int *y) {
    int t = *x; // *x 的意思是：顺着地址 x，找到里面的值（即 a 的值 10）
    *x = *y;    // 把地址 y 里面的值，放到地址 x 里面
    *y = t;     // 把 t 的值，放到地址 y 里面
}

int main() {
    int a = 10;
    int b = 20;
    
    printf("交换前: a=%d, b=%d\n", a, b);
    
    // 注意：调用的时候，要加上 & 符号，把 a 和 b 的地址传进去
    swap(&a, &b); 
    
    printf("交换后: a=%d, b=%d\n", a, b); // 此时就真的交换了！
    
    return 0;
}
```
### 这又可以引入一个定义——本地变量
就像上面所示，x和y只是swap函数里的本地变量，离开这个块就不存在了
在平常使用的if等等语句中也是如此
```c
    if (a > b)
    {
        int i = 0;
    }
    printf("%d", i);  // 这里会报错，因为i只是if里面的本地变量

    {
        int j = 1;    // 出了这个大括号再调用j也会报错，大括号没有依附任何语句在c语言中是可以的，
    }
```

### 函数里面的逗号运算
如f((a,b))就是在调用函数中进行逗号运算，只传入了b一个值

### 注意
c语言中，函数里不允许嵌套另一个函数，但可以在函数中放另一个函数的声明

## 数组
### 定义一个数组
<类型> 变量名称[元素数量];  // 其中元素数量必须是编译时刻确定的字面量，必须是整数
    - 如int grades[100];  double weight[20];
以下演示数组的基本用法
```c
#include <stdio.h>

int main()
{
    const int NUMBER = 10; // 定义常量 NUMBER，表示统计的数字范围是 0~9
    int x;
    int count[NUMBER]; // 这里的 NUMBER 会被直接替换成 10
    int i;

    // 1. 初始化数组：把每个桶里的数都清零
    for ( i=0; i<NUMBER; i++ ) {
        count[i] = 0;
    }

    // 2. 读取数据并统计
    scanf("%d", &x);
    while ( x != -1 ) {
        if ( x>=0 && x<=9 ) {
            count[x]++; // 核心逻辑：输入的数字是几，对应的数组下标就加1
        }
        scanf("%d", &x); // 继续读下一个数
    }

    // 3. 遍历输出结果
    for ( i=0; i<NUMBER; i++ ) {
        printf("%d:%d\n", i, count[i]);
    }

    return 0;
}
```

### 数组的集成初始化
```c
    int a[] = {2,3,7,5,9,1,14,};  // 这种方法编译器默认[]中的数是后面的个数
    // 末尾加逗号不影响程序运行，加逗号可以方便后面加数，也可以用来装一装（七 八十年代的计算机书都习惯加逗号）
    int a[10] = {2};这种情况就是只有第一个是2，后面9个全是0
    int count[10] = {0};   // 把所有元素都赋成0
    int a[10] = {
        [0] = 2, [2] = 3,6,   // 只有c99可以这么写，意思是第一个是2，第三个是3，第四个是6，其他全是0
    };
```

- **不可以**int a[] = {....}; int b[] = a; 不能这样让数组的内容赋给数组
- 但是for (i = 0; i < length; i++){ b[i] = a[i]; }是可以的

### 数组的大小
- sizeof给出整个数组所占内容的大小，单位是字节
- sizeof(a[0])给出数组中单个元素的大小，于是相除就得到了数组的单元个数
```c
    for( i = 0; i < sizeof(a)/sizeof(a[0]); i++)   // 这样就保证不会超出数组的范围
```

### 自定义search函数
```c
#include <stdio.h>

// 自定义 search 函数
// 参数1：要查找的数组
// 参数2：数组的长度（重点！后面会解释为什么必须传）
// 参数3：要寻找的目标数字
// 返回值：如果找到，返回该数字在数组中的下标；如果没找到，返回 -1
int search(int arr[], int size, int target) {
    for (int i = 0; i < size; i++) {
        if (arr[i] == target) {
            return i; // 找到了，立刻返回当前下标
        }
    }
    return -1; // 循环结束都没找到，返回 -1
}

int main() {
    int numbers[] = {10, 20, 30, 40, 50};
    int target = 30;
    
    // 调用函数：传入数组、数组大小、目标值
    int index = search(numbers, 5, target);
    
    if (index != -1) {
        printf("找到了！%d 在下标 %d 处。\n", target, index);
    } else {
        printf("没找到 %d。\n", target);
    }
    return 0;
}
```
因为数组arr在传入search函数时传入的实际上是\*arr （传入arr[10]是一样的，只传入首地址）,是首地址，所以需要再传一个长度

### 利用数组重写素数的程序
利用数组，判断是否是素数的效率会高很多，下面既看数组的用法也看思路
```c
#include <stdio.h>

int main()
{
    const int maxNumber = 25;
    int isPrime[maxNumber];
    int i, x;

    // 1. 初始化：假设 0 到 24 所有的数都是素数（标记为 1）
    for (i = 0; i < maxNumber; i++)
    {
        isPrime[i] = 1;
    }

    // 2. 核心筛法：从 2 开始，把它的倍数全部标记为非素数（标记为 0）
    for (x = 2; x < maxNumber; x++)
    {
        if (isPrime[x])  // 如果 x 没有被前面的数筛掉（依然是 1）
        {
            for (i = 2; i * x < maxNumber; i++)
            {
                isPrime[i * x] = 0; // 把 x 的倍数（i*x）全部标记为 0
            }
        }
    }

    // 3. 输出：遍历数组，只要值还是 1 的，就是素数
    for (i = 2; i < maxNumber; i++)
    {
        if(isPrime[i])
        {
            printf("%d\t", i);
        }
    }
    printf("\n");

    return 0;
}
```

## 二维数组
### 初识二维数组
二维数组的遍历因为是二维所以需要两层循环，我们更喜欢把第一层看为行（横着的），第二层看为列（竖着的）
```c
    for ( i = 0; i <= 3; i++)
    {
        for ( j = 0; j <= 5; j++)
            {
                a[i][j] = i * j;
            }
    }
```

### 二维数组的初始化
二维数组的初始化时，行数可由编译器来数，但列数必须给出，省略表示补0
每行一个{},用逗号分隔（和前面一样，最后的逗号可以存在）。
```c
    int a[][5] = {
        {0,1,2,3,4},
        {2,3,4,5,6},
    };
```

### 二维数组实例
用二维数组判断井字棋胜负
```c
#include <stdio.h>

int main()
{
    const int size = 3;
    int board[size][size];
    int i, j;
    int num0fX, num0fO;
    int result = -1;    // -1 means no winner, 0 means X wins, 1 means O wins

    // 读入棋盘数据
    for ( i = 0; i < size; i++)
    {
        for ( j = 0; j < size; j++)
        {
            scanf("%d", &board[i][j]);   // 记得要加 & 符号
        }
    }

    // 检查行和列
    for ( i = 0; i < size; i++)
    {
        int row_num0fO = 0, row_num0fX = 0;
        int col_num0fO = 0, col_num0fX = 0;
        for ( j = 0; j < size; j++)
        {
            // 检查第 i 行
            if (board[i][j] == 1)
            {
                row_num0fX++;
            }
            else
            {
                row_num0fO++;
            }

            // 检查第 i 列
            if (board[j][i] == 1)
            {
                col_num0fX++;
            }
            else
            {
                col_num0fO++;
            }
        }

        // 内层循环结束后，判断第 i 行和第 i 列是否有赢家
        if (row_num0fX == size || col_num0fX == size)
        {
            result = 1; // X wins
            break;
        }
        if (row_num0fO == size || col_num0fO == size)
        {
            result = 0; // O wins
            break;
        }
    }

    // 检查主对角线
    if (result == -1)
    {
        num0fX = 0;
        num0fO = 0;
        for ( i = 0; i < size; i++)
        {
            if (board[i][i] == 1)
            {
                num0fX++;
            }
            else
            {
                num0fO++;
            }
        }
        if (num0fX == size || num0fO == size)
        {
            result = (num0fX == size) ? 1 : 0;
        }
    }

    // 检查副对角线
    if (result == -1)
    {
        num0fX = 0;
        num0fO = 0;
        for ( i = 0; i < size; i++)
        {
            if (board[i][size - 1 - i] == 1)
            {
                num0fX++;
            }
            else
            {
                num0fO++;
            }
        }
        if (num0fX == size || num0fO == size)
        {
            result = (num0fX == size) ? 1 : 0;
        }
    }

    // 输出结果
    if (result == 1)
    {
        printf("X wins\n");
    }
    else if (result == 0)
    {
        printf("O wins\n");
    }
    else
    {
        printf("No winner\n");
    }

    return 0;
}
```
## 指针
### 指针定义
**指针就是保存地址的变量**，如int \*p = &i;就是把i的地址赋给了p，可以说p指向i
另外一种定义方法是int\* p;这里还是p是指针而不是有int\*这么一个类型；所以int\* p,q;中的**q 还是一个普通的整形**

### 函数中的指针
我想要在调用函数时得到外面的值就可以使用指针
```c
    void f(int *p);
    // 在被调用时得到了某个变量的地址
    int i = 0; f(&i);   // 会把i的地址传给p这个指针
    // 在这个函数里面可以通过这个指针访问外面的这个i
    // p存的是地址，占8个字节，所以不能用%d输出，会直接截断，要用%p
```
来一个小例子
```c
#include <stdio.h>

void f(int *p);

int main()
{
    int i = 6;
    printf("&i = %p\n", &i);
    f(&i);
    printf("函数改完i的值为：%d\n", i);  //因为f函数里面让*p = 10;所以i就直接被顺着地址顺藤摸瓜的改变了值

    return 0;
}

void f(int *p)
{
    printf(" p = %p\n", p);  // 变量p存的是i的地址，而%p则是专门打印指针的格式符，输出十六进制内存地址，如果想看没有0x的输出长什么样，可以用printf("%lx\n",(unsigned long)p);把p强制转换成lx格式输出，但不建议这么做
    printf("*p = %d\n", *p);  // 加上星号*p的本质就是解引用，拿着p存的地址去找这个地址的值，而这个值是int,所以用%d

    *p = 10;  // 直接找到i的地址，让那里存着的值改为10
}
```
所以scanf函数里面有&的原因，就是要把值传到所在的地址，如果没有&，他就回去找6这个地址并存进去（假设i = 6;），所以编译不一定会报错，但是运行一定会出错
另外一个例子可以去看函数里面的值传递那节的swap函数

在函数中的另外一个应用：如果函数返回的是运算状态，那么运算的结果就可以用指针返回
```c
#include <stdio.h>

int divide(int a, int b, int *result);  // 这里的result就是要返回的值

int main()
{
    int a = 4;
    int b = 2;
    int c;
    if ( divide(a,b,&c) )
    {
        printf("%d / %d = %d\n", a, b, c);
    }
    
    return 0;
}

int divide(int a, int b, int *result)   // 这个函数用来返回状态，给if语句判断除法有没有意义；并计算出结果
{
    int ret = 1;   // 这里的ret是要返回的运算状态
    if ( b == 0) ret = 0;
    else
    {
        *result = a/b;
    }
    return ret;   // 函数只返回状态，而运算的值用地址来改
}
```

### 注意
任何一个地址变量在没有得到实际变量的地址之前，**不能通过\*去访问任何数据**
```c
    int *p;    // 此时没有给p赋任何地址，没有赋值默认是一串随机的值，所以此时这个指针指向一个随机的地址
    *p = 0;   // 这时就相当于往那个随机的地址进行赋值，如果碰巧碰到了不能进行修改的地址那么程序就有可能报错崩溃
```

### 指针和数组
如果我们在main函数里面定义一个数组a[]，并输出sizeof(a),结果就是正常的数组里面所有元素的大小
但是如果另外定义一个函数，传入int a[]，再输出sizeof(a)就只有8（32位架构下是4），这是因为**传入的实际上是这个数组的地址**，所以在传入时写int \*a也是可以的，在函数里也可以正常对数组进行修改（如a[0] = 10;）

以下写法都是等价的
```c
int sum(int *ar, int n);
int sum(int *, int);
int sum(int ar[], int n);
int sum(int [], int);
```

数组变量本身表达地址，所以：
  1.int a[10]; int \*p = a;  // 无需用&取地址，a == &a[0]

  2.但是数组的单元表达的是变量，需要用&取地址

  3.下面的操作也是可以实现的
```c
    int a = 0;
    int *p = &a;
    printf("*p = %d\n", *p);
    // []运算符可以对数组做，也可以对指针做：p[0] <==> num[0]  (这里的num是数组)
    printf("p[0] = %d\n", p[0]);   // 这样也可以正常输出，相当于把a看成一个数组，p[0]就是看成a的地址的第一个单元
    // 实际上编译器在底层会把它翻译成*(p+0),所以完全等价于*p 
    // 但是如果往后写，写成p[1]，编译器就会把它翻译成*(P+1)，假设a的内存地址是0x1000,那么*(P+1)就意味着让指针往后移动一个int的大小，所以指向了0x1004;*(P+1)就会在这里面取数据
```

  4.\*运算符也可以对数组做：\*a == a[0]

  5.**数组变量是 const 的指针，不能被赋值**：int a[] <==> int \* const a=...
```text
现在假如我想让一个数组等于另一个数组
int a[] = {1,2,3};
int b[] = a;
这个写法是不允许的，因为a是个固定的“门牌号”（常量指针），b = a;的意思就是把a的门牌号拆了，换成b的门牌号。数据是一块连续的内存实体，不能把整个实体“搬家”

但是普通指针可以，它想指哪指哪
int *p = a;
p = b;  // 完全可以
```
绝大对数的使用情况下，把数组当成指针来理解是完全没有问题的，但是数组是一个实体，真实占用了内存；而指针只是写着地址的小纸条，它只存了一个地址
相当于数组是一个房子，而指针是门牌号

## 指针和const
### 指针是const时
表示一旦得到得到某个变量的地址，不能再指向其他变量(**门牌号定死了，但房子里面的东西可以变**)
```c
    int * const q = &i;  // 注意*在const前
    *q = 26;  // OK
    q++;   // ERROR,因为门牌号定死了。如果q不是const，那么这行就会让q的地址往后移一个单元的步长，如这里是int,所以地址往后移4
```

上面所示的q++在数组里可用来遍历
```c
int a[3] = {10, 20, 30};
int *q = a; // 此时 q 指向 a[0]

printf("%d\n", *q); // 输出 10
q++;                // 指针往后挪 4 个字节，指向 a[1]
printf("%d\n", *q); // 输出 20
q++;                // 指向 a[2]
printf("%d\n", *q); // 输出 30
```

### 所指是const时
表示不能通过这个指针去修改那个变量（相当于一张只读房卡，这张卡可以换房间（因为p存地址，而p没有被锁），锁住的只是修改房间里的东西的权力）
```c
const int *p = &i;  // 注意*在const后
*p = 26;//ERROR!(*p)是const
i = 26;//OK
p = &j;//OK
```
const int \*p = &i;和int const \*p = &i;意思一样，都是所指的东西不能被修改（\*都在const的后面）

判断到底是**地址**不能变 还是**内容**不能变就看\*到底在const前还是后
const int \* const p;就是两者都不能变（见下文const数组）

## 转换
总是可以把一个非const的值转换成const的
```c
void f(const int *x);  // 相当于一种guarantee，保证不会修改x的值
int a = 15;
f(&a); // ok

const int b = a;
f(&b); // OK
```
上面适用于 当要传递的参数类型比地址大的时候，这是常用的手段：既能用比较少的字节数传递值给参数，又能避免函数对外面的变量的修改

### const数组
const int a[] = {1,2,3,4,5,6,};  // 可以看为const int \* const a
- 数组变量已经是const的指针了，这里的const表明数组的每个单元都是const int
- 所以必须通过初始化进行赋值

### 保护数组值
- 因为把数组传入函数时传递的是地址，所以那个函数内部可以修改数组的值
- 为了保护数组不被函数破坏，可以设置参数为const

  int sum(const int a[],int length);