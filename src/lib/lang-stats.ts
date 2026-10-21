/**
 * 首页与关于页语言占比的共同数据来源（构建期读取，不进入客户端脚本）。
 *
 * ── 为什么是构建期算，而不是写死数字 ──────────────────────────────
 * 原型里那段占比条的值是手抄的（而且当时抄的是另一套旧数据，站主当场纠正过：
 * 「那个图片里的是旧的还没更新，你根据现在的数据做」）。
 * 写死数字的结局一定是过期 —— 加了两个页面、删了几百行 CSS 之后，
 * 首页上挂着的还是半年前的比例，而且**没人会发现**。
 * 所以这里在构建时真去扫一遍磁盘：数字永远等于仓库此刻的真实构成。
 *
 * ── 统计口径（写死在注释里，改之前先读）─────────────────────────
 *   ① 只统计代码与内容：.astro / .ts / .css / .md / .js / .mjs / .json / .py / .sql；
 *      图片、字体、GLB、webp 一概不计 —— 语言占比统计的是"写了多少代码"，不是"站有多大"。
 *   ② 扫描范围：src / content / functions / scripts / tests / migrations。
 *      不含 dist（构建产物，是本站代码的**副本**，计进去等于双倍）、
 *      不含 node_modules（依赖，不是本站代码）。
 *   ③ ★ 排除 src/vendor（three.js 与 GLTFLoader）：那是第三方库的 vendored 副本，
 *      它一个人就占 800 KB 量级，计进来会让 JavaScript 一项虚高到失真，
 *      这个占比条也就不再反映"这个站用什么写成"。
 *   ④ 占比按字节，不是行数；这是本站上述目录的统计，不等同于 GitHub Linguist 的全仓库规则。
 *
 * ── 为什么用 node:fs 而不是导入 Astro 的什么东西 ────────────────
 * 它只在页面的 frontmatter（构建期）里运行，产物里只有几个数字，
 * 不进任何客户端 JS ⇒ 不占首页 7168 B 的内联预算。
 */

import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/** 扩展名 → 展示用的语言名（未列出的扩展名一律不计） */
const EXT_LANG: Record<string, string> = {
  '.astro': 'Astro',
  '.ts': 'TypeScript',
  '.css': 'CSS',
  '.md': 'Markdown',
  '.js': 'JavaScript',
  '.mjs': 'JavaScript',
  '.json': 'JSON',
  '.py': 'Python',
  '.sql': 'SQL',
};

/** 扫描的根目录（相对项目根）。dist 与 node_modules 都不在其中。 */
export const LANGUAGE_STATS_DIRS = ['src', 'content', 'functions', 'scripts', 'tests', 'migrations'] as const;

/** 这些目录整棵跳过：产物、依赖、缓存、探针脚本的临时文件 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.astro',
  '.git',
  '_probe',
  '.workbuddy',
  '__pycache__',
  '_generated', // 构建生成的留言目标清单不属于源码，避免冷构建与重建读数不同。
  'vendor', // ← 口径③：第三方 vendored 副本不计
]);

export type LangSlice = {
  name: string;
  bytes: number;
  /** 占比（百分数，保留一位小数） */
  pct: number;
};

/** 递归收集：把一个目录下的所有文件相对路径摊平 */
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // 目录不存在（比如还没建 functions/）⇒ 跳过，不是错误
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('_tmp')) continue;
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) out.push(full);
  }
  return out;
}

/**
 * 实测本仓库的语言构成，按字节降序返回。
 * 拿不到任何字节时返回空数组 —— 调用方（首页）据此整块不渲染，
 * 而不是显示一条全是 0 的假条。
 */
export function readLanguageStats(): LangSlice[] {
  const files = LANGUAGE_STATS_DIRS.flatMap((d) => walk(join(process.cwd(), d)));
  const acc = new Map<string, number>();

  for (const f of files) {
    const lang = EXT_LANG[extname(f).toLowerCase()];
    if (!lang) continue;
    let size: number;
    try {
      size = statSync(f).size;
    } catch {
      continue;
    }
    acc.set(lang, (acc.get(lang) ?? 0) + size);
  }

  const total = [...acc.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];

  return [...acc.entries()]
    .map(([name, bytes]) => ({ name, bytes, pct: (bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes)
    .map((s) => ({ ...s, pct: Math.round(s.pct * 10) / 10 }));
}
