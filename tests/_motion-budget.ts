import { readFileSync, statSync } from 'node:fs';
import { expect } from 'vitest';
import { jsClosure } from './_writer-output';

export const MOTION_ENGINE_BUDGET = 96 * 1024;

/** 原完整闭包继续受限，另锁首屏静态依赖，不能靠动态 import 漏计。 */
export function expectMotionStartup(page: string, budget: number) {
  const full = jsClosure(page);
  const initial = jsClosure(page, { dynamic: false });
  const engines = full.files.filter(path => /motion-engine\.[^/\\]+\.js$/.test(path));
  expect(engines, '只有一份共享的 GSAP/Flip 引擎').toHaveLength(1);
  expect(initial.files.filter(path => engines.includes(path)), '首屏不得静态加载动效引擎').toEqual([]);
  expect(Buffer.byteLength(initial.code), '首屏静态闭包超出预算').toBeLessThan(budget);
  expect(statSync(engines[0]).size, '按需 GSAP/Flip 引擎超出预算').toBeLessThan(MOTION_ENGINE_BUDGET);
  const html = readFileSync(page,'utf8');
  const preloads = [...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*>/g)].map(m => m[0]).join('');
  expect(preloads, '引擎只能在交互意图后预热').not.toContain(engines[0].split(/[/\\]/).at(-1)!);
}
