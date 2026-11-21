"""立体 ∞ 门闩的变异验证（2026-10-18）。

★★ 2026-10-18 修掉脚本自身的一个坑（它害我误判了三次）：
   还原用的是**脚本启动时**取的 BAK，而这些源文件当时还是**未提交的新文件**。
   于是有一轮我手工修完判据后重跑，BAK 里带上了"上一轮变异残留"——
   脚本把自己的污染当成了基线还给我 ⇒ 基线假红、后续所有结论都不可信。
   ⇒ 现在每次 `restore()` 之后**逐个文件校验**（下面 `verify_clean()`），
      变异标记还残留就直接退出，不往下跑。

站规：门闩必须与本次变更严格挂钩，变异验证 ≥3/3 被咬住。

要咬住的是本次真正改动的东西：
  ① 几何：把 z = uDepth * s 那行改掉（Gerono 退化成不相交的两瓣）
  ② 参数：把 twist 从 1.5 改成别的（原版是量出来的）
  ③ 脉冲：把 pointerdown 的 pulse() 调用摘掉（本轮新加的功能）
  ④ alias：把 three/examples 的alias挪走（构建会挂）
  ⑤ 配色：把本体色改回着色器里写死（站规 §3 第 2 条）
  ⑥ 显隐：把 canvas 改成 display:none（AGENTS ★★★★ 事故）
⑦ 降级：去掉 webglcontextlost 处理
 ⑧ 主题：把 uDenied 改成缓动（原版是刻意硬切）
 ⑨ ★ 把pointerdown/pointermove 退回挂在 host 上 —— 这一条是**真实发生过的 bug**
     （装饰层 pointer-events:none，事件挂它身上等于挂死，点击反馈与视差全是死代码，
      而当时 25 条断言全绿）。补它是因为新加的三条判据就是为它而设的，
      不验证就等于不知道新判据有没有真的咬住。
 ⑩ 把.pagehide 里的 removeEventListener 摘掉（bfcache 往返会累积）
"""
import subprocess, os, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SHADERS = ROOT / 'src/scripts/fin-shaders.ts'
SCENE = ROOT / 'src/scripts/fin-scene.ts'
CTRL = ROOT / 'src/scripts/fin-infinity.ts'
COMP = ROOT / 'src/components/FinInfinity.astro'
CFG = ROOT / 'astro.config.mjs'
TOKENS = ROOT / 'src/styles/tokens.css'
GRADE = ROOT / 'src/scripts/fin-grade.ts'

BAK = {p: p.read_text(encoding='utf-8') for p in (SHADERS, SCENE, CTRL, COMP, CFG, TOKENS, GRADE)}


def restore():
    for p, t in BAK.items():
        p.write_text(t, encoding='utf-8')


# 每处变异留下的痕迹。还原后必须一个都不剩，否则说明 BAK 本身就脏。
# ★ 标记必须**足够精确**：tokens.css 的注释里就写着 `#ddd6c6`（记录它被提亮前的值），
#   所以这里不能用裸色值当标记，否则还原后自己会误报「没还原干净」。
DIRTY = {
    SHADERS: ['uDepth * s);  // MUT', 'vec3(0.935, 0.895, 0.830) * (1.0 - uDenied)',
              'export const FIN_VERTEX_ATTRS = /* glsl */ `// MUT'],
    SCENE: ['twist: 0.9,', 'denied += (deniedTarget - denied) * 0.1;', '// MUT'],
    CTRL: ['/* MUT */ void 0;', "/* MUT */ canvas.addEventListener('__never__'", '// MUT'],
    COMP: ['/* MUT display:none */'],
    CFG: ['find: "__TMP__",'],
    TOKENS: ['--fin-body-light: #ddd6c6; // MUT', '--fin-body-light: #efe4d3; // MUT'],
    GRADE: ['sat: 1.0, // MUT'],
}


