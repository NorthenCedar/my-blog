/**
 * LeiBox Sailing TOC 的航线、弹簧、船身转向和尾波。
 * https://github.com/leishifu666/LeiBox/blob/main/src/lib/motion-core/sailing-toc-driver.js
 * 设计参考 Emir Ayaz，https://x.com/emirayaz/status/2113414926911881647/video/1
 * 目录条目尺寸与页面滚动由站点提供。
 */
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function createSailingTocVisual(host: HTMLElement) {
  const doc = host.ownerDocument;
  const win = doc.defaultView!;
  const rail = host.querySelector<SVGSVGElement>('.st-rail')!;
  const route = rail.querySelector<SVGPathElement>('.st-route')!;
  const ends = [...rail.querySelectorAll<SVGCircleElement>('circle')];
  const ship = host.querySelector<HTMLElement>('.st-ship')!;
  const ripples = [...ship.querySelectorAll<SVGEllipseElement>('.st-wake ellipse')];
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  let scale = 1, start = 0, end = 0, height = 0;
  let y = 0, target = 0, velocity = 0, roll = 0, yaw = 0, phase = 0;
  let scrollSpeed = 0, previousScroll = win.scrollY, frame = 0, last = 0;
  let alive = true, visible = true;
  let departing = false, placed = false;

  function draw() {
    const center = y + (media.matches ? 0 : Math.sin(phase * 2.2) * .85);
    const span = Math.min(54, center - start, end - center);
    if (ship.hidden || span <= 0) {
      route.setAttribute('d', 'M22 ' + start + 'V' + end);
    } else {
      // 弯道随船贴近端点时同时收窄、缩短。
      const bend = span * 30 / 54;
      const crest = 22 + 26 * Math.min(1, span / 32);
      route.setAttribute('d', `M22 ${start}L22 ${center - span}C22 ${center - bend} ${crest} ${center - bend} ${crest} ${center}C${crest} ${center + bend} 22 ${center + bend} 22 ${center + span}L22 ${end}`);
    }
    if (ship.hidden) return;
    ship.style.transform = `translateY(${(center - 32) * scale}px) perspective(300px) rotateY(${yaw}deg) rotateZ(${roll}deg)`;
    ripples.forEach((ripple, index) => {
      const progress = (phase / 2.4 + index / 2) % 1;
      ripple.setAttribute('rx', String(24 + progress * 42));
      ripple.setAttribute('ry', String(6 + progress * 13));
      ripple.style.opacity = String(media.matches ? 0 : Math.sin(progress * Math.PI) ** 2 * .24);
    });
  }

  function schedule() {
    if (alive && visible && !doc.hidden && !media.matches && !ship.hidden && !frame) {
      frame = win.requestAnimationFrame(tick);
    }
  }

  function tick(now: number) {
    frame = 0;
    if (!alive || !visible || doc.hidden || media.matches || ship.hidden) { last = 0; return; }
    const dt = Math.min(.032, (now - (last || now)) / 1000);
    last = now;
    phase += dt;
    const speed = dt > 0 ? clamp((win.scrollY - previousScroll) / dt, -16000, 16000) : 0;
    scrollSpeed += (speed - scrollSpeed) * (1 - Math.exp(-dt * 10));
    velocity += (180 * (target - y) - 24 * velocity) * dt;
    y += velocity * dt;
    const smooth = 1 - Math.exp(-dt * 12);
    roll += (clamp(velocity * .035 + scrollSpeed * .012, -20, 20) + Math.sin(phase * 1.8) * 1.4 - roll) * smooth;
    yaw += (clamp(velocity * .05 + scrollSpeed * .06, -48, 48) + Math.sin(phase * .9) * 3 - yaw) * smooth;
    if (Math.abs(target - y) < .1 && Math.abs(velocity) < .2) { y = target; velocity = 0; }
    previousScroll = win.scrollY;
    draw();
    // 船身与尾波都越过裁切边界后才停止渲染。
    if (departing && (y <= -52 || y >= height / scale + 52)) {
      ship.hidden = true;
      stop();
    }
    schedule();
  }

  function stop() {
    win.cancelAnimationFrame(frame);
    frame = last = 0;
    previousScroll = win.scrollY;
  }

  function syncVisibility() {
    if (!visible || doc.hidden || media.matches) stop();
    else schedule();
  }

  const observer = win.IntersectionObserver ? new win.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncVisibility();
  }) : null;
  observer?.observe(host);
  doc.addEventListener('visibilitychange', syncVisibility);

  return {
    resize(nextHeight: number) {
      const width = rail.getBoundingClientRect().width;
      if (nextHeight <= 0 || width <= 0) return;
      height = nextHeight;
      const nextScale = width / 90;
      const bottom = (height - 6) / nextScale;
      if (scale === nextScale && end === bottom) return;
      scale = nextScale;
      start = 6 / scale;
      end = Math.max(start, bottom);
      rail.setAttribute('viewBox', '0 0 90 ' + height / scale);
      ends.forEach((circle, index) => circle.setAttribute('cy', String(index < 2 ? start : end)));
    },
    select(position: number, snap = false) {
      departing = position < 0 || position > height;
      const margin = Math.min(32, (end - start) / 2);
      if (departing) {
        target = position < 0 ? -60 : height / scale + 60;
      } else {
        target = clamp(position / scale, start + margin, end - margin);
      }
      if (!placed || snap || media.matches) {
        stop();
        y = target;
        velocity = roll = yaw = scrollSpeed = 0;
        ship.hidden = departing;
        placed = true;
      } else if (!departing && ship.hidden) {
        ship.hidden = false;
      }
      draw();
      schedule();
    },
    dispose() {
      alive = false;
      stop();
      observer?.disconnect();
      doc.removeEventListener('visibilitychange', syncVisibility);
      ship.hidden = true;
      draw();
    },
  };
}
