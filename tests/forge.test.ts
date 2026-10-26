import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { z } from 'astro/zod';
import { projectSchema } from '../src/lib/project-schema';

describe('公开项目的内容约束', () => {
  const schema = projectSchema(() => z.string().min(1));
  const project = {title:'小机器人',summary:'第一次装配记录',tagline:'从一个轮子开始',category:'硬件',status:'制作中',order:3,tags:['手作'],images:[{src:'./cover.jpg',alt:'机器人正面'}]};
  it('普通照片直接使用统一模板，也支持独立的暗色封面', () => {
    const result = schema.parse({...project,images:[{...project.images[0],darkSrc:'./cover-dark.jpg'}]});
    expect(result.visual).toBe('image');
    expect(result.effect).toBe('auto');
    expect(result.images[0].darkSrc).toBe('./cover-dark.jpg');
    expect(schema.safeParse({...project,images:[]}).success).toBe(false);
    expect(schema.safeParse({...project,images:[{src:'./cover.jpg',alt:'  '}]}).success).toBe(false);
  });
  it('允许正常站内与 HTTPS 链接，拒绝伪装路径和可执行协议', () => {
    for (const href of ['/posts/robot/','https://example.com/robot?q=1']) expect(schema.safeParse({...project,links:[{label:'查看',href}]}).success,href).toBe(true);
    for (const href of ['javascript:alert(1)','//example.com','/\\example.com','/\n/example.com','https://','https://user:secret@example.com']) expect(schema.safeParse({...project,links:[{label:'查看',href}]}).success,href).toBe(false);
  });
});

describe('造物台的铁链保持伸出视口', () => {
  it('独立计算边缘锚点，不把屏幕端点跟无限环一起缩小', async () => {
    expect(existsSync('src/lib/forge-geometry.ts'), '缺少固定到视口边缘的铁链几何').toBe(true);
    const { extendChainToEdges } = await import('../src/lib/forge-geometry');
    for (const ratio of [320 / 740, 390 / 844, 1440 / 900, 2560 / 1280, 3440 / 1440]) {
      const halfWidth = Math.max(8.15, 8.7 * ratio) / 2;
      for (const scale of [1, .9, .78]) {
        const middle = [[-3.1 * scale, 1.2 * scale, .2], [-2 * scale, 0, .9], [2 * scale, 0, -.8], [3.1 * scale, -1.2 * scale, .2]];
        const result = extendChainToEdges(middle, halfWidth);
        expect(result[0][0]).toBeLessThan(-halfWidth - .1);
        expect(result.at(-1)![0]).toBeGreaterThan(halfWidth + .1);
        expect(result.slice(1, -1)).toEqual(middle);
        expect(result.flat().every(Number.isFinite)).toBe(true);
      }
    }
  });
  it('相邻锚点接近竖直时仍不会得到无穷坐标', async () => {
    expect(existsSync('src/lib/forge-geometry.ts')).toBe(true);
    const { extendChainToEdges } = await import('../src/lib/forge-geometry');
    const result = extendChainToEdges([[-2, 1, 0], [-2, 0, 0], [2, 0, 0], [2, 1, 0]], 8);
    expect(result.flat().every(Number.isFinite)).toBe(true);
    expect(result[0][0]).toBeLessThan(-8);
    expect(result.at(-1)![0]).toBeGreaterThan(8);
  });
});

describe('项目图片使用可选择、可复用的动效', () => {
  it('有六种不同模板，自动选择稳定，单图不会冒充叠片', async () => {
    expect(existsSync('src/lib/project-effects.ts'), '项目动效尚未实现').toBe(true);
    const { PROJECT_EFFECTS, chooseProjectEffect } = await import('../src/lib/project-effects');
    expect(PROJECT_EFFECTS).toEqual(['lift', 'tilt', 'stack', 'zoom', 'scan', 'develop']);
    for (const effect of PROJECT_EFFECTS) expect(chooseProjectEffect('robot', effect, 3)).toBe(effect);
    expect(chooseProjectEffect('robot', 'stack', 1)).toBe('lift');
    const names = ['robot', 'wooden-box', 'sensor', 'desk-lamp', 'clock', 'camera'];
    const result = names.map(id => chooseProjectEffect(id, 'auto', 3));
    expect(new Set(result).size).toBeGreaterThan(2);
    expect(names.map(id => chooseProjectEffect(id, 'auto', 3))).toEqual(result);
  });
});
