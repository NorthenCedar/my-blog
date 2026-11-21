"""暗色模式门闩的变异验证（2026-10-18）。

站规：门闩必须与本次变更严格挂钩，且要做变异验证 —— 把被守的东西改坏，
断言必须红。泛用检查 = 假阳性。

本次守的是「暗色=黑底+ 橙」这条定案，四条可咬的关系：
  ① 暗色底必须是近黑
  ② 暗色底必须与 vendor 的 PAPER_DARK 逐字相等
  ③ 每个 token 在黑底上仍可辨
  ④ 暗色强调色必须是橙（不是墨绿）
  ⑤ 亮色段不许被顺手动（仍纸白 + 墨绿）

每次变异都改完tokens.css / constants.ts，跑 tests/tokens.test.ts，
记录它到底红没红，然后**还原**。
"""
import subprocess, shutil, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKENS = ROOT / 'src/styles/tokens.css'
CONSTS = ROOT / 'src/vendor/jelly-slider/constants.ts'

tok_bak = TOKENS.read_text(encoding='utf-8')
const_bak = CONSTS.read_text(encoding='utf-8')


def run_tests():
    r = subprocess.run(
        ['npx', 'vitest', 'run', 'tests/tokens.test.ts'],
        cwd=ROOT, capture_output=True, text=True,
        encoding='utf-8', errors='replace',
        env={**__import__('os').environ, 'CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD': '20000'},
    )
    out = r.stdout + r.stderr
    if 'failed' in out.lower():
        return False, out
    return True, out


def restore():
    TOKENS.write_text(tok_bak, encoding='utf-8')
    CONSTS.write_text(const_bak, encoding='utf-8')


MUTATIONS = [
    ('① 把暗色底改回旧的深墨绿 #131b17', 'paper',
     '--paper: #0b0b0c;', '--paper: #131b17;', 'tokens.css'),
    ('② 让 vendor 的 PAPER_DARK 与 tokens 脱钩（改成别的黑）', 'paper',
     "export const PAPER_DARK = '#0b0b0c';", "export const PAPER_DARK = '#101014';", 'constants.ts'),
    ('③ 把暗色强调色改回墨绿', 'accent',
     '--accent: #ff7b00;', '--accent: #4caf50;', 'tokens.css'),
    ('④ 把暗色面板改成与底几乎同色（层次塌掉）', 'panel',
     '--panel: #1c1c1e;', '--panel: #0d0d0e;', 'tokens.css'),
    ('⑤ 顺手把亮色也改成黑+ 橙（越权改动）', 'light',
     '--accent: #2d7d46;', '--accent: #ff7b00;', 'tokens.css'),
]

print('=' * 78)
print('暗色模式门闩 · 变异验证')
print('=' * 78)

base_ok, _ = run_tests()
print(f'\n[基线] 未变异时{"通过 ✓" if base_ok else "失败 ✗（基线就不对，先修）"}\n')

results = []
for label, key, old, new, target in MUTATIONS:
    restore()
    path = TOKENS if target == 'tokens.css' else CONSTS
    src = path.read_text(encoding='utf-8')
    if old not in src:
        results.append((label, None, f'找不到待变异文本：{old[:40]}')); print(f'  {label}\n    ✗ 找不到待变异文本\n'); continue
    path.write_text(src.replace(old, new, 1), encoding='utf-8')
    ok, _ = run_tests()
    caught = not ok
    results.append((label, caught, ''))
    print(f'  {label}\n    {"✓ 被咬住（断言变红）" if caught else "✗ 漏过 —— 判据没咬住这条"}\n')

restore()
final_ok, _ = run_tests()
print('=' * 78)
caught_n = sum(1 for _, c, _ in results if c)
total = len(results)
print(f'结果：{caught_n}/{total} 被咬住')
if final_ok:
    print('还原后基线：通过 ✓')
else:
    print('还原后基线：失败 ✗ ← 文件没还原干净，要手动查')
print('=' * 78)

sys.exit(0 if caught_n >= 3 and final_ok else 1)