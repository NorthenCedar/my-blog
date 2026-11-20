---
title: C语言入门
date: 2026-10-29
updated: 2026-11-20
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

- a\[0\]是一个数组，数组的地址是常量地址 ，不可被修改，所以a\[0\] = "xxx"是不允许的："xxx"是一串字符串，它在内存的只读区，它的首地址本质上是一个指针

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

### 指针和const

**1.指针是const时**

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

**2.所指是const时**

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

### const的转换

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

  int sum(const int a[],int length);### 指针运算

- 我们之前提过，如果一个指向数组的指针+1或-1是加减一个单元的字节数（int加减4，char加减1...）

&#32;&#32;&#32;&#32;int ac\[\] = {1,2,3,};   char \*p = ac;  printf("p+1 =  %p\\n", p+1);实际上地址加了四，往后挪了一个单元

&#32;&#32;&#32;&#32;这个可以用来遍历数组，看“指针是const时”里面的例子

- 如果int ac\[\] = {1,2,3,4,5,6,};  那么int \*p = ac;  int \*p1 = &ac\[5\];  p1-p等于多少呢，结果是5，它不看地址差了多少数字，看的是差了几个单元

### \*p++

1.++的优先级高于\*

2.取出p所指的那个数据来，完事后顺便把p移到下一个位置去

3.常用于数组类的连续空间操作

```c
    int *p = ac;
    while (*p != -1){
        printf("%d\n", *p++);
    }
```

4.在某些CPU上，这可以直接翻译成一条汇编指令，跑的很快

### 指针比较

\<, \<=, ==, >, >=, !=都可以对指针做，就是比较地址的大小

### 0地址

- 你的内存中有0地址，但是0地址通常是个不能随便碰的地址

- 所以你的指针不应该具有0值

- 因此可以用0地址来表示特殊的事情：

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;返回的指针是无效的

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;指针没有被真正初始化（先初始化为0)&#32;

- NULL是一个预定定义的符号，表示0地址（建议用NULL）

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;有的编译器不愿意你用0来表示0地址

### 指针的类型转换

- void\*表示不知道指向什么东西的指针

- 计算时与char\*相同(但不相通)&#32;

- 指针也可以转换类型

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;int\*p=&i;void\*q= (void\*)p;&#32;

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;这并没有改变p所指的变量的类型，而是让后人用不同的眼光通过p看它所指的变量

- 我不再当你是int啦，我认为你就是个void!&#32;## 动态内存分配

### 动态内存分配

c99之后可以用变量做数组定义的大小，那c99之前呢？用的就是动态内存分配

需要用到malloc这个函数，我们来看看怎么写

注意malloc函数返回的是void\*

```c
#include <stdio.h>
#include <stdlib.h>   // malloc函数需要用到这个标准库

int main()
{
    int number;
    int *a = 0;   // c99之前我们把这个指针当成数组来用，为什么赋0后面会讲
    int i;
    printf("输入数量：");
    scanf("%d", &number);
    // int a[number];   c99之后这么做就行了
    
    a = (int*)malloc(number*sizeof(int));   // malloc要的不是有多少单元，要的是有多少空间，多少字节
    // 因为malloc函数返回的是void*，所以要进行类型转换
    
    for (i = 0; i < number; i++)
    {
        scanf("%d", &a[i]);      // 把指针当成数组来用
    }
    
    // 如果想要逆序输出
    for ( i = number-1; i >= 0; i-- )
    {
        printf("%d ", a[i]);     // 进行数组的操作都是可以的
    }
    free(a);    // 释放malloc要来的空间

    return 0;
}
```

如果没空间了，malloc会返回0，或者叫做NULL

那我们怎样看你的系统能给你多大的空间呢？我们来写个程序看看

```c
#include <stdio.h>
#include <stdlib.h>

int main()
{
    void *ptrs[1000]; // 假设最多测 1000 次
    int cnt = 0;
    while ( cnt < 1000 && (ptrs[cnt] = malloc(100*1024*1024)) != NULL ) {
        cnt++;
    }
    printf("分配了 %d 次\n", cnt);   // 每次100MB
    // 释放内存
    for(int i=0; i<cnt; i++) free(ptrs[i]);

    return 0;
}
```

运行后可能会发现——为什么分配的内存大于我的物理内存

这是因为现代操作系统（尤其是Linux/WSL）底层运用的一个“骗术”：**虚拟内存与延迟分配**

当你调用 malloc(100\*1024\*1024) 时，操作系统其实并没有立刻去物理内存条给你割一块真实的空间，而是在虚拟地址空间记上了“这个程序申请了100MB的空间”，只要虚拟地址空间没记满（64位系统的虚拟地址空间极大，足够记几千 TB），他就会立刻返回一个非空的地址，而且你并没有写入任何数据