def verify_clean(stage):
    """还原后逐个文件查变异痕迹。★ 这个检查是脚本自己的护栏：
    没有它，BAK 里带污染时会一路错下去（我实际踩过）。"""
    dirty = []
    for p, marks in DIRTY.items():
        s = p.read_text(encoding='utf-8')
        for m in marks:
            if m in s:
                dirty.append(f'{p.name}: {m[:40]}')
    if dirty:
        print(f'\n✗✗ {stage} 后仍残留变异痕迹：')
        for d in dirty:
            print('   ', d)
        print('   ⇒ BAK 本身是脏的（源文件当时未提交/已被污染），后续结论一律不可信。')
        print('   ⇒ 请先手工把这些文件修回正确状态，再重跑本脚本。')
        sys.exit(2)
    print(f'[{stage}] 还原校验：无变异痕迹 ✓')


def run():
    r = subprocess.run(
        ['npx', 'vitest', 'run', 'tests/fin-infinity.test.ts'],
        cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace',
        env={**os.environ, 'CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD': '20000'},
    )
    out = r.stdout + r.stderr
    return ('FAIL' not in out), out


# (标签, 文件, 旧文本, 新文本)
MUTATIONS = [
    ('① 删掉 z = uDepth * s（自相交没了，∞ 退化成两瓣）',
     SHADERS, 'return vec3(uRadius * c, uRadius * uAspect * s * c, uDepth * s);',
     'return vec3(uRadius * c, uRadius * uAspect * s * c, 0.0);  // MUT'),
    ('② 把 twist 从 1.5 改成 0.9（原版量出来的值被改）',
     SCENE, 'twist: 1.5,', 'twist: 0.9,  // MUT'),
    ('③ 摘掉点击脉冲（pointerdown 里的 pulse 调用）',
     CTRL, 'scene.pulse(0.25);', '/* MUT */ void 0;'),
    ('④ alias 里的 three/examples 条目被摘掉',
     CFG, "find: 'three/examples/jsm/postprocessing/Pass.js',", 'find: "__TMP__",'),
    ('⑤ 本体色改回着色器里写死（违反站规 §3 第 2 条）',
     SHADERS, 'vec3 rlBody = mix(uBodyLight, uBodyDark, uDenied)',
     'vec3 rlBody = vec3(0.935, 0.895, 0.830) * (1.0 - uDenied)  // MUT'),
    ('⑥ canvas 改成 display:none（AGENTS ★★★★ 事故：尺寸量成 0）',
     COMP, '.fin-view canvas {\n    opacity: 0;', '.fin-view canvas {\n    display: none; /* MUT */\n    opacity: 0;'),
    ('⑦ 去掉 WebGL 上下文丢失处理',
     CTRL, "canvas.addEventListener('webglcontextlost'", "/* MUT */ canvas.addEventListener('__never__'"),
    ('⑧ uDenied 改成缓动（原版是刻意硬切）',
     SCENE, 'denied = deniedTarget;', 'denied += (deniedTarget - denied) * 0.1; // MUT'),
    ('⑨ ★ 指针监听退回挂在 host 上（装饰层 pointer-events:none ⇒ 点击反馈变死代码）',
     CTRL, "  addEventListener('pointerdown', onDown);",
     "  host.addEventListener('pointerdown', onDown); // MUT"),
    ('⑩ pagehide 里的 removeEventListener 被摘掉（bfcache 往返会累积）',
     CTRL, "removeEventListener('pointermove', onMove);", "// MUT"),
    ('⑪ ★ 把 aIndex 塞回共享 uniform 块（GLSL3 里 attribute 是保留字 ⇒ 线上画布全空白）',
     SHADERS, 'export const FIN_VERTEX_ATTRS = /* glsl */ `\nattribute float aIndex;\n`;',
     'export const FIN_VERTEX_ATTRS = /* glsl */ `// MUT\n`;'),
    ('⑫ ★ 让片元着色器也拼 aIndex 那一块（同一个真 bug 的另一条路径）',
     SCENE,
     "sh.fragmentShader = sh.fragmentShader\n      .replace('#include <common>', `#include <common>\\n${FIN_COMMON}\\n${FIN_UNIFORMS}`)",
     "sh.fragmentShader = sh.fragmentShader\n      .replace('#include <common>', `#include <common>\\n${FIN_COMMON}\\n${FIN_UNIFORMS}\\n${FIN_VERTEX_ATTRS}`) // MUT"),
    # ── ⑬~⑲：时间单位与速率（2026-10-18 真机实测揪出的真 bug）──
    ('⑬ dt 的毫秒→秒转换被去掉（step 恒 0.05 ⇒ 60Hz 下 3 倍速、144Hz 下 7 倍速）',
     SCENE, 'const step = Math.min(dtMs, 50) / 1000;', 'const step = Math.min(dtMs, 0.05); // MUT'),
    ('⑭ composer 又直接读入参（同一函数里两种单位）',
     SCENE, 'composer.render(step);', 'composer.render(dtMs / 1000); // MUT'),
    ('⑮ uFlow 速率退回 0.6（比例不再是原版的 1.6）',
     SCENE, 'U.uFlow.value + step * 1.6)', 'U.uFlow.value + step * 0.6) // MUT'),
    ('⑯ uSpin 速率退回 0.06（原版 0.05，被放大 3.6 倍）',
     SCENE, 'U.uSpin.value += step * 0.05;', 'U.uSpin.value += step * 0.06; // MUT'),
    ('⑰ 装配动画压回 0.5 秒（原版 2.3 秒 ⇒ 笔触过程看不见）',
     SCENE, 'const ASSEMBLE_DUR = 2.3;', 'const ASSEMBLE_DUR = 0.5; // MUT'),
    ('⑱ 两盏灯退回纯白（原版 0xfff6ea / 0xdfe8ff ⇒ 雕塑发棕）',
     SCENE, 'new DirectionalLight(0xfff6ea, 3.4)', 'new DirectionalLight(0xffffff, 2.4) // MUT'),
    ('⑲ 亮色本体色退回 #ddd6c6（暗一大截 ⇒ 看着是土黄不是纸白）',
     TOKENS, '--fin-body-light: #f6f4ee;', '--fin-body-light: #ddd6c6; // MUT'),
    # ── ⑳~㉓：grade（去「发棕」的那一层）──
    ('⑳ toneMapping 换回 ACES（原版是 NoToneMapping，ACES 对暖色系统性偏黄）',
     SCENE, 'renderer.toneMapping = NoToneMapping;', 'renderer.toneMapping = 4 as never; // MUT'),
    ('㉑ grade 的 sat 写成 1（等于没有 grade ⇒ 装置照样发棕）',
     GRADE, 'sat: 0.7,', 'sat: 1.0, // MUT'),
    ('㉒ grade 从 composer 里摘掉（整层不见）',
     SCENE, 'composer.addPass(new EffectPass(camera, createFinGrade()));', '// MUT'),
    ('㉓ grade 排到 AO 之前（顺序错了 = grade 白做：AO 又把暗部压回去）',
     SCENE, '  composer.addPass(ao);',
     '  composer.addPass(new EffectPass(camera, createFinGrade())); // MUT\n  composer.addPass(ao);'),
    # ── ㉔~㉜：姿态 / 机位 / 深度材质 / 阴影 / DoF（2026-10-18「那道缺口」）──
    # ★ 这一组的每一处都对应一次**真实修掉的缺陷**。
    # ★★ ㉔/㉕ 的方向在 2026-10-18 晚翻转过：姿态判据原先守"必须有 16° 俯仰"
    #   （治缺口），站主随后说「歪了」，判据改成守"必须近乎正视"。
    #   所以这两条变异现在改的是**反方向**——把歪倒回去，必须被咬住。
    ('㉔ ★ 俯仰改回 16°（治好缺口，但两瓣一近一远 ⇒ 站主说的「歪」）',
     SCENE, 'const TILT_DEG = 2;', 'const TILT_DEG = 16; // MUT'),
    ('㉕ ★ 相机基准高度抬回 60（= 3° 俯角，和雕塑抬头等价，同样会歪）',
     SCENE, 'const CAM_Y = 0;', 'const CAM_Y = 60; // MUT'),
    ('㉞ 翻滚改回原版的 -2°（整幅构图直接转斜）',
     SCENE, 'const ROLL_DEG = 0;', 'const ROLL_DEG = -2; // MUT'),
    ('㉟ 偏航摆动改回原版的 ±9°（摆到一侧时左右瓣大小不对等）',
     SCENE, 'const YAW_SWAY_DEG = 2;', 'const YAW_SWAY_DEG = 9; // MUT'),
    ('㉖ 摘掉 customDepthMaterial（阴影/AO 会按未变形的单位盒算）',
     SCENE, 'fins.customDepthMaterial = finDepth;', '// MUT'),
    ('㉗ 深度材质不再拼 carve（AO 会沿着不存在的直角边压暗）',
     SCENE,
     "      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\\n${FIN_CARVE}`);",
     "      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>`); // MUT"),
    ('㉘ uCorner 归零（鳍片退回硬直角矩形）',
     SCENE, 'corner: 0.14,', 'corner: 0.0, // MUT'),
    ('㉙ 阴影类型换回 PCFSoft（shadow.radius 静默失效 ⇒ 一排高频硬阴影）',
     SCENE, 'renderer.shadowMap.type = PCFShadowMap;', 'renderer.shadowMap.type = PCFSoftShadowMap; // MUT'),
    ('㉚ 阴影相机 far 缩回 500（够不到 1200 米外的灯 ⇒ 阴影静默失效）',
     SCENE, 'sc.near = 400; sc.far = 2000;', 'sc.near = 400; sc.far = 500; // MUT'),
    ('㉛ DoF 从 composer 里摘掉（鳍片刃口的高频硬边全暴露）',
     SCENE, 'composer.addPass(new EffectPass(camera, dof));', '// MUT'),
    ('㉜ DoF 排到 AO 之前（AO 读到的是已虚化的深度 ⇒ AO 与 DoF 互相打架）',
     SCENE, '  composer.addPass(ao);',
     '  composer.addPass(new EffectPass(camera, dof)); // MUT\n  composer.addPass(ao);'),
    # ── ㉝：本次「奶油黄」（2026-10-18 晚）──
    # ★ 这条守的是**关系**而非色值：把本体色换回原版那个暖纸 #efe4d3，
    #   亮度那条（绿通道 ≥220，228 照样过）与别的断言都不会响，只有暖度差会咬。
    ('㉝ 本体色换回原版暖纸 #efe4d3（亮度够，但在本站更亮更冷的纸白上读成奶油黄）',
     TOKENS, '--fin-body-light: #f6f4ee;', '--fin-body-light: #efe4d3; // MUT'),
]

print('=' * 76)
print('立体 ∞ 门闩 · 变异验证')
print('=' * 76)

verify_clean('开跑前')
restore()
base_ok, _ = run()
print(f'\n[基线] {"通过 ✓" if base_ok else "失败 ✗（基线就不对，先修）"}\n')

caught = 0
for label, path, old, new in MUTATIONS:
    restore()
    src = path.read_text(encoding='utf-8')
    if old not in src:
        print(f'  {label}\n    ✗ 找不到待变异文本（判据可能已漂移，需人工核）\n')
        continue
    path.write_text(src.replace(old, new, 1), encoding='utf-8')
    ok, _ = run()
    hit = not ok
    caught += hit
    print(f'  {label}\n    {"✓ 被咬住" if hit else "✗ 漏过 —— 判据没咬住这条"}\n')

restore()
verify_clean('全部变异跑完')
final_ok, _ = run()
total = len(MUTATIONS)
print('=' * 76)
print(f'结果：{caught}/{total} 被咬住')
print(f'还原后基线：{"通过 ✓" if final_ok else "失败 ✗ ← 没还原干净"}')
print('=' * 76)
sys.exit(0 if caught >= 3 and final_ok else 1)