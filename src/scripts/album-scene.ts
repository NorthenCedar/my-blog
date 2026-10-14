import { clampCamera, clampFocus, clampZoom, slicePose, zoomAt, scatterZoomStep, focusIntent, coastStep, sliceThrowTarget, sliceWheelImpulse, scatterWheelFactor, coastSliceWheel, type Camera, type Placement } from './album-scene-core';

/** 单册渐进增强：同一批 figure 在陈列与索引间移动，灯箱留在变换层外。 */
for (const root of document.querySelectorAll<HTMLElement>('[data-album-scene]')) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const get = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-scene-${name}]`)!;
  const viewport = get('viewport');
  const world = get('world');
  const title = root.querySelector<HTMLElement>('.scene-title')!;
  const wall = root.querySelector<HTMLElement>('.wf')!;
  const figures = Array.from(wall.querySelectorAll<HTMLElement>('figure'));
  const links = figures.map((figure) => figure.querySelector<HTMLAnchorElement>('a.frame')!);
  const thumbnails = links.map((link) => link.querySelector<HTMLImageElement>('img')!);
  const positions = JSON.parse(root.dataset.placements!) as Placement[];
  if (!figures.length || positions.length !== figures.length) continue;
  const slices = root.dataset.layout === 'slices';
  const toggle = get<HTMLButtonElement>('toggle');
  const prev = get<HTMLButtonElement>('prev');
  const next = get<HTMLButtonElement>('next');
  const touch = get<HTMLButtonElement>('touch');
  const controls = get('controls');
  const status = get('status');
  const hint = get('help');
  const bounds = {
    x: Math.max(...positions.map((p) => Math.abs(p.x))) + 400,
    y: Math.max(...positions.map((p) => Math.abs(p.y))) + 400,
  };
  let camera: Camera = { x: 0, y: 0, scale: 1 };
  let focus = 0;
  let target = 0;
  let active = false;
  let free = false;
  let raf = 0;
  let lastTime = 0;
  let velocity = { x: 0, y: 0 };
  let wheelVelocity = 0;
  // 散片滚轮缩放的目标倍率与锚点：连续滚轮只更新目标，画面在帧循环里平滑追向它。
  let zoomTarget: { scale: number; point: { x: number; y: number } } | null = null;
  let drag: { id: number; x: number; y: number; lastX: number; lastY: number; time: number; camera: Camera; focus: number; moved: boolean; touch: boolean } | null = null;
  let suppressClick = false;
  let clickTimer = 0;
  let lastReadout = -1;
  let navigation = focusIntent('pointer');
  let started = false;

  for (let i = 0; i < figures.length; i++) {
    const p = positions[i];
    const style = figures[i].style;
    style.setProperty('--scene-x', `${p.x}px`);
    style.setProperty('--scene-y', `${p.y}px`);
    style.setProperty('--scene-angle', `${p.angle}deg`);
    style.setProperty('--scene-depth', String(p.depth));
    style.setProperty('--scene-photo-width', `${p.width}px`);
    style.setProperty('--scene-photo-height', `${p.height ?? 300}px`);
    style.setProperty('--scene-slice-width', `${p.sliceWidth ?? p.width}px`);
    links[i].draggable = false;
    const image = links[i].querySelector('img')!;
    const ratio = Number(image.getAttribute('width')) / Number(image.getAttribute('height'));
    style.setProperty('--scene-photo-ratio', String(Number.isFinite(ratio) && ratio > 0 ? ratio : 1));
    image.draggable = false;
  }

  function paint() {
    if (!active) return;
    if (!slices) {
      camera = clampCamera(camera, bounds);
      world.style.setProperty('--scene-pan-x', `${camera.x}px`);
      world.style.setProperty('--scene-pan-y', `${camera.y}px`);
      world.style.setProperty('--scene-drift-x', `${camera.x / camera.scale}px`);
      world.style.setProperty('--scene-drift-y', `${camera.y / camera.scale}px`);
      world.style.setProperty('--scene-scale', String(camera.scale));
      // 变换后的 lazy 可见性判断在不同浏览器上有差异；只放行视野附近的小档。
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const x = p.x * camera.scale + camera.x * (1 + p.depth);
        const y = p.y * camera.scale + camera.y * (1 + p.depth);
        if (Math.abs(x) < viewport.clientWidth / 2 + p.width * camera.scale && Math.abs(y) < viewport.clientHeight / 2 + (p.height ?? 300) * camera.scale) thumbnails[i].loading = 'eager';
      }
      status.textContent = `${figures.length} 帧`;
      return;
    }
    const current = Math.round(focus);
    for (let i = 0; i < figures.length; i++) {
      const pose = slicePose(i, focus);
      const figure = figures[i];
      figure.style.setProperty('--scene-x', `${pose.x}px`);
      figure.style.setProperty('--scene-y', `${pose.y}px`);
      figure.style.setProperty('--scene-z', `${pose.z}px`);
      figure.style.setProperty('--scene-angle', `${pose.rotateY}deg`);
      figure.style.setProperty('--scene-opacity', String(pose.opacity));
      figure.setAttribute('aria-hidden', String(!pose.visible));
      figure.inert = !pose.visible;
      if (Math.abs(i - focus) < 5.5) thumbnails[i].loading = 'eager';
      links[i].tabIndex = i === current ? 0 : -1;
    }
    if (current !== lastReadout) {
      status.textContent = `${current + 1} / ${figures.length}`;
      lastReadout = current;
    }
    prev.disabled = target <= 0;
    next.disabled = target >= figures.length - 1;
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    velocity = { x: 0, y: 0 };
    wheelVelocity = 0;
    zoomTarget = null;
  }

  function animate(now: number) {
    const dt = Math.min(0.08, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!active || document.hidden || reduce.matches) { stop(); return; }
    let running: boolean;
    if (slices) {
      if (wheelVelocity !== 0) {
        const coast = coastSliceWheel(focus, wheelVelocity, dt, figures.length);
        focus = coast.focus;
        wheelVelocity = coast.velocity;
        target = focus;
        if (Math.abs(wheelVelocity) <= 0.08) { wheelVelocity = 0; target = Math.round(focus); }
      } else {
        focus = target + (focus - target) * Math.exp(-7 * dt);
      }
      running = Math.abs(wheelVelocity) > 0 || Math.abs(focus - target) > 0.002;
      if (!running) focus = target;
    } else {
      const state = coastStep(camera, velocity, dt);
      camera = state.camera;
      velocity = state.velocity;
      let settling = false;
      if (zoomTarget) {
        const zoom = scatterZoomStep(camera, zoomTarget, dt);
        camera = zoom.camera;
        settling = !zoom.done;
        if (zoom.done) zoomTarget = null;
      }
      running = Math.abs(velocity.x) + Math.abs(velocity.y) > 8 || settling;
    }
    paint();
    raf = running ? requestAnimationFrame(animate) : 0;
  }

  function start() {
    if (raf) return;
    lastTime = performance.now();
    raf = requestAnimationFrame(animate);
  }

  function goto(index: number, keyboard = false) {
    wheelVelocity = 0;
    target = Math.round(clampFocus(index, figures.length));
    if (keyboard) { focus = target; paint(); links[target].focus({ preventScroll: true }); }
    else start();
  }

  function home() {
    stop();
    if (slices) { focus = target = 0; }
    else camera = { x: 0, y: 0, scale: Math.max(0.34, Math.min(0.9, viewport.clientWidth / 1400)) };
    paint();
  }

  function setActive(on: boolean) {
    stop();
    drag = null;
    viewport.classList.remove('dragging');
    active = on;
    document.body.classList.toggle('album-scene-active', on);
    if (on) {
      if (slices) viewport.prepend(title);
      else world.append(title);
      world.append(wall);
      root.classList.add('scene-on');
      viewport.tabIndex = 0;
      controls.hidden = false;
      if (!started) { started = true; home(); }
      else paint();
    } else {
      root.classList.remove('scene-on', 'scene-free');
      viewport.prepend(title);
      viewport.after(wall);
      viewport.tabIndex = -1;
      controls.hidden = true;
      for (let i = 0; i < figures.length; i++) {
        figures[i].inert = false;
        figures[i].removeAttribute('aria-hidden');
        links[i].removeAttribute('tabindex');
      }
    }
    touch.hidden = !on || slices || !matchMedia('(pointer: coarse)').matches;
    if (!on) { free = false; touch.setAttribute('aria-pressed', 'false'); touch.textContent = '自由拖动'; }
    toggle.textContent = on ? '查看全部' : '返回展览';
    toggle.setAttribute('aria-pressed', String(!on));
  }

  hint.textContent = slices ? '滚轮或左右拖动浏览 · 点击照片放大' : '拖动探索 · 滚轮或 ＋ − 缩放 · 点击照片放大';
  toggle.hidden = reduce.matches;
  if (!reduce.matches) setActive(true);
  document.addEventListener('keydown', (event) => {
    navigation = focusIntent(event.key === 'Tab' ? 'Tab' : 'key', navigation.pending);
  }, true);
  document.addEventListener('pointerdown', () => { navigation = focusIntent('pointer'); }, true);
  document.addEventListener('focusin', (event) => {
    if (!viewport.contains(event.target as Node)) navigation = focusIntent('focus', navigation.pending);
  });
  toggle.addEventListener('click', () => setActive(!active));
  get('home').addEventListener('click', home);
  touch.addEventListener('click', () => {
    free = !free;
    root.classList.toggle('scene-free', free);
    touch.setAttribute('aria-pressed', String(free));
    touch.textContent = free ? '结束自由拖动' : '自由拖动';
    hint.textContent = free ? '四向拖动探索 · 查看全部可正常翻阅' : (slices ? '左右滑动浏览 · 点击照片放大' : '左右滑动浏览 · 自由拖动可四向探索');
  });
  prev.addEventListener('click', () => { if (slices) goto(target - 1); else { camera.x += 200; paint(); } });
  next.addEventListener('click', () => { if (slices) goto(target + 1); else { camera.x -= 200; paint(); } });
  if (!slices) {
    get('zoom-in').addEventListener('click', () => { stop(); camera = zoomAt(camera, { x: 0, y: 0 }, 1.2); paint(); });
    get('zoom-out').addEventListener('click', () => { stop(); camera = zoomAt(camera, { x: 0, y: 0 }, 1 / 1.2); paint(); });
  }

  viewport.addEventListener('pointerdown', (event) => {
    if (!active || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    stop();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, time: event.timeStamp, camera: { ...camera }, focus, moved: false, touch: event.pointerType !== 'mouse' };
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < (drag.touch ? 9 : 5)) return;
      if (drag.touch && !free && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('dragging');
    }
    const dt = Math.max(0.008, (event.timeStamp - drag.time) / 1000);
    velocity.x = Math.max(-2400, Math.min(2400, (event.clientX - drag.lastX) / dt));
    velocity.y = drag.touch && !free ? 0 : Math.max(-2400, Math.min(2400, (event.clientY - drag.lastY) / dt));
    if (slices) focus = target = clampFocus(drag.focus - dx / Math.min(390, viewport.clientWidth * 0.65), figures.length);
    else { camera.x = drag.camera.x + dx; camera.y = drag.camera.y + (drag.touch && !free ? 0 : dy); }
    drag.lastX = event.clientX; drag.lastY = event.clientY; drag.time = event.timeStamp;
    if (event.cancelable) event.preventDefault();
    paint();
  });
  function release(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    if (event.timeStamp - drag.time > 120) velocity = { x: 0, y: 0 }; // 停住后再松手，不应继续飘。
    drag = null;
    viewport.classList.remove('dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (moved) {
      suppressClick = true;
      clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => { suppressClick = false; }, 250);
      if (event.type === 'pointercancel') { stop(); return; }
      if (slices) target = sliceThrowTarget(focus, velocity.x, Math.min(390, viewport.clientWidth * 0.65), figures.length);
      start();
    }
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  viewport.addEventListener('lostpointercapture', () => { drag = null; viewport.classList.remove('dragging'); });
  viewport.addEventListener('click', (event) => {
    if (!active) return;
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // 键盘点击也会打开原灯箱；在它接手前停住，关闭后仍回到这张照片。
    if (links.some((link) => link.contains(event.target as Node))) {
      stop();
      if (slices) target = focus;
    }
  }, true);
  viewport.addEventListener('wheel', (event) => {
    if (!active || event.ctrlKey || event.metaKey) return;
    if (!slices) {
      if (drag) return;
      const factor = scatterWheelFactor(event.deltaY, event.deltaMode, viewport.clientHeight);
      if (factor === 1) return;
      if (event.cancelable) event.preventDefault();
      // 只累加目标倍率，交给帧循环逐帧逼近；连续滚轮因此读作一段连续缩放而不是逐格跳变。
      const rect = viewport.getBoundingClientRect();
      const base = zoomTarget ? zoomTarget.scale : camera.scale;
      stop();
      zoomTarget = {
        scale: clampZoom(base * factor),
        point: { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 },
      };
      start();
      return;
    }
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const impulse = sliceWheelImpulse(delta, event.deltaMode, viewport.clientHeight);
    if (!impulse) return;
    if (event.cancelable) event.preventDefault();
    // 反向滚动应立即回头，不让上一次滚轮的余速抵消新手势。
    if (wheelVelocity * impulse < 0) wheelVelocity = 0;
    target = focus;
    wheelVelocity = Math.max(-12, Math.min(12, wheelVelocity + impulse));
    start();
  }, { passive: false });
  viewport.addEventListener('focusin', (event) => {
    navigation = focusIntent('focus', navigation.pending);
    if (!active || !navigation.center) return;
    const index = links.indexOf(event.target as HTMLAnchorElement);
    if (index < 0) return;
    stop();
    if (slices) focus = target = index;
    else {
      camera.x = -positions[index].x * camera.scale / (1 + positions[index].depth);
      camera.y = -positions[index].y * camera.scale / (1 + positions[index].depth);
    }
    paint();
  });
  viewport.addEventListener('keydown', (event) => {
    if (!active || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    stop();
    if (event.key === 'Home') { home(); return; }
    if (slices) goto(target + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1), true);
    else {
      camera.x += event.key === 'ArrowLeft' ? 100 : event.key === 'ArrowRight' ? -100 : 0;
      camera.y += event.key === 'ArrowUp' ? 100 : event.key === 'ArrowDown' ? -100 : 0;
      paint();
    }
  });
  new ResizeObserver(() => { if (active) paint(); }).observe(viewport);
  reduce.addEventListener('change', () => {
    if (reduce.matches) { setActive(false); toggle.hidden = true; }
    else { toggle.hidden = false; setActive(true); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
}