但是虚拟地址空间在“记账”的时候，庞大的“账本”也会占用物理内存，所以你会看到物理内存的占用也会涨

### free()

- 要把申请来的空间还给系统，申请过的空间，最终都要还

- 只能还申请来的空间的首地址，如果在还之前进行了p++;再free(p);是不行的

- free(NULL);相当于free(0); 不会去释放0这个地址，相当于不执行，就不会报错

  所以这就是上面的程序**指针初始值赋为0**的原因，如果没有malloc或者malloc出错了，free不会出问题 （int \*p = 0;  void \*q = 0;）

  所以要**养成定义一个指针变量就赋给他一个0**

### 常见问题

- 申请了没free -->长时间运行内存逐渐下降

- free过了再去free，一样会崩溃

- 地址变了，直接去free （p++; free(p);）

- 找不到合适的时机去free，这要去多读别人的代码，积累经验

## 字符串

字符数组：char word\[\] = {'H', 'e', 'l', 'l', 'o', '!'};

字符串：char word\[\] = {'H', 'e', 'l', 'l', 'o', '!', '\\0'};

### 字符串的定义和特点

- 以0（整数0）结尾的一串字符

  &#32;&#32;&#32;&#32;0或'\\0'是一样的，但是和'0'不同。但0是int，4字节；'\\0'是ASCII码里的0，只有1字节

- 0标志字符串的结束，但不是字符串的一部分

  &#32;&#32;&#32;&#32;计算字符串长度时不包含这个0

- 字符串以数组的形式存在，以数组或指针的形式存在

  &#32;&#32;&#32;&#32;更多是以指针的形式

  &#32;&#32;&#32;&#32;可以通过数组的方式遍历字符串

- string.h里有很多处理字符串的函数

- 不能用运算符对字符串做运算

### 字符串变量

- char \*str = "Hello";

- char word\[\] = "Hello";

- char line\[10\] = "Hello";

### 字符串常量

像"Hello"这样被双引号括起来的就是字符串常量；"Hello"会被编译器变成一个字符数组放在某处，这个数组长度为6，结尾还有个结束的0

字符串特殊在于可以通过字符串字面量(如"Hello")来初始化**字符数组**

两个相邻的字符串常量会被自动连接起来

```c
    printf("这是第一行，"
        "这是第二行");       // 由于两个字符串中间没有任何东西，所以会被连接起来变成一个字符串，输出就只有一行。

    printf("这是第一行\
这是第二行")               // 这样也是可以的，第一行后面的\就表示这个字符串还没有结束，如果第二行前面有空格/Tab，也会被当成字符串的一部分
```

char \*s = "Hello,world!";

- s是一个指针，初始化为指向一个字符串**常量**

  &#32;&#32;&#32;&#32;由于这个常量所在的地方，所以实际上s是const char \*s，但由于历史的原因，编译器接受不带const的写法  (看printf("s = %p\\n", s);会看到s的地址比其他变量小很多)

  &#32;&#32;&#32;&#32;如果试图对s所指的字符串做写入会导致严重的后果

- 如果需要修改字符串，应该用数组：char s\[\] = "Hello,world!";

- 如果两个字符串内容相同，那么两个字符串会指向同一个地址

  &#32;&#32;&#32;&#32;char \*s = "Hello", \*t;   t = s; 没有给t一个新的内容，而是让t指向s所指的地址



要构造字符串用数组，要处理字符串用指针

注意：char\*不一定是字符串，他有可能是单个字符' '，可能末尾没有\\0

### 字符串的输入输出

字符串的输入没有&，因为字符串就是数组

char word\[8\];  scanf("%s", word);



如果输入超过定义时的单元数，那么就会把结尾的0顶掉

限制读入长度的写法就是在s前面加限制的长度，但是多出来的字符都在输入缓冲区里面，下一个scanf会从输入缓冲区中输入

scanf("%7s", word);    // 最多读7个字符

### 空字符串

- char buffer\[100\] = "";

  &#32;&#32;&#32;&#32;这是一个空字符串，buffer\[0\] == '\\0'

- char buffer\[\] = "";

  &#32;&#32;&#32;&#32;这个数组的长度只有1！只有buffer\[0\] == '\\0'

### 字符串数组

1.char \*\*a

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;a是一个指针，指向另一个指针，那个指针指向一个字符（串）

2.char a\[5\]\[10\]

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;意思是a是一个数组，a里面的每个单元是一个char \[10\]（数组）

