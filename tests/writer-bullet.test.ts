import { expect,it } from 'vitest';
import { markdownBullet } from '../src/scripts/writer/bullet';

it.each([
  ['甲\r\n乙\r\n丙',0,7,'- 甲\r\n- 乙\r\n- 丙',0,13],
  ['甲\n乙',0,3,'- 甲\n- 乙',0,7],
  ['- 甲\r\n- 乙',0,8,'甲\r\n乙',0,4],
  ['- 甲\r\n乙',0,8,'- 甲\r\n- 乙',0,10],
] as const)('逐行加圆点，整段都有时改为取消：%j',(raw,start,end,body,from,to)=>{
  expect(markdownBullet(raw,start,end)).toMatchObject({body,start:from,end:to});
});

it('来回切换可以回到原文，CRLF 不被换成 LF',()=>{
  const raw='甲\r\n乙';
  const added=markdownBullet(raw,0,raw.length);
  expect(added.body).toBe('- 甲\r\n- 乙');
  expect(markdownBullet(added.body,added.start,added.end).body).toBe(raw);
  expect(added.body).not.toMatch(/[^\r]\n/);
});

it('只有光标时只改当前行，光标跟着文字走',()=>{
  expect(markdownBullet('甲乙\r\n丙丁',1,1)).toMatchObject({body:'- 甲乙\r\n丙丁',start:3,end:3});
});

it.each([
  ['```c\nint x = 1;\n```\n正文','```c\nint x = 1;\n```\n- 正文'],
  ['    代码行\n正文','    代码行\n- 正文'],
  ['## 标题\n正文','## 标题\n- 正文'],
  ['> 引用\n正文','> 引用\n- 正文'],
  ['| a | b |\n正文','| a | b |\n- 正文'],
  ['甲\r\n\r\n乙','- 甲\r\n\r\n- 乙'],
  ['`a` 行','- `a` 行'],
] as const)('空行、代码、标题、引用与表格不动：%j',(raw,body)=>{
  expect(markdownBullet(raw,0,raw.length).body).toBe(body);
});

it.each(['```c\nint x = 1;\n```','\r\n\r\n','## 标题'] as const)('没有可加圆点的行时拒绝改动：%j',(raw)=>{
  expect(()=>markdownBullet(raw,0,raw.length)).toThrow('圆点未改动');
});

it('空正文里点圆点直接给出一个空圆点',()=>{
  expect(markdownBullet('',0,0)).toMatchObject({body:'- ',start:2,end:2});
});