/**
 * 立体 ∞（FinInfinity）的 GLSL 片段 —— 移植自 `tmc5csxr9m-cpu/rhine-lock`
 * 的 `frontend/src/lib/scene/shaders.ts`。
 *
 * ★ 移植口径：**逐字照抄几何与配色**，只把「配色从写死的三档」改成「读本站 token」。
 *   原版的 `uDenied` 是一个 0→1 浮点，亮暗两档在同一个插值里；本站要的是
 *   「亮色 =纸白 + 墨绿，暗色 = 黑 + 橙」，所以这里让 token 决定两端的色值，
 *   `uDenied` 仍然只做插值 —— 换主题仍是原版那种**硬切**（见 fin-infinity.ts）。
 *
 * ★ 为什么用 `MeshStandardMaterial` + `onBeforeCompile` 而不是 `ShaderMaterial`：
 *   原版就是这么做的（`Stage.ts` 的 `finMat.onBeforeCompile`）。走标准材质才能
 *   白拿 three 的光照、阴影、雾、深度预通道；若自己写 `ShaderMaterial`，
 *   AO（n8ao 要读深度）与阴影都要另接，等于把原版最值钱的部分丢掉。
 *
 * ┌ 几何（这一行是整台装置的核心）──────────────────────────────────────┐
 * │  Gerono 双纽线（8 字形）：                                          │
 * │    x = uRadius·cos(t)                                                │
 * │    y = uRadius·uAspect·sin(t)·cos(t)                                │
 * │    z = uDepth·sin(t)     ← z 让两瓣在纵深上错开，所以带子能自相交   │
 * └────────────────────────────────────────────────────────────────────┘
 *   400 片长方体鳍沿这条曲线摆开，每片绕切线扭转 `phi`、再前倾 `lean`。
 */

export const FIN_COMMON = /* glsl */ `
// ── 原版 rl_hash11：确定性哈希（同一 index永远同一个seed）──
float rl_hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}
// ── 罗德里格斯旋转：把 v绕 axis 转 a 弧度 ──
vec3 rl_rotateAxis(vec3 v, vec3 axis, float a) {
    float s = sin(a), c = cos(a);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}
// ── sRGB → linear 的快速近似（比 pow() 便宜，视觉上足够）──
vec3 rl_toLinear(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
`;

export const FIN_UNIFORMS = /* glsl */ `
uniform float uTime, uFlow, uCount, uRadius, uAspect, uDepth, uTwist, uSpin;
uniform float uLean, uThickness, uWidth, uHeight, uAssemble, uDenied;
uniform float uAlign, uDisorder, uDissolve, uVerify;
/* 鳍片的圆角半径（原版 uCorner = 0.14）。本体色/自发光两块都要用到 carve，
   所以它必须在这个**顶点+片元共用**的块里。 */
uniform float uCorner;
/* ★ 亮暗两端的本体色。**由JS 从 CSS token 读出来传进来**，不在着色器里写死 ——
   站规 §3 第 2 条：组件里不许写字面色值。 */
uniform vec3 uBodyLight;
uniform vec3 uBodyDark;
/* 自发光的两端色：亮色版薄荷绿、暗色版橙。同样由 JS 从 token 读进来。 */
uniform vec3 uGlowLight;
uniform vec3 uGlowDark;
/* 16 槽环形缓冲的脉冲（uPulseT = 起始时刻，uPulseO = 起始相位） */
uniform float uPulseT[16];
uniform float uPulseO[16];
varying vec3 vLocal;
varying vec3 vWorldNrm;
varying float vSeed;
varying float vPulse;
varying float vParam;
varying float vTip;
`;

/* ★★ `aIndex` 必须单独一块，不能放在上面那个共享块里（2026-10-18 修的真 bug）。
   这一块 `FIN_UNIFORMS` 是**顶点与片元两个着色器都拼进去**的（fin-scene.ts 的
   onBeforeCompile），而 `attribute` 在 GLSL3（three r150+ 默认 WebGL2）里是**保留字**，
   只在顶点着色器里合法 —— 混进片元着色器会直接：
       ERROR: 'attribute' : Illegal use of reserved word
   ⇒ 整个 program `VALIDATE_STATUS false` ⇒ **画布全空白，一帧都不画**。
   而这一切在无头截图里长得像"装置没生效"，很容易误判成环境问题。

   它只有顶点着色器用（`rl_finTransform` 里 `float idx = aIndex;`），
   片元侧只需要那五个 varying（通过 varying 传过来），所以拆开最干净。 */
export const FIN_VERTEX_ATTRS = /* glsl */ `
attribute float aIndex;
`;