相当于有一块黑板，黑板上面的每一行是一个单元，每一行可写10个字符，有5行

```c
#include <stdio.h>

int main() {
    // 初始化 3 个字符串，每个字符串最长 9 个字符（留一个给 '\0'）
    char a[3][10] = {
        "Apple",
        "Banana",
        "Cherry"
    };

    // 修改内容：完全合法！
    a[0][0] = 'a'; // Apple 变成了 apple

    // ❌ 重新指向不行！！！
    // 不可以a[0] = "xxx"
    
    printf("%s\n", a[1]); // 输出 Banana
    return 0;
}
```

3.char \*a\[\]

&#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;意思是每一个单元是一个char\*（指针），每一个单元指向另一个地方

```c
#include <stdio.h>

int main() {
    // 初始化：这里 a 数组里存的是三个字符串的首地址
    char *a[3] = {
        "Apple",
        "Banana",
        "Cherry"
    };

    // 修改指针指向：合法！让它指向别的地方
    a[0] = "New Apple"; 

    // ❌ 致命错误！不能修改内容！
    // a[0][0] = 'a';  // 崩溃！因为 "Apple" 存在只读区

    printf("%s\n", a[1]); // 输出 Banana
    return 0;
}
```

如果你的 a 是指针数组：char \*a\[3\] = {"Apple", ...};

你执行 a\[0\]\[0\] = 'x'; 会直接导致程序崩溃（段错误）。

因为 "Apple" 存在只读内存区，你往只读区里写 x，操作系统会直接把你干掉。



- 说句题外话，我认为比较容易搞混的点

  如果 a 是一维数组（比如 char a\[10\]），a\[0\] 就是格子（值），而不是地址（a 才是地址，&a\[0\] 才是地址。）

  那为什么在二维数组 char a\[3\]\[10\] 里，a\[0\] 变成了地址，而 a\[0\]\[0\] 才是格子呢？因为 a\[0\] 不再是一个元素，而是数组名，所以它在绝大多数情况下，就退化成了地址（代表这个长度为 10 的子数组的首地址）。

  a\[0\]\[0\] 就等于 “在这个一维数组里，提取第 0 个元素”。所以变为了值

| 表达式 | 类型 | 本质是什么 | `a[0]="xxx"` 或 `a[0][0]="xxx"` 为什么错？ |
| :--- | :--- | :--- | :--- |
| `a` | `char (*)[10]` | 整个大黑板的首地址 | 数组名，地址锁死，不可重新赋值。 |
| `a[0]` | `char *` (退化为指针) | 第一行的首地址（地皮） | 类型匹配，但数组名不可修改（你不能换掉第一行）。只能用 `strcpy` 往里抄内容。 |
| `a[0][0]` | `char` | 第一行第一列的单个格子 | 类型不匹配！ 试图把 8 字节的指针 `"xxx"`，硬塞进 1 字节的 `char` 里。 |

指针数组的例子

```c
#include <stdio.h>

int main() {
    printf("请输入月份：");
    int month;
    scanf("%d", &month);

    // 定义一个指针数组，里面存了 12 个字符串的地址
    // 加上 const 是好习惯，因为这些字符串是只读的
    const char *months[] = {
        "January", "February", "March", "April", 
        "May", "June", "July", "August", 
        "September", "October", "November", "December"
    };

    // 安全检查：确保输入在 1-12 之间
    if (month >= 1 && month <= 12) {
        // 数组下标从 0 开始，所以 1 月对应下标 0
        printf("%s\n", months[month - 1]);
    } else {
        printf("输入错误！请输入 1-12 之间的整数。\n");
    }

    return 0;
}
```

## 程序参数（命令行参数）-拓展

### 核心作用

让程序在启动时直接接收外部数据，无需等程序运行后再用 scanf 输入。常用于终端命令（如 ls -l）或自动化脚本

### 标准格式

```c
int main(int argc, char const *argv[])
```

### 参数拆解

- argc (Argument Count)：参数的总个数（整数）

- argv (Argument Vector)：指针数组，存储每个参数的具体内容（字符串）

### 运行机制（终端实例）

假设编译出的程序名为 hello，在终端输入：

./hello apple 100

系统会将其解析为：

- argc = 3 （共 3 个部分）

- argv\[0\] = "./hello" （永远是程序名本身）

- argv\[1\] = "apple" （第一个真实参数）

- argv\[2\] = "100" （第二个真实参数）

- &#32;argv\[3\] = NULL （数组最后一位固定为空指针，作为结束标志）

### 避坑点

1\. 全是字符串：argv 里存的全是字符串！哪怕输入的是数字 100，取出来也是字符串 "100"。若要计算，必须用 atoi(argv\[2\]) 转换成整数

