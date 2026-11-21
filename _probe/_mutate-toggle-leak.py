"""「主题开关渲染器只关于页到得了」这条断言的变异验证。

站规：门闩必须与本次变更严格挂钩。本轮我改了这条判据（扣掉 three），
所以必须验证**改完之后它仍然咬得住原本要防的那件事** ——
否则就成了「为了变绿而把门闩关了」。

要验的是：把主题开关按钮搬到顶栏（= 全站每一页都挂data-theme-toggle），
或者把 Jelly Slider 渲染器改成静态 import（= 提到首屏），
这条断言必须红。

做法：临时把 ThemeToggle 挂到 Base.astro（全站），重新 build，跑这条断言。
⚠ 必须重新 build —— 这条断言读的是 dist/产物，不是源码。
"""
import pathlib, subprocess, os, shutil, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / 'src/layouts/Base.astro'

base_bak = BASE.read_text(encoding='utf-8')

# 找到 Base.astro 里放主题开关的位置（它本来不该有）
INJECT = '<div data-theme-toggle class="mutant-toggle"></div>'


def build():
    env = {**os.environ, 'CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD': '20000'}
    r = subprocess.run(
        ['npx', 'astro', 'build'],
        cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env,
    )
    return r.returncode == 0, r.stdout + r.stderr


def run_assert():
    env = {**os.environ, 'CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD': '20000'}
    r = subprocess.run(
        ['npx', 'vitest', 'run', 'tests/build-output.test.ts'],
        cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env,
    )
    out = r.stdout + r.stderr
    # 找出「只有关于页到得了」这一组的结果
    m = re.search(r'主题开关只住在关于页.*?\n(.*?)(?=\n\s*(?:Test Files|❯|✓)\s*tests|\Z)', out, re.S)
    tail = out[-1600:]
    failed = 'FAIL' in out and '只有关于页到得了' in out
    passed = 'Tests' in out and re.search(r'Tests\s+.*?(\d+)\s+passed', out)
    return failed, tail


print('=' * 74)
print('门闩变异验证 · 「主题开关渲染器只关于页到得了」')
print('=' * 74)

ok, log = build()
print(f'\n[基线] 构建 {"成功 ✓" if ok else "失败 ✗"}\n')
if not ok:
    print(log[-1500:])
    sys.exit(1)

failed, tail = run_assert()
print(f'[基线] 未变异时{"失败 ✗（基线就不对）" if failed else "通过 ✓"}\n')

# ── 变异：把 data-theme-toggle 挂到全站的 Base.astro ──
print('变异：把 data-theme-toggle 注入 Base.astro（= 全站每一页都挂主题开关）')
BASE.write_text(base_bak.replace('</body>', INJECT + '</body>'), encoding='utf-8')
ok2, log2 = build()
if not ok2:
    print('  构建失败（注入点不对）：', log2[-600:])
    BASE.write_text(base_bak, encoding='utf-8')
    sys.exit(1)
failed2, tail2 = run_assert()
print(f'  ⇒ {"✓ 被咬住" if failed2 else "✗ 漏过 —— 门闩失效了"}\n')
if failed2:
    mm = re.findall(r'AssertionError:.*', tail2)
    for line in mm[:2]:
        print('   ', line[:200])

#还原
BASE.write_text(base_bak, encoding='utf-8')
ok3, _ = build()
failed3, _ = run_assert()
print(f'还原后基线：构建{"成功 ✓" if ok3 else "失败 ✗"} · 断言{"通过 ✓" if not failed3 else "仍失败 ✗"}')

print('=' * 74)
verdict = '通过' if (not failed and failed2 and not failed3 and ok3) else '不通过'
print(f'结果：{verdict}')
print('=' * 74)
sys.exit(0 if verdict == '通过' else 1)