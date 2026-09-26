/**
 * 素材分析（_tmp 前缀 = 临时证据）：给两张参考图量背景色、形状包围盒、逐行墨量（用来找"图与文字标签之间的空档"）
 * 用法：node _tmp-cursor-source-analyze.mjs
 */
import sharp from 'sharp';

const FILES = {
  normal: '<本机附件目录>\\v1\\objects\\af\\af678f00c646e9f47b0e86f85cc2c0f0aaa8fe2bd2bec0cb0947e8f2dd4ed89a',
  link: '<本机附件目录>\\v1\\objects\\58\\581b249d1ffe76d126f676baa23abab92fdf361b26f6ff48173fbd4bc06fc4e2',
};

for (const [name, path] of Object.entries(FILES)) {
  const img = sharp(path);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const at = (x, y) => {
    const i = (y * W + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // 背景色：四角各取 6×6 的均值
  const patch = (x0, y0) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) { const [pr, pg, pb] = at(x, y); r += pr; g += pg; b += pb; n++; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  };
  const bg = patch(2, 2);
  const corners = [patch(2, 2), patch(W - 8, 2), patch(2, H - 8), patch(W - 8, H - 8)];
  console.log(`\n=== ${name} === ${W}×${H} · ${meta.format} · channels=${meta.channels}`);
  console.log(`  四角背景: ${corners.map((c) => c.join(',')).join(' | ')}`);

  const diff = (x, y) => {
    const [r, g, b] = at(x, y);
    return Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
  };
  // 逐行墨量（差 > 10 的像素数），用来找形状/标签之间的空档
  const rows = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (diff(x, y) > 10) n++;
    rows.push(n);
  }
  const bands = [];
  let start = -1;
  for (let y = 0; y < H; y++) {
    const on = rows[y] > 2;
    if (on && start < 0) start = y;
    if (!on && start >= 0) { bands.push([start, y - 1, Math.max(...rows.slice(start, y))]); start = -1; }
  }
  if (start >= 0) bands.push([start, H - 1, Math.max(...rows.slice(start))]);
  console.log(`  横向墨带（起-止, 峰值）: ${bands.map((b) => `${b[0]}-${b[1]}(峰${b[2]})`).join(' | ')}`);
  // 最大墨带的包围盒
  const big = bands.slice().sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = big[0]; y <= big[1]; y++) for (let x = 0; x < W; x++) if (diff(x, y) > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  console.log(`  形状包围盒: x ${x0}..${x1}（宽 ${x1 - x0 + 1}）· y ${y0}..${y1}（高 ${y1 - y0 + 1}）`);
  // 尖端：最上面一行里墨量>0 的 x 范围
  let tipX = -1;
  for (let x = 0; x < W; x++) if (diff(x, y0) > 10) { tipX = x; break; }
  console.log(`  尖端（最上一行的最左墨像素）: (${tipX}, ${y0}) → 相对包围盒 (${tipX - x0}, 0)`);
  // 内部"洞"检查：包围盒里有多少像素接近背景色（> 10 的算形状，接近背景的算洞）
  let hole = 0, shape = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) (diff(x, y) > 10 ? shape++ : hole++);
  console.log(`  包围盒内: 形状 ${shape} px · 背景（洞/留白） ${hole} px → 洞占比 ${((hole / (shape + hole)) * 100).toFixed(1)}%`);
}
