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

ROOT = pathlib.Path(r'D:\router\blog')
SHADERS = ROOT / 'src/scripts/fin-shaders.ts'
SCENE = ROOT / 'src/scripts/fin-scene.ts'
CTRL = ROOT / 'src/scripts/fin-infinity.ts'
COMP = ROOT / 'src/components/FinInfinity.astro'
CFG = ROOT / 'astro.config.mjs'
TOKENS = ROOT / 'src/styles/tokens.css'

BAK = {p: p.read_text(encoding='utf-8') for p in (SHADERS, SCENE, CTRL, COMP, CFG, TOKENS)}


def restore():
    for p, t in BAK.items():
        p.write_text(t, encoding='utf-8')


# 每处变异留下的痕迹。还原后必须一个都不剩，否则说明 BAK 本身就脏。
DIRTY = {
    SHADERS: ['uDepth * s);  // MUT', 'vec3(0.935, 0.895, 0.830) * (1.0 - uDenied)'],
    SCENE: ['twist: 0.9,', 'denied += (deniedTarget - denied) * 0.1;'],
    CTRL: ['/* MUT */ void 0;', "/* MUT */ canvas.addEventListener('__never__'", '// MUT'],
    COMP: ['/* MUT display:none */'],
    CFG: ['find: "__TMP__",'],
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