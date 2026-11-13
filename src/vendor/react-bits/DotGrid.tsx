'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

import './DotGrid.css';

type Shape = 'circle' | 'square';

interface DotGridProps {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  strength?: number;
  bounce?: number;
  tension?: number;
  returnDuration?: number;
  shockRadius?: number;
  shockStrength?: number;
  swell?: number;
  stretch?: number;
  glow?: number;
  shape?: Shape;
  fade?: number;
  opacity?: number;
  intro?: boolean;
  mouseInteraction?: boolean;
  clickShock?: boolean;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

interface Shock {
  x: number;
  y: number;
  start: number;
}

const toRgb = (color: string): [number, number, number] => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
  if (!match) return [1, 1, 1];
  const hex = match[1].length === 3 ? match[1].replace(/./g, digit => digit + digit) : match[1];
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
};

const smootherstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const backOut = (t: number) => {
  const s = 1.9;
  const x = t - 1;
  return 1 + x * x * ((s + 1) * x + s);
};

const DotGrid = ({
  dotSize = 5,
  gap = 18,
  baseColor = '#3a3446',
  activeColor = '#ffffff',
  proximity = 140,
  strength = 1,
  bounce = 0.6,
  tension = 0.4,
  returnDuration = 0.8,
  shockRadius = 320,
  shockStrength = 5,
  swell = 0.8,
  stretch = 0.5,
  glow = 0.5,
  shape = 'circle',
  fade = 0,
  opacity = 1,
  intro = true,
  mouseInteraction = true,
  clickShock = true,
  paused = false,
  dpr,
  className = '',
  style
}: DotGridProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<{ rebuild: () => void; refresh: () => void } | null>(null);
  const settings = {
    dotSize,
    gap,
    baseColor,
    activeColor,
    proximity,
    strength,
    bounce,
    tension,
    returnDuration,
    shockRadius,
    shockStrength,
    swell,
    stretch,
    glow,
    shape,
    fade,
    opacity,
    intro,
    mouseInteraction,
    clickShock,
    paused,
    dpr
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 页面点阵保留原弹簧和扰动，稀疏图形用 2D 画布，换页时无需同步创建 WebGL 上下文。
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const view = { width: 0, height: 0, left: 0, top: 0, ratio: 1 };
    const grid = { count: 0, cols: 1, rows: 1, cell: 1, centerX: 0, centerY: 0, reach: 1 };
    let rest = new Float32Array(0);
    let offset = new Float32Array(0);
    let velocity = new Float32Array(0);
    let force = new Float32Array(0);
    let next = new Float32Array(0);
    let wave = new Float32Array(0);
    let energy = new Float32Array(0);
    let palette: string[] = [];
    let previousBase = '';
    let previousActive = '';
    let paintedSize = 0;
    let paintedGap = 0;
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, time: 0, inside: false, presence: 0 };
    const shocks: Shock[] = [];
    let introStart: number | null = settingsRef.current.intro && !reduced ? -1 : null;
    let visible = true;
    let raf = 0;
    let last = 0;

    const rebuild = () => {
      const { dotSize: size, gap: spacing } = settingsRef.current;
      paintedSize = size;
      paintedGap = spacing;
      const cell = Math.max(2, size + spacing);
      const cols = Math.max(1, Math.floor((view.width + spacing) / cell));
      const rows = Math.max(1, Math.floor((view.height + spacing) / cell));
      const startX = (view.width - (cols * cell - spacing)) / 2 + size / 2;
      const startY = (view.height - (rows * cell - spacing)) / 2 + size / 2;
      const count = cols * rows;
      rest = new Float32Array(count * 2);
      offset = new Float32Array(count * 2);
      velocity = new Float32Array(count * 2);
      force = new Float32Array(count * 2);
      next = new Float32Array(count * 2);
      wave = new Float32Array(count * 4);
      energy = new Float32Array(count);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const index = (row * cols + col) * 2;
          rest[index] = startX + col * cell;
          rest[index + 1] = startY + row * cell;
        }
      }
      Object.assign(grid, {
        count,
        cols,
        rows,
        cell,
        centerX: view.width / 2,
        centerY: view.height / 2,
        reach: Math.hypot(view.width, view.height) / 2
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(settingsRef.current.dpr ?? window.devicePixelRatio ?? 1, 2, Math.sqrt(2400000 / (width * height)));
      if (width === view.width && height === view.height && ratio === view.ratio) return;
      Object.assign(view, { width, height, left: rect.left, top: rect.top, ratio });
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      rebuild();
      render(performance.now());
    };

    const step = (dt: number, now: number) => {
      const s = settingsRef.current;
      const motion = reduced ? 0 : 1;
      const zeta = 1 - 0.85 * Math.min(1, Math.max(0, s.bounce));
      const omega = 4 / (zeta * Math.max(0.2, s.returnDuration));
      const stiffness = omega * omega;
      const damping = 2 * zeta * omega;
      const radius = Math.max(1, s.proximity);
      const speed = Math.hypot(pointer.vx, pointer.vy);
      const drive = s.mouseInteraction && pointer.inside ? 6500 * Math.tanh(speed / 900) * s.strength * motion : 0;
      const dirX = speed > 0.001 ? pointer.vx / speed : 0;
      const dirY = speed > 0.001 ? pointer.vy / speed : 0;
      const width = grid.cell * 1.4;
      const travel = 650;
      const active = shocks.map(shock => {
        const front = ((now - shock.start) / 1000) * travel;
        const power = smootherstep(1 - front / Math.max(1, s.shockRadius));
        return { ...shock, front, amplitude: power * s.shockStrength * grid.cell * 0.24 * motion };
      });
      const coupling = (Math.max(0, s.tension) * 900) ** 2 / (grid.cell * grid.cell);
      const viscosity = Math.sqrt(coupling) * 0.06;
      const limit = Math.sqrt(stiffness + 8 * coupling) + damping + 8 * viscosity;
      const steps = Math.min(24, Math.max(1, Math.ceil(dt / Math.min(1 / 120, 1.2 / limit))));
      const h = dt / steps;
      for (let i = 0; i < grid.count; i++) {
        const index = i * 2;
        const rx = rest[index];
        const ry = rest[index + 1];
        let ax = 0;
        let ay = 0;
        if (drive > 0) {
          const ex = rx + offset[index] - pointer.x;
          const ey = ry + offset[index + 1] - pointer.y;
          const distance = Math.hypot(ex, ey);
          if (distance < radius) {
            const weight = smootherstep(1 - distance / radius) * drive;
            const nx = distance > 0.001 ? ex / distance : 0;
            const ny = distance > 0.001 ? ey / distance : 0;
            ax += weight * (dirX + nx * 0.6);
            ay += weight * (dirY + ny * 0.6);
          }
        }
        let wx = 0;
        let wy = 0;
        let wvx = 0;
        let wvy = 0;
        for (const shock of active) {
          if (shock.amplitude <= 0) continue;
          const ex = rx - shock.x;
          const ey = ry - shock.y;
          const distance = Math.hypot(ex, ey);
          const u = (distance - shock.front) / width;
          if (Math.abs(u) < 3 && distance > 0.001) {
            const nx = ex / distance;
            const ny = ey / distance;
            const profile = Math.exp(-u * u);
            const push = shock.amplitude * profile;
            const rate = ((shock.amplitude * 2 * u * profile) / width) * travel;
            wx += nx * push;
            wy += ny * push;
            wvx += nx * rate;
            wvy += ny * rate;
            ax += nx * push * stiffness * 0.35;
            ay += ny * push * stiffness * 0.35;
          }
        }
        force[index] = ax;
        force[index + 1] = ay;
        const target = i * 4;
        wave[target] = wx;
        wave[target + 1] = wy;
        wave[target + 2] = wvx;
        wave[target + 3] = wvy;
      }
      const { cols, rows } = grid;
      const stride = cols * 2;
      for (let n = 0; n < steps; n++) {
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const index = (row * cols + col) * 2;
            let ax = force[index] - stiffness * offset[index] - damping * velocity[index];
            let ay = force[index + 1] - stiffness * offset[index + 1] - damping * velocity[index + 1];
            if (coupling > 0) {
              let lx = -4 * offset[index];
              let ly = -4 * offset[index + 1];
              let mx = -4 * velocity[index];
              let my = -4 * velocity[index + 1];
              if (col > 0) {
                lx += offset[index - 2];
                ly += offset[index - 1];
                mx += velocity[index - 2];
                my += velocity[index - 1];
              }
              if (col < cols - 1) {
                lx += offset[index + 2];
                ly += offset[index + 3];
                mx += velocity[index + 2];
                my += velocity[index + 3];
              }
              if (row > 0) {
                lx += offset[index - stride];
                ly += offset[index - stride + 1];
                mx += velocity[index - stride];
                my += velocity[index - stride + 1];
              }
              if (row < rows - 1) {
                lx += offset[index + stride];
                ly += offset[index + stride + 1];
                mx += velocity[index + stride];
                my += velocity[index + stride + 1];
              }
              ax += coupling * lx + viscosity * mx;
              ay += coupling * ly + viscosity * my;
            }
            next[index] = velocity[index] + ax * h;
            next[index + 1] = velocity[index + 1] + ay * h;
          }
        }
        for (let i = 0; i < offset.length; i++) {
          velocity[i] = next[i];
          offset[i] += velocity[i] * h;
        }
      }
      for (let i = 0; i < grid.count; i++) {
        const index = i * 2;
        const target = i * 4;
        energy[i] = Math.min(
          1,
          (Math.hypot(velocity[index] + wave[target + 2], velocity[index + 1] + wave[target + 3]) / 380) * 0.85 +
            (Math.hypot(offset[index] + wave[target], offset[index + 1] + wave[target + 1]) / (grid.cell * 2.2)) * 0.35
        );
      }
      for (let i = shocks.length - 1; i >= 0; i--) {
        if (active[i].front > s.shockRadius + width * 3) shocks.splice(i, 1);
      }
      const decay = 1 - Math.exp(-dt / 0.08);
      pointer.vx -= pointer.vx * decay;
      pointer.vy -= pointer.vy * decay;
      const presenceTarget = s.mouseInteraction && pointer.inside ? 1 : 0;
      pointer.presence += (presenceTarget - pointer.presence) * (1 - Math.exp(-dt / 0.2));
    };

    const render = (now: number) => {
      const s = settingsRef.current;
      const radius = Math.max(1, s.proximity);
      if (s.baseColor !== previousBase || s.activeColor !== previousActive || !palette.length) {
        previousBase = s.baseColor;
        previousActive = s.activeColor;
        const base = toRgb(s.baseColor), active = toRgb(s.activeColor);
        palette = Array.from({ length: 33 }, (_, i) => {
          const t = i / 32;
          return 'rgb(' + base.map((v, channel) => Math.round((v + (active[channel] - v) * t) * 255)).join(' ') + ')';
        });
      }
      ctx.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      const opacity = Math.min(1, Math.max(0, s.opacity));
      const edgeRange = s.fade * 0.4 * Math.min(view.width, view.height);
      let previousColor = '';
      let previousAlpha = -1;
      const introAge = introStart === null ? Infinity : introStart < 0 ? 0 : (now - introStart) / 1000;
      const introFront = introAge * grid.reach * 1.25;
      const introBand = grid.cell * 4;
      for (let i = 0; i < grid.count; i++) {
        const index = i * 2;
        const source = i * 4;
        const x = rest[index] + offset[index] + wave[source];
        const y = rest[index + 1] + offset[index + 1] + wave[source + 1];
        let glowing = energy[i];
        if (pointer.presence > 0.001) {
          const distance = Math.hypot(x - pointer.x, y - pointer.y);
          if (distance < radius)
            glowing = Math.max(glowing, smootherstep(1 - distance / radius) * 0.4 * pointer.presence);
        }
        let scale = 1;
        if (introStart !== null) {
          const distance = Math.hypot(rest[index] - grid.centerX, rest[index + 1] - grid.centerY);
          const appear = Math.min(1, Math.max(0, (introFront - distance) / introBand));
          scale = appear >= 1 ? 1 : Math.max(0, backOut(appear));
          glowing = Math.max(glowing, Math.sin(appear * Math.PI) * 0.6);
        }
        const r = Math.max(0.5, s.dotSize) * 0.5 * scale * (1 + (reduced ? 0 : s.swell) * glowing);
        if (r <= 0) continue;
        const vx = velocity[index] + wave[source + 2];
        const vy = velocity[index + 1] + wave[source + 3];
        const speed = Math.hypot(vx, vy);
        const length = reduced ? 0 : Math.min(s.dotSize * 2, speed * s.stretch * 0.02);
        const color = palette[Math.min(32, Math.max(0, Math.round(glowing * 1.2 * 32)))];
        const fade = edgeRange > 0
          ? smootherstep(Math.min(x, view.width - x) / edgeRange) * smootherstep(Math.min(y, view.height - y) / edgeRange)
          : 1;
        const alpha = opacity * fade;
        if (color !== previousColor) { ctx.fillStyle = color; previousColor = color; }
        if (alpha !== previousAlpha) { ctx.globalAlpha = alpha; previousAlpha = alpha; }

        if (glowing > 0.02 && s.glow > 0) {
          ctx.globalAlpha = alpha * Math.min(1, s.glow * glowing * 0.5);
          ctx.beginPath();
          ctx.arc(x, y, r * (1 + s.glow * glowing * 2.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = alpha;
        }
        if (length < 0.15 && s.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        const rawAngle = speed > 0.001 ? Math.atan2(vy, vx) : 0;
        const axis = Math.round(rawAngle / (Math.PI / 2)) * (Math.PI / 2);
        const blend = Math.min(1, Math.max(0, (speed - 8) / 62));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(axis + (rawAngle - axis) * blend * blend * (3 - 2 * blend));
        ctx.beginPath();
        ctx.roundRect(-length - r, -r, (length + r) * 2, r * 2, s.shape === 'square' ? r * 0.3 : r);
        ctx.fill();
        ctx.restore();
      }
    };

    const settled = (now: number) => {
      if (shocks.length) return false;
      if (introStart !== null) {
        if (introStart < 0 || (now - introStart) / 1000 < 1.6) return false;
        introStart = null;
      }
      if (Math.abs(pointer.vx) + Math.abs(pointer.vy) > 1) return false;
      const presenceTarget = settingsRef.current.mouseInteraction && pointer.inside ? 1 : 0;
      if (Math.abs(presenceTarget - pointer.presence) > 0.002) return false;
      for (let i = 0; i < offset.length; i++) {
        if (Math.abs(offset[i]) > 0.02 || Math.abs(velocity[i]) > 0.5) return false;
      }
      return true;
    };

    const frame = (now: number) => {
      raf = 0;
      if (settingsRef.current.paused || !visible) return;
      if (introStart !== null && introStart < 0) introStart = now;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      step(dt, now);
      render(now);
      if (!settled(now)) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf || settingsRef.current.paused || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const locate = (event: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      view.left = rect.left;
      view.top = rect.top;
      return [
        (event.clientX - rect.left) * view.width / Math.max(1, rect.width),
        (event.clientY - rect.top) * view.height / Math.max(1, rect.height),
      ];
    };

    const onMove = (event: PointerEvent) => {
      if (!settingsRef.current.mouseInteraction) return;
      const [x, y] = locate(event);
      const inside = x >= 0 && y >= 0 && x <= view.width && y <= view.height;
      const time = event.timeStamp || performance.now();
      if (inside && pointer.inside && pointer.time) {
        const elapsed = Math.max(4, time - pointer.time) / 1000;
        const vx = (x - pointer.x) / elapsed;
        const vy = (y - pointer.y) / elapsed;
        pointer.vx += (vx - pointer.vx) * 0.6;
        pointer.vy += (vy - pointer.vy) * 0.6;
      } else {
        pointer.vx = 0;
        pointer.vy = 0;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.time = time;
      if (inside !== pointer.inside || inside) {
        pointer.inside = inside;
        wake();
      }
    };

    const onLeave = () => {
      pointer.inside = false;
      pointer.time = 0;
      wake();
    };

    const onOut = (event: PointerEvent) => {
      if (!event.relatedTarget) onLeave();
    };

    const onDown = (event: PointerEvent) => {
      if (!settingsRef.current.clickShock || reduced) return;
      const [x, y] = locate(event);
      if (x < 0 || y < 0 || x > view.width || y > view.height) return;
      shocks.push({ x, y, start: performance.now() });
      if (shocks.length > 6) shocks.shift();
      wake();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerout', onOut);
    window.addEventListener('blur', onLeave);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      wake();
    });
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
    });
    visibilityObserver.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        wake();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    wake();

    engineRef.current = {
      rebuild: () => {
        if (paintedSize === settingsRef.current.dotSize && paintedGap === settingsRef.current.gap) return;
        rebuild();
        render(performance.now());
        wake();
      },
      refresh: () => {
        render(performance.now());
        wake();
      }
    };

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerout', onOut);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.rebuild();
  }, [dotSize, gap]);

  useEffect(() => {
    engineRef.current?.refresh();
  }, [baseColor, activeColor, swell, stretch, glow, shape, fade, opacity, paused, proximity, mouseInteraction]);

  return (
    <div className={`dot-grid ${className}`.trim()} style={style}>
      <canvas ref={canvasRef} className="dot-grid__canvas" />
    </div>
  );
};

export default DotGrid;
