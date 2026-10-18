import { d } from 'typegpu';

// Rendering constants
export const MAX_STEPS = 64;
export const MAX_DIST = 10;
export const SURF_DIST = 0.001;

// Ground material constants
export const GROUND_ALBEDO = d.vec3f(1);

// Lighting constants
export const AMBIENT_COLOR = d.vec3f(0.6);
export const AMBIENT_INTENSITY = 0.6;
export const SPECULAR_POWER = 10;
export const SPECULAR_INTENSITY = 0.6;

// Jelly material constants
export const JELLY_IOR = 1.42;
export const JELLY_SCATTER_STRENGTH = 3;

// Ambient occlusion constants
export const AO_STEPS = 3;
export const AO_RADIUS = 0.1;
export const AO_INTENSITY = 0.5;
export const AO_BIAS = SURF_DIST * 5;

// Line/slider constants
export const LINE_RADIUS = 0.024;
export const LINE_HALF_THICK = 0.17;

// Mouse interaction constants
export const MOUSE_SMOOTHING = 0.08;
/* ★★ 2026-10-17 第四轮（站主：「拉到最右边时不要显示 81%，显示 100%，中间部分的百分数跟着变均匀」）：
 *   这四个数是**指针在画布上的归一化 x** 的有效区间。原版是给整页 demo 配的（槽只占画面宽 35%），
 *   我们把这枚开关的取景改到槽占 ~67% 之后，它们**没跟着改** ⇒ 有效区 [0.40, 0.90]
 *   与槽的实际位置 [0.15, 0.815] **错位**：拖到槽左端被 clamp 到 0.40（算出 0.1，不是 0），
 *   拖到槽右端只算出 0.83 —— 于是中间每一档都不是线性的，看起来"跳"。
 *   ⇒ 按实测的槽像素范围重钉，且 **MIN/MAX 与 RANGE 两端重合**，保证两端精确取到 0 / 1。
 *   ⚠ 数值来源：无头 dpr=1 截图，槽（胶囊）横跨画布 x 的 0.149 ~ 0.815（`_tt-G1.png`）；
 *     比例与 dpr 无关。改取景 / 改画布宽高比都要重新量这四个数。 */
export const MOUSE_MIN_X = 0.15;
export const MOUSE_MAX_X = 0.815;
export const MOUSE_RANGE_MIN = 0.15;
export const MOUSE_RANGE_MAX = 0.815;

/* ★★ 本站改（2026-10-17 第二轮，站主：「不点的时候那个软条不显示」）：
 *  开关仍按原版的**左锚定填充**跑（锚点固定在滑块的起点 -1，端点跟手），
 *  只把行程重新定到槽内：
 *    亮色 0   ⇒ 软条占 [-1.00, 0.00]（左半条，长度 1.0）
 *    深色 1.0 ⇒ 软条占 [-1.00, 1.00]（填满槽；槽右缘 1.02）
 *
 *  为什么不是原版那对端点：原版 [-1.2, 0.5] 的亮色端落在**光线步进包围盒之外**
 *  （当时左边 -1.019）⇒ 整根果冻被裁掉，静止时只剩槽壁里 0.02 的残段 ——
 *  就是站主说的"软条不显示"；而压到 0.2 的果冻链本身也会折成一坨。
 *
 *  ⚠ 为什么不做成「定长手柄左右滑」：试过，深色档会空出槽的左半边，
 *    而原版 shader 的焦散高光（renderBackground 的 highlights）只在 endCap 左侧画
 *    ⇒ 空出来的半条槽会亮成一团惨白。原版的设计前提就是"左端始终有果冻"。
 *
 *  ⚠ 2026-10-17 第四轮（站主：「拉到最右边时不要显示 81%，显示 100%」）：
 *    DARK_END 从 1.0 收到 **0.9** —— 这是**果冻链的物理上限**，不是审美选择。
 *    链的起点 -1 与总长 1.9 决定了 `Slider.setDragX` 的钳位区间是 [-2.9, 0.9]，
 *    所以拖到最右时端点的 x 最多就是 0.9。写 1.0 的后果不是"拉不到底"，
 *    而是**百分比永远显示 90%**（站主看到的 81% 是它再叠上"读倒数第二个点"那一层）。
 *    想改这个数必须先改链长，而改链长会让果冻 SDF 破面（试过，见 scene.ts 的注释）。
 *    百分比仍然 0→100，只是 100% 对应端点 0.9、槽右缘 1.02 前留 0.12 的空段。
 *
 *  LIGHT_END / DARK_END 同时是百分比刻度的 0/100（scene.ts 读同一对常量）。
 */
export const LIGHT_END = 0;
export const DARK_END = 0.9;