export const FIN_VERTEX = /* glsl */ `
vec3 rl_curve(float t) {
    float s = sin(t), c = cos(t);
    // Gerono figure-eight; the branches separate in depth so the band passes over itself
    return vec3(uRadius * c, uRadius * uAspect * s * c, uDepth * s);
}
float rl_easeOutBack(float x) {
    float c1 = 1.70158, c3 = c1 + 1.0;
    return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0);
}

/* 把一片鳍从「单位盒」搬到 Gerono 曲线上，并算好它的三个轴。 */
void rl_finTransform(in vec3 lp, in vec3 nrm, out vec3 worldPos, out vec3 worldNrm) {
    float idx = aIndex;
    float seed = rl_hash11(idx * 1.618 + 4.7);
    // uFlow 让整条带子沿曲线流动（螺旋刀似的匀速前进）
    float t = 6.2831853 * fract((idx + uFlow) / uCount);

    vec3 p = rl_curve(t);
    // 切线用中心差分（前后各取一点）
    vec3 T = normalize(rl_curve(t + 0.002) - rl_curve(t - 0.002));
    // 构造一个与切线正交的参考系（N0 = 法向，B0 = 副法向）
    vec3 ref = vec3(0.0, 0.0, 1.0);
    vec3 N0 = normalize(ref - dot(ref, T) * T);
    vec3 B0 = cross(T, N0);

    /* ── 脉冲：一道沿曲线跑的光 ──
       原版由键盘触发（敲一下密码就跑一道）。本站改成点击触发（见 fin-infinity.ts），
       着色器部分**逐字照抄**。16 个槽轮转，最老的自然被覆盖。 */
    float pulse = 0.0;
    for (int i = 0; i < 16; ++i) {
        float age = uTime - uPulseT[i];
        if (age >= 0.0 && age < 2.6) {
            float front = fract(uPulseO[i] + age * 0.32);
            float d = abs(fract(t / 6.2831853 - front + 0.5) - 0.5);
            float life = smoothstep(0.0, 0.08, age) * exp(-age * 1.5) * (1.0 - smoothstep(2.0, 2.6, age));
            pulse += exp(-d * d * 900.0) * life;
        }
    }
    pulse = min(pulse, 1.4);

    // 两个不同频率的波叠在一起，让扭转不至于太规律
    float wave = sin(2.0 * t - uTime * 0.55) * 0.55 + sin(5.0 * t + uTime * 0.31) * 0.12;
    float phi = uTwist * t + wave + uSpin + pulse * 1.3;
    phi = mix(phi, 1.5707963, uAlign);
    phi += (seed - 0.5) * uDisorder * 3.0 + sin(uTime * 9.0 + seed * 40.0) * uDisorder * 0.2;

    vec3 W = cos(phi) * N0 + sin(phi) * B0;   // 鳍的宽方向
    vec3 H = cross(T, W);                      // 鳍的高方向
    // 前倾：绕副法向把整条切线转lean 角（lean 本身带一点随时间的呼吸）
    float lean = uLean + sin(t * 3.0 + uTime * 0.4) * 0.12;
    vec3 Tl = cos(lean) * T + sin(lean) * H;
    H = cross(Tl, W);
    T = Tl;

    /* ── 装配动画：像 logo 的笔触一样，从交叉点「画」出来 ──
       0.5-0.5cos(πx) 的余弦缓入，原版 0.5 秒。 */
    float along = fract(t / 6.2831853 - 0.25);
    float window = 0.085;
    float local = clamp((uAssemble * (1.0 + window) - along) / window, 0.0, 1.0);
    float settle = 1.0 - pow(1.0 - local, 3.0);
    float grow = local > 0.0 ? rl_easeOutBack(local) : 0.0;
    float swing = (1.0 - settle) * 1.1;

    W = rl_rotateAxis(W, T, swing);
    H = rl_rotateAxis(H, T, swing);

    /* ── 解锁：卡片从带上剥离、翻滚着飞走并缩小 ──
       本站未用到解锁流程，但参数照抄（uDissolve 恒为 0，这条是死代码，
       留着是为了将来接上时不必回头再移植一次）。 */
    float peel = clamp(uDissolve * 1.6 - along * 0.6 - seed * 0.25, 0.0, 1.0);
    float peelE = peel * peel * (3.0 - 2.0 * peel);
    vec3 axis = normalize(vec3(seed - 0.5, 0.6, 0.3 + seed));
    W = rl_rotateAxis(W, axis, peelE * (2.0 + seed * 4.0));
    H = rl_rotateAxis(H, axis, peelE * (2.0 + seed * 4.0));
    vec3 Tt = cross(W, H);

    // 脉冲时鳍片微微涨大（宽涨 35%、高涨 90%）—— 光扫过去的地方「鼓」一下
    vec3 size = vec3(uThickness, uWidth * (1.0 + pulse * 0.35), uHeight * (1.0 + pulse * 0.9)) * grow;
    size *= 1.0 - peelE * 0.85;

    // 未settle 的鳍朝外飞一点（像笔触甩出去）
    vec3 radial = normalize(vec3(p.x, p.y * 1.4, p.z + 120.0));
    vec3 centre = p + H * (pulse * 7.0 + (1.0 - settle) * 16.0)
                + (radial * 520.0 + vec3(0.0, 0.0, 380.0)) * peelE * (0.6 + seed);

    worldPos = centre + Tt * lp.x * size.x + W * lp.y * size.y + H * lp.z * size.z;
    worldNrm = normalize(Tt * nrm.x + W * nrm.y + H * nrm.z);

    // 笔尖高光：装配扫过的前沿发一道亮边
    float dt = along - uAssemble * (1.0 + window) + window * 0.5;
    vTip = exp(-dt * dt * 2600.0) * (1.0 - smoothstep(0.9, 1.0, uAssemble));
    vLocal = lp;
    vWorldNrm = worldNrm;
    vSeed = seed;
    vPulse = pulse;
    vParam = t / 6.2831853;
}
`;

