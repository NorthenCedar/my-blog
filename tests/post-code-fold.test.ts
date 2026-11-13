import { Window } from 'happy-dom';
import { expect, it, vi } from 'vitest';

it('文章长代码默认露出六行，能展开和收回，复制仍包含全部源码', async () => {
  const win = new Window();
  const { document } = win;
  const writeText = vi.fn(async (_text: string) => {});
  const lines = ['第一行', '', '  第三行', '第四行', '第五行', '第六行', '    第七行', '第八行'];
  const block = (body: string[]) => '<pre class="astro-code" data-language="text"><code>'
    + body.map(line => `<span class="line"><span>${line}</span></span>`).join('\n') + '</code></pre>';
  document.body.innerHTML = '<article class="post-body"><div class="prose">'
    + block(lines) + block(lines.slice(0, 6)) + block(lines) + '</div></article>'
    + block(lines);
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', document);
  vi.stubGlobal('navigator', { clipboard: { writeText } });

  try {
    await import('../src/scripts/copy-code');
    const holders = [...document.querySelectorAll('.post-body .code-holder')];
    const [long, short, other] = holders;
    const toggle = long.querySelector('button[aria-expanded]')!;
    const rest = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.code-holder')).toHaveLength(3);
    expect(rest.hidden).toBe(true);
    expect([...long.querySelectorAll('.line')].filter(line => !line.closest('[hidden]'))
      .map(line => line.textContent)).toEqual(lines.slice(0, 6));
    expect(short.querySelector('button[aria-expanded]')).toBeNull();
    expect(other.querySelector('button[aria-expanded]')?.getAttribute('aria-controls')).not.toBe(rest.id);

    long.querySelector<HTMLButtonElement>('.copy-btn')!.click();
    expect(writeText).toHaveBeenCalledWith(lines.join('\n'));
    toggle.click();
    expect(rest.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(long.querySelector('code')?.textContent).toBe(lines.join('\n'));
    expect(other.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(rest.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    const animated = other.querySelector('pre')!;
    const animatedToggle = other.querySelector('button[aria-expanded]')!;
    const animatedRest = document.getElementById(animatedToggle.getAttribute('aria-controls')!)!;
    let inFlightHeight: number | undefined;
    const motions: { onfinish: (() => void) | null; cancel: () => void }[] = [];
    const animate = vi.fn((_frames: { height: string[] }) => {
      const motion = { onfinish: null, cancel: () => { inFlightHeight = undefined; } };
      motions.push(motion);
      return motion;
    });
    Object.defineProperty(animated, 'offsetHeight', { get: () => inFlightHeight ?? (animatedRest.hidden ? 100 : 220) });
    Object.defineProperty(animated, 'animate', { value: animate });

    animatedToggle.click();
    expect(animate.mock.calls[0][0].height).toEqual(['100px', '220px']);
    inFlightHeight = 150;
    animatedToggle.click();
    expect(animate.mock.calls[1][0].height).toEqual(['150px', '100px']);
    expect(animatedRest.hidden).toBe(false);
    expect(animatedRest.inert).toBe(true);
    motions[0].onfinish?.();
    expect(animatedRest.hidden).toBe(false);
    motions[1].onfinish?.();
    expect(animatedRest.hidden).toBe(true);
  } finally {
    await win.happyDOM.close();
    vi.unstubAllGlobals();
  }
});