/* ★★ 本站改（2026-10-17 第三轮，站主：「按钮周围的那个颜色改为和背景纸白色相同，
 *   按钮内部的颜色也做适配，现在这样很突兀，像是从哪个地方抠图抠出来的」）
 *
 * 病灶：画布画的是一整块**地面**（无限平面 + 槽 + 百分比刻度），原版地面经过光照/AO 后
 * 固定落在浅灰 —— 实测 **190/255**。亮色页的纸是 **250**、深色页的纸是 **19**（#131b17）
 * ⇒ 按钮无论在哪一档都像一块贴上去的方形贴片。
 *
 * 修法：把「地面基准色」做成 uniform（`groundTint.rgb`），地面 = `tint.rgb × 归一化比例`。
 * **比例式**（不是平移式）：平移要额外定一个 contrast，深色档稍大一点就把槽压成一片黑；
 * 比例式让"最亮那片地面"恒等于 1.0 ⇒ 正好落在 tint 上，暗部（槽壁、投影）按比例变暗。
 * ⇒ 实际写法见 `scene.ts` 的 `renderBackground`：`ratio = saturate(raw / GROUND_MEAN)`。
 *
 * ⚠ 只做颜色还不够：这条渲染链**最高只能输出 220/255**（见 `scene.ts` blit 的注释），
 *   纸白是 250 ⇒ 光靠校色永远差 30 级。所以 blit 还要把地面按亮度识别后淡到 79% 不透明度。
 * ⚠ `tint.rgb` 必须与 tokens.css 的 `--paper` 同步（亮 #fafaf7 / 深 #131b17）——
 *   门闩在 tests/theme-toggle.test.ts「画布地面色与页面纸色同源」，改一边不改另一边会红。
 * ⚠ `tint.w` 是**深色程度**（0 = 亮色档，1 = 深色档），同时驱动两件事：
 *   焦散高光增益（深底要更用力才看得见）与百分比刻度的**反相**（亮档深字、暗档浅字）。
 */
/** 地面在**默认光照下**的原始亮度（`rawGround`，不是最终像素）——
 *  用于把「这片地面」按比例归一到当前主题的纸色。实测：画布上方那片亮区 ≈ 143/255。
 *  ⚠ 这个数是**反推**出来的：从目标输出倒推 `raw / MEAN` 该等于几，试过 190 → 162 → 143
 *    （190 偏灰、162 仍偏亮）。改取景 / 改灯光 / 改画幅都会动它；它偏了的表现就是
 *    "按钮整体偏灰或过曝 / 地面在深色档反而比页面亮"。 */
export const GROUND_MEAN = 143 / 255;

/* ★★ 2026-10-17 第五轮（站主：「按钮背景把底纹无限符号挡住了，影子还被截了，
 *   直接把按钮背景改透明，影子直接出现在关于页的背景上」「亮色时左边部分应该是
 *   半透明显示出背景纸白，现在是黑色的」）
 *
 * 这一轮的核心：**地面不再画颜色，只画"影"**，透明靠 alpha 走出画布。
 *
 * ★ 这里**没有**任何 alpha 常量，这是有意的 —— 浓度不是可调旋钮，是算出来的：
 *      alpha = 1 − (地面最终色的亮度 / 纸色亮度)
 *   于是"纸白 = 完全透明（页面与 ∞ 底纹原样透出）"、"越暗越不透明"是同一件事，
 *   不需要上限也不需要分区。曾经验里那一串常量（MAX 0.55 / GAMMA 0.5 / GROOVE 0.30）
 *   全部删掉，原因见 scene.ts `renderBackground` 末尾的注释：
 *     · 分区判据（`y < 0.05` 当槽内）是错的 —— 整块可见地面都在那个碗里，
 *       于是整块画布被刷了一层 30% 纸色膜，在 ∞ 底纹上现出一个矩形；
 *     · 上限 0.55 会让"最深的影子"只剩 45% 纸色，但在纸面上**影子深浅其实由
 *       地面色 `graded` 决定、alpha 管不着**（这层是乘影合成），上限根本没起作用。
 * ⚠ 想调影子深浅只有一条正路：调 `scene.ts` 里 `const gamma = 1.8`（地面比例曲线），
 *   它同时决定槽的明暗与影子的对比；alpha 会自己跟着走。
 */
/** 两档的纸色，**必须与 tokens.css 的 `--paper` 一致**（亮 / 深各一条，有门闩守着）。 */
export const PAPER_LIGHT = '#fafaf7';
/* ★ 2026-10-18 暗色模式改「黑 + 橙」⇒ 深色纸色从 #131b17（深墨绿）换成 #0b0b0c
   （rhine-lock 原版 PAPER_DARK = [0.043,0.043,0.047] 按 sRGB 换算）。
   ⚠ 改这一行必须同步改 tokens.css 的 `html.dark { --paper: … }` ——
     `tests/theme-toggle.test.ts:139` 会断言两者字面量相等，画布与页面脱钩就红。 */
export const PAPER_DARK = '#0b0b0c';

/** #rrggbb → 线性无关的 (r,g,b) 0..1（画布是 rgba8unorm，着色器写出的就是编码后的值）。 */
function fromHex(hex: string, depth: number): d.v4f {
  const n = Number.parseInt(hex.slice(1), 16);
  return d.vec4f(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, depth);
}

export const GROUND_TINT_LIGHT = fromHex(PAPER_LIGHT, 0);
export const GROUND_TINT_DARK = fromHex(PAPER_DARK, 1);