/* ── 圆角切角（原版 `finCarveGlsl`）────────────────────────────────────
   鳍片的截面不是直角矩形，四角是圆的 —— 靠片元里 discard 掉超出圆角半径的像素。

   ★ 2026-10-18 补搬：本站此前**整块漏了**这一段，于是每片鳍都是硬边直角矩形。
     在正视（无俯仰）下这不显眼，可一旦把带子按原版抬到 16° 俯仰看，
     直角边会在自相交处叠出一排硬切线 —— 那是缺口看起来"像被切开"的帮凶之一。

   ★ 为什么 colour 与 depth **两个材质都要拼**：AO 与阴影是从深度图算的。
     只在颜色侧 discard，深度图里鳍片仍是矩形 ⇒ AO 会沿着不存在的直角边
     压出一圈暗边，阴影也多出一圈。原版两处都拼（Stage.ts:196 / 210），照抄。 */
export const FIN_CARVE = /* glsl */ `
    {
        vec2 rc = max(abs(vLocal.yz) - vec2(0.5 - uCorner), 0.0);
        if (length(rc) > uCorner) discard;
    }
`;

export const FIN_SURFACE = /* glsl */ `
    // 鳍片侧面的倒角：越靠边越圆滑
    vec2 rq = abs(vLocal.yz) * 2.0;
    float rm = max(rq.x, rq.y);
    float onFace = step(0.49, abs(vLocal.x));
    float bevel = smoothstep(0.86, 1.0, rm);
    // 两档均保留常驻细边：亮色淡绿，暗色橙色。
    float rim = onFace * smoothstep(0.90, 0.94, rm) * (1.0 - smoothstep(0.97, 0.995, rm));

    /* ★ 本体色：两端由 JS 从 CSS token 传进来（uBodyLight / uBodyDark）。
       原版这里写死 rlPaper=(0.935,0.895,0.830) 与 rlGraphite=(0.06,0.062,0.068)；
       本站改为亮色 = 纸白+ 墨绿、暗色 = 黑 + 橙，与 §3 的暗色定案一致。
       uDenied 在两个 token 色之间插值 —— 与原版同构。 */
    vec3 rlBody = mix(uBodyLight, uBodyDark, uDenied) * (0.95 + vSeed * 0.07);
    // 纸白上用一层淡绿色边膜承接自发光，让绿色在明亮环境里仍然可见。
    rlBody = mix(rlBody, uGlowLight, rim * (1.0 - uDenied) * 0.45);
    // 亮色脉冲染到整片鳍的表面，随 vPulse 自然退回暖白；暗色仍走原来的橙色细边。
    float pulseTint = clamp(vPulse, 0.0, 1.0) * (1.0 - uDenied) * 0.65;
    rlBody = mix(rlBody, uGlowLight, pulseTint);
`;

export const FIN_EMISSIVE = /* glsl */ `
    {
        /* 辉光两色也走 token（站规 §3 第 2 条）。亮色版用薄荷绿（本站 --logo-glow 的同族），
           暗色版用 rhine-lock 原版的橙 —— 与新的暗色强调色同源。 */
        vec3 glowCool = uGlowLight;
        vec3 glowWarm = uGlowDark;
        vec3 glow = vec3(0.0);
        // 缓慢扫过的扫描带：让静止时也有一点微动
        float scan = smoothstep(0.55, 1.0, sin(vParam * 6.2831853 * 3.0 - uTime * 2.4));
        glow += rim * glowCool * 0.2 * (1.0 - uDenied);
        glow += rim * glowWarm * (0.25 + 1.6 * scan) * uDenied;
        glow += vPulse * rim * mix(glowCool * 0.9, glowWarm * 1.4, uDenied);
        glow += uVerify * rim * glowWarm * 0.8 * step(0.55, fract(vParam * 18.0 - uTime * 1.2));
        glow += vTip * rim * vec3(1.0, 0.92, 0.8) * 1.4;
        totalEmissiveRadiance = glow;
    }
`;
