---
title: 我的Python备忘录
date: 2026-10-25
updated: 2026-10-25
summary: 本人写代码经常会忘，所以新建一篇文章专门用来记录代码，此文会持续更新，日期是第一次发布日期
tags: [个人, 备忘]
draft: false
---
如果忘了想要捡起来，就照着下面自己去编译器里面敲，运行看结果！

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

## 函数
### 函数无返回值时返回的实际上是None,None在if语句中等于False
eg:
```python
def check_age(age):
    if age > 18:
        return "SUCCESS"
    else:
        return None

result = check_age(16)
if not result:
    # 进入if表示result是None值 也就是False 这句相当于if True:
    print("未成年，不可进入")
```

### None也可用于声明无初始内容的变量
eg:
```python
name = None
```

### 函数的说明文档
当程序一旦写长，定义的函数和其中的变量就不知道是什么意思了，这时候就可以以多行注释的形式在函数里面写上说明文档
注意说明应写在函数体前！
eg:
```python
def func(x,y):
    """
    函数说明
    :param x: 形参x的说明
    :param y: 形参y的说明
    :return: 返回值的说明
    """
    函数体
    return 返回值
```

## 列表
### 方法的概念
在进入列表之前要了解方法的概念：在Python中，如果将函数定义为class(类)的成员，那么函数将会称之为：方法
eg:
```python
class Student:

    def add(self,x,y):
        return x + y

# 方法的调用需要先去获得方法所在的class类对象，通过类对象中的.把方法点出来就可以了
student = Student()
num = student.add(1,2)
```

### 列表的常用操作方法
1.index 查询功能
```python
mylist = ["northcedar", "website", "cool"]
# 查找某元素在列表中的下标索引
index = mylist.index("website")
print(f"website在列表中的下标索引值是：{index}")
# 如果查找的元素不存在会报错
index = mylist.index("hello")
print(f"hello在列表中的下标索引值是：{index}")
```

2.修改特定位置的元素值
元素的下标索引从左到右是0,1,2...  从右到左是-1,-2,-3...
eg:
```python
my_list = [1, 2, 3]
my_list[0] = 4
print(my_list)   # 结果：[4, 2, 3],反向下标自己去敲
```

3.插入元素
语法：列表.insert(新元素要插入的下标,元素)
eg:
```python
mylist = ["northcedar", "website", "cool"]
mtlist.insert(1, "python")
print(f"列表插入元素后，结果是：{mylist}")  # 结果是["northcedar", "python", "website", "cool"]
```

4.追加元素
语法1：列表.append(元素)，将指定的元素追加到列表的尾部
eg:
```python
mylist = [1, 2, 3]
mylist.append([4, 5, 6])
print(mylist)  # 结果[1, 2, 3, [4, 5, 6]]
```
语法2：列表.extend(其他数据容器)，将其他数据容器的内容取出，依次追加到列表尾部
```python
mylist = [1, 2, 3]
mylist.extend([4, 5, 6]) #或者mylist.extend(列表名)
print(mylist)  # 结果[1, 2, 3, 4, 5, 6]
```

5.元素的删除
语法1：del 列表[下标]
语法2：列表.pop(下标) #元素从原来列表弹出
eg:
```python
# 方法1：
mylist = [4, 5, 6]
del mylist[2]
print(f"删除后的结果是：{mylist}")    #结果是[4, 6]

# 方法2：
mylist = [4, 5, 6]
element = mylist.pop(2)
print(f"取出元素后的列表内容是：{mylist}，取出的元素是：{element}")   # 结果是[4, 5] ，6
```

删除某元素在列表中的第一个匹配项
语法3：列表.remove(元素)
eg:
```python
mylist = ["I", "I", "I", "love", "you"]
mylist.remove("I")
print(f"移除元素后，列表的结果是：{mylist}")  # 结果是["I", "I", "love", "you"]
```

6.清空列表
语法4：列表.clear()   #结果是[]

7.统计某元素在列表内的数量
语法：列表.count(元素)
eg:
```python
mylist = ["I", "I", "I", "love", "you"]
count = mylist.count("I")
print(f"列表中I的数量为:{count}")   # 结果是3
```

8.统计列表内有多少元素
语法：len(列表)
```python
mylist = ["I", "I", "I", "love", "you"]
count = len(mylist)
print(f"列表的元素数量总共有：{count}个")   # 结果是5
```

9.综合应用的小例子（待办事务表，自己去敲敲）
```python
import json, os
SAVE_FILE = "tasks.json"

def load_tasks():
    if os.path.exists(SAVE_FILE):
        with open(SAVE_FILE,"r",encoding="utf-8")as f:
            return json.load(f)
    return [{"content":"学习python","done":False}]
def save_tasks():
    with open(SAVE_FILE,"w",encoding="utf-8")as f:
        json.dump(tasks,f,ensure_ascii=False,indent=2)
tasks = load_tasks()

while True:
    print("\n=====我的待办事项=====")
    print("1.查看所有任务")
    print("2.添加新任务")
    print("3.标记任务为已完成")
    print("4.删除任务")
    print("5.退出程序")
    print("======================")

    choice = input("请输入你的指令（1~5）：")
    if choice == "1":
        print("\n---当前任务列表---")
        if len(tasks)== 0:
            print("目前还没任务，快去添加吧！")
        
        else:
            for index,task in enumerate(tasks,start=1):
                if task["done"] == True:
                    status = "【✔】"
                else:
                    status = "【 】"
                print(f"{status} {index}.{task['content']}")
    elif choice == "2":
        content = input("请输入任务内容:")
        new_task = {"content":content,"done":False}

        tasks.append(new_task)
        save_tasks()
        print(f"任务【{content}】添加成功!")

    elif choice == "3":
        try:
            task_id = int(input("请输入要标记为已完成的任务ID:"))
        except ValueError:
            print("请输入有效的任务ID")
            continue
        if 1 <= task_id <= len(tasks):
            task = tasks[task_id - 1]
            task["done"] = True
            print(f"任务【{task['content']}】已标记为已完成")
            save_tasks()
        else:
            print("任务ID不存在，请重新输入")
    elif choice == "4":
        try:
            task_id = int(input("请输入要删除的任务ID:"))
        except ValueError:
            print("请输入有效的任务ID")
            continue
        if 1 <= task_id <= len(tasks):
            task = tasks[task_id - 1]
            tasks.pop(task_id - 1)
            print(f"任务【{task['content']}】已删除")
            save_tasks()
        else:
            print("任务ID不存在，请重新输入")

    elif choice == "5":
        print("退出程序")
        break

```

ok,今天终于把列表部分敲完了，睡觉了  10.26晚