2\. 起点是 argv\[1\]：程序名占了位置 0，所以遍历真实参数时，循环通常从 i = 1 开始

### 常用代码模板

```c
#include <stdio.h>

int main(int argc, char const *argv[]) {
    // 打印所有参数
    for (int i = 0; i < argc; i++) {
        printf("参数 %d: %s\n", i, argv[i]);
    }
    return 0;
}
```

(注：在命令行输入带空格的参数时，需加双引号，例如 ./a.out "I love C"，系统会将其视作一个整体传给 argv\[1\]。)

## 单字符输入输出

### putchar

- int putchar(int c);

- 向标准输出写一个字符

- 返回写了几个字符，EOF(-1)表示写失败

### getchar

- int getchar(void);

- 从标准输入读入一个字符

- 返回类型是int是为了返回EOF(-1)

  &#32;&#32;&#32;&#32;Windows--->Ctrl-Z   直接在输入流中插入一个特殊控制字符（ASCII码为26），当getchar读到这个字符时，被Windows的c库拦截并翻译成了EOF

  &#32;&#32;&#32;&#32;Linux--->Ctrl-D   本质是刷新缓冲区



可以体验一下，Windows就按CTRL-Z，WSL和Linux按CTRL-D结束并输出End of input reached.

```c
#include <stdio.h>

int main(void) 
{
    int ch;

    while ((ch = getchar()) != EOF) 
    {
        putchar(ch);
    }
    printf("\nEnd of input reached.\n");

    return 0; 
}
```

## 字符串函数

用这些函数都需要这个头文件

#include\<string.h>

### strlen

- 函数申明：size_t strlen(const char \*s);

  &#32;&#32;&#32;&#32;&#32;意思是：返回值类型size_t，专门用来表示“大小”或“长度”的无符号整数类型；函数名strlen；参数const char \*s就是字符指针，const保证他只读



我们来写一个自己的strlen函数试试

```c
size_t mylen(const char *s)
{
    int idx = 0;
    while (s[idx] != '\0' ){
    idx++;
    }
    return idx;
}
```

### strcmp

- int strcmp(const char \*s1, const char \*s2);

- 比较两个字符串，返回：

  &#32;&#32;&#32;&#32;0：s1 == s2

  &#32;&#32;&#32;&#32;1：s1 > s2

  &#32;&#32;&#32;&#32;\-1：s1 \< s2

我们直接来写个函数看看这个比大小是怎么比的

```c
int mycmp(const char *s1, const char *s2)
{
    while ( *s1 == *s2 && *s1 != '\0') {
        s1++;
        s2++;
    }
    return *s1 - *s2;
}
```

就是从第一位开始找不一样的，找到第一个不一样的开始比较ASCII码的大小并输出相减的结果

### strcpy

- char \*strcpy(char \*restrict dst, const char \*restrict src);

  &#32;&#32;&#32;&#32;把src的字符串拷贝到dst

  &#32;&#32;&#32;&#32;&#32;&#32;&#32;&#32;restrict表明src和dst不重叠（c99）

- 返回dst，为了能链起代码来

复制一个字符串

```c
char *dst = (char*)malloc(strlen(src)+1);
strcpy(dst,src);
```

把这个函数写一下

```c
char *macpy(char *dst, const char *src)
{
    // int idx = 0;
    // while (src[idx]){
    // dst[idx] = src[idx];
    // idx++;
    // }
    // dst[idx] = '\0';    // 数组的写法
    char *ret = dst;
    while ( *dst++ = *src++ );   // 指针的写法
    *dst = '\0';
    
    return ret;
}
```
### strchr/strrchr

在字符串中找字符

- char \*strchr(const char \*s, int c);   // 从左开始找c第一次出现的位置，返回的是指针

- char \*strrchr(const char \*s, int c);   // 从右开始找c第一次出现的位置

- 返回NULL表示没找到如何找第二个字符呢

```c
    char s[] = "hello";
    char *p = strchr(s, 'l');
    p = strchr(p+1, 'l')     // 从第一个l后面开始找l
    printf("%s\n", p);   // 输出lo
```

把找到的字符后的内容复制给另一个指针

记得加#include \<stdlib.h> #include \<string.h>这两个头文件

```c
    char s[] = "hello";
    char *p = strchr(s, 'l');
    char *t = (char*)malloc(strlen(p)+1);
    strcpy(t, p);
    printf("%s\n", t);
    free(t);
    
```

想要找到字符的前面怎么办

