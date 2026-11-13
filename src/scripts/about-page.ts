import { onPage } from './page-lifecycle';

// React Bits Spotlight Card 的圆形衰减曲线，配合本站 Astro 生成的社交链接。
// 源码：https://reactbits.dev/r/SpotlightCard-TS-CSS.json
function spotlightFalloff(color: string, softness: number) {
  const core = (1 - softness) ** 1.5 * 0.85;
  const stop = (alpha: number, at: number) =>
    `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(2)}%, transparent) ${(at * 100).toFixed(2)}%`;
  const stops = [stop(1, 0)];
  for (let i = 0; i <= 14; i++) {
    const g = i / 14;
    const smooth = 1 - g * g * (3 - 2 * g);
    const glow = Math.exp(-4.6 * g * g) * (1 - g ** 6);
    stops.push(stop(smooth + (glow - smooth) * softness, core + (1 - core) * g));
  }
  return stops.join(', ');
}

onPage(({
  document, addEventListener, requestAnimationFrame, cancelAnimationFrame,
  setTimeout, clearTimeout, ResizeObserver, IntersectionObserver, matchMedia, keep,
}) => {
  const page = document.querySelector<HTMLElement>('.about-page')!;
  const nav = document.querySelector<HTMLElement>('.chapter-nav')!;
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('[data-chapter]'));
  const chapters = links.map(link => document.getElementById(link.dataset.chapter!)!);
  const indicator = nav.querySelector<HTMLElement>('[data-chapter-indicator]')!;
  let selected = -1;
  let frame = 0;

  function markChapter(measure = false) {
    let current = 0;
    for (let i = 1; i < chapters.length; i++) {
      if (chapters[i].getBoundingClientRect().top < innerHeight * .45) current = i;
    }
    if (scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) current = chapters.length - 1;
    if (!measure && current === selected) return;
    selected = current;
    for (const [index, link] of links.entries()) {
      if (index === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    page.dataset.aboutCurrent = chapters[current].id;
    const active = links[current];
    indicator.style.setProperty('--chapter-left', active.offsetLeft + 'px');
    indicator.style.setProperty('--chapter-top', active.offsetTop + 'px');
    indicator.style.setProperty('--chapter-width', active.offsetWidth + 'px');
    indicator.style.setProperty('--chapter-height', active.offsetHeight + 'px');
    nav.dataset.indicatorReady = '';
  }

  addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; markChapter(); });
  }, { passive: true });
  new ResizeObserver(() => markChapter(true)).observe(nav);
  markChapter(true);

  const meter = page.querySelector<HTMLElement>('.language-overview');
  if (meter && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const meterObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      document.getElementById('languages')!.dataset.meterEntered = '';
      meterObserver.disconnect();
    }, { threshold: .45 });
    meterObserver.observe(meter);
  }

  const list = page.querySelector<HTMLElement>('[data-about-spotlight]');
  if (list) {
    const precise = matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    list.style.setProperty('--spotlight-stops', spotlightFalloff('var(--about-spotlight)', .7));
    const events = new AbortController();
    const options = { signal: events.signal };
    let x = 0, y = 0, nextX = 0, nextY = 0, raf = 0, last = 0;

    const paint = () => {
      list.style.setProperty('--spotlight-x', x.toFixed(1) + 'px');
      list.style.setProperty('--spotlight-y', y.toFixed(1) + 'px');
    };
    function tick(now: number) {
      raf = 0;
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      const follow = 1 - Math.exp(-dt / (.015 + .3 * .22));
      x += (nextX - x) * follow;
      y += (nextY - y) * follow;
      paint();
      if (Math.hypot(nextX - x, nextY - y) > .35) raf = requestAnimationFrame(tick);
    }
    function hide() {
      delete list.dataset.spotlightActive;
      cancelAnimationFrame(raf);
      raf = 0;
    }
    list.addEventListener('pointermove', event => {
      if (!precise.matches || reduce.matches || event.pointerType !== 'mouse') return;
      const rect = list.getBoundingClientRect();
      nextX = event.clientX - rect.left;
      nextY = event.clientY - rect.top;
      if (!list.hasAttribute('data-spotlight-active')) {
        x = nextX; y = nextY;
        paint();
        list.dataset.spotlightActive = '';
      }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }, { ...options, passive: true });
    list.addEventListener('pointerleave', hide, options);
    precise.addEventListener('change', hide);
    reduce.addEventListener('change', hide);
    keep(() => { events.abort(); hide(); });
  }

  const button = page.querySelector<HTMLButtonElement>('[data-copy-mail]');
  const status = page.querySelector<HTMLElement>('.copy-status');
  let timer: ReturnType<typeof setTimeout>;
  button?.addEventListener('click', async () => {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(button.dataset.copyMail!);
      status!.textContent = '邮箱已复制';
    } catch {
      status!.textContent = button.dataset.copyMail!;
    }
    timer = setTimeout(() => { status!.textContent = ''; }, 3500);
  });
}, '[data-about-redesign]');