```c
    char s[] = "hello";
    char *p = strchr(s, 'l');
    char c = *p;
    *p = '\0';
    char *t = (char*)malloc(strlen(s)+1);
    strcpy(t, s);
    printf("%s\n", t);
    *p = c;
    free(t);
```

### strstr/strcasestr

- char \*strstr(const char \*s1, const char \*s2);   // 在s1里面找s2，返回值是找到的s2是首地址

- char \*strcasestr(const char \*s1, const char \*s2);  // 不区分大小写

### strcat/snprintf

- char \*strcat(char \*dest, const char \*src);  // 找到dest的\\0,并从\\0的位置把src的字符一个个复制过来（会把dest的\\0覆写掉）

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    char *s1 = "Hello";
    char *s2 = " World, this is dynamic memory!";
    
    // 1. 计算需要的总空间（+1 是给 '\0' 的）
    int total_len = strlen(s1) + strlen(s2) + 1;
    
    // 2. 动态申请空间。注意：malloc 返回的是 void*，通常需要强转为 char*
    char *dest = (char *)malloc(total_len * sizeof(char));
    
    // 3. 安全检查（非常重要！）
    if (dest == NULL) {
        printf("内存分配失败！\n");
        return 1;
    }
    
    // 4. 拼接
    strcpy(dest, s1); // 先把 s1 拷进去
    strcat(dest, s2); // 再把 s2 接上去
    
    printf("拼接结果: %s\n", dest);
    
    // 5. 释放内存（必须做！）
    free(dest);
    return 0;
}
```

- snprint包含在\<stdio.h> 头文件里（和printf是一家） // 如果被截断返回值会告诉原本需要的总长度，没截断就返回实际写入的字符数（拼后全部的实际长度，不包括\\0）

  &#32;&#32;&#32;&#32;int snprintf(char \*str, size_t size, const char \*format, ...);

- 下面有两个示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    char *s1 = "Hello";
    char *s2 = " World, dynamic!";
    
    // 1. 计算需要的精确大小 (+1 是给 '\0' 的)
    int total_size = strlen(s1) + strlen(s2) + 1;
    
    // 2. 动态分配内存
    char *dest = (char *)malloc(total_size * sizeof(char));
    if (dest == NULL) return 1;
    
    // 3. 用 snprintf 进行拼接，第二个参数传入我们计算好的 total_size
    snprintf(dest, total_size, "%s%s", s1, s2);
    
    printf("结果: %s\n", dest);
    
    // 4. 用完记得释放
    free(dest);
    return 0;
}
```

```c
#include <stdio.h>
#include <stdlib.h>

int main() {
    char *s1 = "This is a very long string";
    char *s2 = " that we want to concatenate dynamically.";
    
    // 1. 先申请一个很小的内存（试探）
    int initial_size = 10;
    char *dest = (char *)malloc(initial_size);
    
    // 2. 尝试拼接。因为空间只有 10，它肯定会被截断
    // 但是！ret 会告诉我们：如果空间足够，本应该需要多少个字节
    int ret = snprintf(dest, initial_size, "%s%s", s1, s2);
    
    // 3. 发现空间不够，重新分配！
    if (ret >= initial_size) {
        printf("空间不够！需要 %d 个字节，正在扩容...\n", ret + 1);
        
        // 重新申请一块刚刚好的大内存（ret 是真实长度，+1 给 '\0'）
        dest = (char *)realloc(dest, ret + 1); 
        
        // 4. 再次拼接，这次绝对装得下
        snprintf(dest, ret + 1, "%s%s", s1, s2);
    }
    
    printf("最终结果: %s\n", dest);
    
    free(dest);
    return 0;
}
```
## 枚举

- 枚举是一种用户定义的数据类型，它用关键字enum以如下语法来申明

  &#32;&#32;&#32;&#32;enum 枚举类型的名字 {名字0, ..., 名字n}；

- 枚举类型名字通常不真的使用，要用的是在大括号里面的名字，因为它们就是常量符号，它们的类型是int，值依次从0到n。如：

  &#32;&#32;&#32;&#32;enum colors { red, yellow, green };

- 就创建了三个常量，red的值是0， yellow的值是1， green的值是2

- 当需要一些可以排列起来的常量值时，定义枚举的意义就是给了这些常量值名字

```c
#include <stdio.h>

enum color { red, yellow, green};
 
void f(enum color c); 

int main(void) 
{
    enum color t = red;    // 枚举类型可以跟上enum作为类型
    scanf("d",&t);    // 枚举量可以作为值
    f(t);
 
    return 0; 
} 
void f(enum color c) 
{
    printf("d\n", c);     // 实际是以整数来做内部计算和外部输出输出的
}
```