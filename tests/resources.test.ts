import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { readPost } from '../src/lib/writer/content';
import { resourcesPageSchema } from '../src/lib/resources-schema';
import { parseResourceDetail } from '../src/lib/resources-rich';
import {
  CURVE_CONFIG,
  RAIL_ARC_CONFIG,
  TitleSpring,
  WIRE_STYLE,
  buildRailSemicircle,
  computeCurveFrame,
  computeLead,
  computeRaisedCovers,
  cornerIconPaths,
  expApproach,
  hingePoint,
  isHtmlInCanvasSupported,
  projectPoint,
  railArcDistAtY,
  railArcPointAt,
  standingCharPos,
  unprojectPoint,
  wireBezierPoint,
  wireFadeWeight,
  wireHandle,
} from '../src/scripts/resources-curve';
import { computeCardHotspots, extractGlyphOutlineSegments } from '../src/scripts/resources-scene-data';
import { FLOAT_SHAPES, MATH_FORMULAS, SidePropsController, getPolyhedronEdges } from '../src/scripts/resources-props';
import { GAME_CONFIG, RunwayGameController, gradeForScore } from '../src/scripts/resources-game';

vi.mock('../src/scripts/page-lifecycle', () => ({
  onPage: () => () => {},
}));

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'resources', 'index.html'));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

async function setupRunwayFixture() {
  const { initResourcesRunway } = await import('../src/scripts/resources-runway');
  const win = new Window({ url: 'https://northcedar.top/resources/', width: 1280, height: 800 });
  const doc = win.document;
  doc.body.innerHTML = `
    <div class="res-page" data-resources-page>
      <nav class="res-rail" data-res-rail>
        <div class="res-rail-list" data-res-rail-list>
          <button type="button" class="res-rail-btn" data-rail-target="0" aria-current="true">
            <span class="res-rail-label">应用与安装包</span>
            <span class="res-rail-dot" aria-hidden="true"></span>
          </button>
          <button type="button" class="res-rail-btn" data-rail-target="1" aria-current="false">
            <span class="res-rail-label">小说</span>
            <span class="res-rail-dot" aria-hidden="true"></span>
          </button>
        </div>
        <canvas class="res-rail-arcs" data-res-rail-arcs aria-hidden="true"></canvas>
      </nav>
      <button type="button" class="res-dim-toggle liquid-glass liquid-glass--player" data-dim-toggle aria-pressed="false">
        <span class="res-corner-mark" aria-hidden="true">
          <svg viewBox="-12 -12 24 24" width="22" height="22" data-corner-svg>
            <path data-svg-hidden opacity="0" d="" />
            <path data-svg-shadow opacity="0" d="" />
            <path data-svg-solid d="M-9.5 -9.5L9.5 -9.5L9.5 9.5L-9.5 9.5Z" />
            <path data-svg-curve d="" />
            <circle data-svg-tip cx="6.5" cy="-6.5" r="1.25" />
          </svg>
        </span>
        <span data-dim-label>立体视图</span>
      </button>
      <div class="res-stage" data-res-stage data-stage-mode="2d" data-gl-active="false" data-gpu-backend="2d">
        <canvas class="res-gl-canvas" data-res-canvas aria-hidden="true"></canvas>
        <canvas class="res-wire-canvas" data-res-wires aria-hidden="true"></canvas>
        <div class="res-track" data-res-track>
          <div class="res-runway" data-res-runway>
            <header class="res-head" data-res-hero>
              <div class="res-hero-title" data-res-title3d="hero"><h1>资源</h1></div>
              <div class="res-controls-slot">
                <div class="res-controls">
                  <input type="search" class="res-search" data-res-search />
                  <button type="button" class="res-search-clear" data-res-clear hidden>清空</button>
                  <output class="res-count" data-res-count>共 3 项</output>
                </div>
              </div>
            </header>
            <section class="res-group" data-res-group="0" id="res-g-0">
              <div class="res-group-head">
                <span class="res-group-code">01</span>
                <h2 data-res-title3d="group-0">应用与安装包</h2>
                <span class="res-group-count">2 项</span>
              </div>
              <article class="res-card" data-res-card data-wide="true" data-q="writing-desk windows" tabindex="0" role="button" aria-expanded="false">
                <h3>写作台</h3>
                <p class="res-summary">桌面写作台</p>
                <div class="res-card-pillbar"><a class="res-cta" href="https://example.com/desk">前往仓库</a></div>
                <div class="res-card-stage"><p class="res-stage-desc">详细说明</p></div>
              </article>
              <article class="res-card" data-res-card data-wide="false" data-q="localsend lan" tabindex="0" role="button" aria-expanded="false">
                <h3>LocalSend</h3>
                <p class="res-summary">局域网互传</p>
                <div class="res-card-pillbar"><a class="res-cta" href="https://example.com/localsend">官方下载</a></div>
                <div class="res-card-stage"><p class="res-stage-desc">局域网互传详情</p></div>
              </article>
            </section>
            <section class="res-group" data-res-group="1" id="res-g-1">
              <div class="res-group-head">
                <span class="res-group-code">02</span>
                <h2 data-res-title3d="group-1">小说</h2>
                <span class="res-group-count">1 项</span>
              </div>
              <article class="res-card" data-res-card data-wide="true" data-q="three-body epub sci-fi" tabindex="0" role="button" aria-expanded="false">
                <h3>《三体》</h3>
                <p class="res-summary">电子书</p>
                <div class="res-card-pillbar">
                  <a class="res-cta" href="https://example.com/book">获取资源</a>
                  <button type="button" class="res-copy" data-copy-code="nced">提取码 nced · 复制</button>
                </div>
                <div class="res-card-stage"><p class="res-stage-desc">三体电子书</p></div>
              </article>
            </section>
            <p class="res-empty" data-res-empty hidden>没有找到匹配的资源</p>
          </div>
        </div>
      </div>
    </div>
  `;

  let rafSeq = 0;
  const rafMap = new Map<number, FrameRequestCallback>();
  let scrollY = 0;
  let nowClock = 1000;

  Object.defineProperty(win, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(win, 'scrollY', {
    get: () => scrollY,
    set: (v: number) => { scrollY = v; },
    configurable: true,
  });
  Object.defineProperty(win.performance, 'now', {
    value: () => nowClock,
    configurable: true,
  });
  (win as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  (win as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = ++rafSeq;
    rafMap.set(id, cb);
    return id;
  };
  (win as any).cancelAnimationFrame = (id: number) => {
    rafMap.delete(id);
  };
  (win as any).scrollTo = (opts: ScrollToOptions | number) => {
    scrollY = typeof opts === 'number' ? opts : (opts?.top ?? 0);
  };

  const mockRect = (el: HTMLElement, left: number, docTop: number, width: number, height: number) => {
    el.getBoundingClientRect = () => ({
      left,
      right: left + width,
      top: docTop - scrollY,
      bottom: docTop + height - scrollY,
      width,
      height,
      x: left,
      y: docTop - scrollY,
      toJSON: () => ({}),
    });
  };

  const track = doc.querySelector<HTMLElement>('[data-res-track]')!;
  const stage = doc.querySelector<HTMLElement>('[data-res-stage]')!;
  const runway = doc.querySelector<HTMLElement>('[data-res-runway]')!;
  const hero = doc.querySelector<HTMLElement>('[data-res-hero]')!;
  const groups = [...doc.querySelectorAll<HTMLElement>('[data-res-group]')];
  const cards = [...doc.querySelectorAll<HTMLElement>('[data-res-card]')];

  Object.defineProperty(stage, 'clientHeight', { value: 800, configurable: true });
  Object.defineProperty(runway, 'scrollHeight', { value: 2400, configurable: true });
  mockRect(track, 0, 60, 1280, 2400);
  mockRect(runway, 0, 60, 1280, 2400);
  mockRect(hero, 60, 92, 1160, 220);
  groups.forEach((g, idx) => mockRect(g, 60, 360 + idx * 960, 1160, 880));
  cards.forEach((c, idx) => mockRect(c, 60 + (idx % 2) * 580, 480 + Math.floor(idx / 2) * 440, 560, 410));

  const flushRaf = (steps = 65) => {
    for (let i = 0; i < steps && rafMap.size > 0; i++) {
      nowClock += 16;
      const pending = [...rafMap.entries()];
      rafMap.clear();
      for (const [, cb] of pending) cb(nowClock);
    }
  };

  dispose = initResourcesRunway(doc as unknown as Document);
  return {
    win,
    doc,
    stage,
    track,
    cards,
    groups,
    setScroll(y: number) {
      scrollY = y;
      win.dispatchEvent(new win.Event('scroll'));
      flushRaf();
    },
    flushRaf,
  };
}

describe('资源页 /resources/ 曲面投影、3D 字效与交互', () => {
  it('Shopify 弯曲跑道数学：t=0 齐平 2D，t=1 上弯透视收拢，逆投影与铰链旋转精确匹配', () => {
    const W = 1440;
    const H = 900;
    const lead = computeLead(H);

    const flat = computeCurveFrame(0, W, H, lead);
    for (const [col, vy] of [[240, 120], [720, 450], [1160, 780]] as const) {
      const p = projectPoint(flat, col, lead + vy, 0)!;
      expect(p).toBeTruthy();
      expect(p.x).toBeCloseTo(col, 1);
      expect(p.y).toBeCloseTo(vy, 1);
      expect(p.th).toBeCloseTo(0, 5);
    }

    const curved = computeCurveFrame(1, W, H, lead);
    const farLeft = projectPoint(curved, 200, lead - 1000, 0)!;
    const nearLeft = projectPoint(curved, 200, lead + 450, 0)!;
    expect(farLeft).toBeTruthy();
    expect(nearLeft).toBeTruthy();
    expect(farLeft.x).toBeGreaterThan(nearLeft.x);
    expect(farLeft.th).toBeGreaterThan(0.4);

    const inv = unprojectPoint(curved, farLeft.x, farLeft.y, 0);
    expect(inv).toBeTruthy();
    expect(inv![0]).toBeCloseTo(200, 0);
    expect(inv![1]).toBeCloseTo(lead - 1000, 0);

    const r1 = lead + 400;
    const tiltRad = (CURVE_CONFIG.tiltDeg * Math.PI) / 180;
    const bot = hingePoint(300, 0, 0, r1, 0, tiltRad);
    const top = hingePoint(300, 220, 0, r1, 0, tiltRad);
    expect(bot).toEqual([300, r1, 0]);
    expect(top[2]).toBeGreaterThan(150);
    expect(top[1]).toBeLessThan(r1);

    const icon0 = cornerIconPaths(0);
    const icon1 = cornerIconPaths(1);
    expect(icon0.hidden).toBe('');
    expect(icon1.hidden.length).toBeGreaterThan(0);
    expect(icon1.curve).not.toBe(icon0.curve);
  });

  it('3D 立体标题弹簧支持悬停单字旋转、邻字波纹扩散及正交立起变换，能力探测无异常', () => {
    const spring = new TitleSpring();
    spring.hover(2, 5, 1);
    expect(spring.moving).toBe(true);
    spring.step(0.04);
    expect(spring.angles[2]).toBeGreaterThan(0.5);
    spring.step(0.08);
    expect(spring.angles[1]).toBeGreaterThan(0);
    expect(spring.angles[3]).toBeGreaterThan(0);

    for (let i = 0; i < 200 && spring.moving; i++) spring.step(0.04);
    expect(spring.moving).toBe(false);
    expect(spring.angles[2]).toBe(0);

    spring.wave(4, 1);
    spring.step(0.02);
    expect(spring.moving).toBe(true);
    spring.step(NaN);
    expect(spring.moving).toBe(false);

    const pos = standingCharPos(400, 12, 48, 0, 1200, 1, Math.PI / 2, 0, 18);
    expect(pos[0]).toBeCloseTo(412, 4);
    expect(pos[1]).toBeCloseTo(1200, 4);
    expect(pos[2]).toBeCloseTo(67, 4);

    const frontPos = standingCharPos(400, 12, 48, 24, 1200, 1, Math.PI / 2, 0, 18);
    expect(frontPos[1]).toBeGreaterThan(pos[1]);

    const wgslSrc = readFileSync(join(ROOT, 'src/scripts/resources-webgpu.ts'), 'utf8');
    const glSrc = readFileSync(join(ROOT, 'src/scripts/resources-gl.ts'), 'utf8');
    expect(CURVE_CONFIG.slabDepth).toBeLessThanOrEqual(10);
    expect(CURVE_CONFIG.cityGrow).toBeLessThanOrEqual(1);
    expect(wgslSrc).toContain('max(12.0, frame.size.x / 60.0)');
    expect(glSrc).toContain('max(12.0, uSize.x / 60.0)');
    expect(wgslSrc).toContain('fn verticalPulse');
    expect(glSrc).toContain('float verticalPulse');
    expect(wgslSrc).toContain("depthWriteEnabled: false, depthCompare: 'always'");
    const meshFragStart = wgslSrc.indexOf('@fragment fn meshFragment');
    const firstIfInFrag = wgslSrc.indexOf('if (in.mode', meshFragStart);
    const sampleInFrag = wgslSrc.indexOf('textureSample(uTex, uSampler, in.uv)', meshFragStart);
    expect(sampleInFrag).toBeGreaterThan(meshFragStart);
    expect(sampleInFrag).toBeLessThan(firstIfInFrag);

    const tokensSrc = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(tokensSrc).toContain('--res-void: #ffffff;');
    expect(tokensSrc).toContain('--res-void-grid: #0d683814;');
    expect(tokensSrc).toContain('--res-void-grid: #ffffff1f;');
    expect(tokensSrc).toContain('--res-void-major: #ffffff42;');
    expect(tokensSrc).toContain('--res-rail-ink: #0a2617;');
    expect(tokensSrc).toContain('--res-inf-color: #6c747a;');
    expect(tokensSrc).toContain('--res-inf-color: #ffffff;');
    expect(existsSync(join(ROOT, 'public/art/inf-starfield.webp'))).toBe(true);

    const cssSrc = readFileSync(join(ROOT, 'src/styles/resources.css'), 'utf8');
    expect(cssSrc).not.toContain('font-style: italic');
    expect(cssSrc).toContain('body.chrome-page.resources-plate .page-inf');

    // 立起模块不压暗页面其余部分；连线与侧边目录半圆按 Shopify 源码在 2D 覆层画布绘制
    expect(wgslSrc).toContain('const bgDim = 1;');
    expect(glSrc).toContain('const bgDim = 1;');
    expect(WIRE_STYLE.width).toBe(0.75);
    expect(WIRE_STYLE.pulseWidth).toBeLessThanOrEqual(0.95);
    expect(RAIL_ARC_CONFIG.pulseSpeedPx).toBe(260);
    expect(RAIL_ARC_CONFIG.holdSec).toBe(0.4);
    expect(RAIL_ARC_CONFIG.pulseWidth).toBeLessThanOrEqual(0.95);
    expect(CURVE_CONFIG.titleScale3D).toBeGreaterThan(1.1);

    // 验证 Shopify 原版半圆几何、中间水平交点（横线）及指数衰减函数
    const semi = buildRailSemicircle({ x: 120, y: 100 }, { x: 120, y: 200 });
    expect(semi.total).toBeCloseTo(Math.PI * 50, 0);
    const midDist = railArcDistAtY(semi, 150);
    expect(midDist).toBeGreaterThan(semi.total * 0.45);
    expect(midDist).toBeLessThan(semi.total * 0.55);
    expect(railArcPointAt(semi, midDist).x).toBeGreaterThan(165);
    expect(expApproach(1, 0, 0.14, 0.14)).toBeCloseTo(0.5, 4);

    const hFlat = wireHandle({ x: 100, y: 400 }, { x: 400, y: 400 });
    const hSteep = wireHandle({ x: 100, y: 400 }, { x: 200, y: 700 });
    expect(hFlat).toBeCloseTo(0.44, 4);
    expect(hSteep).toBeLessThan(hFlat);
    expect(wireBezierPoint({ x: 100, y: 400 }, { x: 400, y: 200 }, hFlat, 0)).toEqual({ x: 100, y: 400 });
    expect(wireBezierPoint({ x: 100, y: 400 }, { x: 400, y: 200 }, hFlat, 1)).toEqual({ x: 400, y: 200 });
    expect(wireFadeWeight(0.5)).toBeCloseTo(WIRE_STYLE.fadeMid, 4);
    expect(wireFadeWeight(0)).toBeCloseTo(1, 4);

    // 平面卡片不产生遮挡壳，仅立起模块生成投影遮挡多边形与深度平面
    const curvedFrame = computeCurveFrame(1, 1280, 800);
    expect(
      computeRaisedCovers(curvedFrame, [{ id: 0, x0: 240, x1: 1040, r0: curvedFrame.lead + 120, r1: curvedFrame.lead + 520, elev: 8, tiltRad: 0 }]),
    ).toHaveLength(0);
    const raisedCovs = computeRaisedCovers(curvedFrame, [
      { id: 0, x0: 240, x1: 1040, r0: curvedFrame.lead + 120, r1: curvedFrame.lead + 520, elev: 8, tiltRad: 0.9 },
    ]);
    expect(raisedCovs).toHaveLength(1);
    expect(raisedCovs[0].ring.length).toBeGreaterThanOrEqual(16);
    expect(Number.isFinite(raisedCovs[0].depthAt(640, 400))).toBe(true);

    // 立体字侧面采用 Marching Squares 连续实心浅灰挤出（无切片条纹），3D 下平滑放大并在 2D 还原 1x
    const sceneSrc = readFileSync(join(ROOT, 'src/scripts/resources-scene-data.ts'), 'utf8');
    expect(sceneSrc).toContain('const sideGray = 0.72;');
    expect(sceneSrc).toContain('emitStandingTitleWalls');
    expect(sceneSrc).toContain('CURVE_CONFIG.titleScale3D');
    expect(sceneSrc).not.toContain('depthSlices');

    // 合成一个 16x16 实心方块位图，验证 Marching Squares 正确提取闭合轮廓线段
    const imgW = 16;
    const imgH = 16;
    const rgba = new Uint8ClampedArray(imgW * imgH * 4);
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) {
        rgba[(y * imgW + x) * 4 + 3] = 255;
      }
    }
    const segs = extractGlyphOutlineSegments(rgba, imgW, imgH, 0, imgW, imgH, 64, -10, 54);
    expect(segs.length).toBeGreaterThanOrEqual(16 * 4);

    const spots = computeCardHotspots({
      id: 0,
      el: null as unknown as HTMLElement,
      x0: 0,
      x1: 560,
      docTop: 0,
      docBottom: 410,
      width: 560,
      height: 410,
      name: 'Demo',
      summary: 'Summary',
      detail: '查看 [官方文档](https://excalidraw.com/docs) 或直接访问 https://squoosh.app/。',
      badge: 'Windows',
      cta: '前往获取',
      code: 'nced',
      href: 'https://example.com',
      tags: ['A'],
      coverUrl: '',
      images: ['/resources/covers/demo-1.webp'],
      wide: false,
      groupIdx: 0,
    });
    expect(spots.inner.w).toBeGreaterThan(200);
    expect(spots.inner.h).toBeGreaterThan(100);
    expect(spots.cta.w).toBeGreaterThan(90);
    expect(spots.copy?.w).toBeGreaterThan(100);
    expect(spots.detailLinks).toHaveLength(2);
    expect(spots.detailLinks[0].href).toBe('https://excalidraw.com/docs');
    expect(spots.detailLinks[0].label).toBe('官方文档');
    expect(spots.detailLinks[1].href).toBe('https://squoosh.app/');
    expect(spots.detailLinks[0].rect.x).toBeGreaterThanOrEqual(spots.inner.x);
    expect(spots.detailLinks[0].rect.y).toBeGreaterThanOrEqual(spots.inner.y);

    // 验证模块内容富文本解析：支持 Markdown 链接、裸网址智能去标点、内联图片，且拦截危险协议
    const parsed = parseResourceDetail(
      '文档见 [主页](https://example.com/a)，镜像 https://dl.example.com/pkg.zip）；配图 ![界面](/resources/covers/ui.webp) [坏链](javascript:alert(1))',
    );
    expect(parsed.segments.filter((s) => s.kind === 'link')).toEqual([
      { kind: 'link', label: '主页', href: 'https://example.com/a' },
      { kind: 'link', label: 'https://dl.example.com/pkg.zip', href: 'https://dl.example.com/pkg.zip' },
    ]);
    expect(parsed.inlineImages).toEqual([{ alt: '界面', src: '/resources/covers/ui.webp' }]);

    expect(typeof isHtmlInCanvasSupported()).toBe('boolean');
  });

  it('content/pages/resources.md 通过 schema 且包含有效分类与资源条目', () => {
    const { fields } = readPost(readFileSync(join(ROOT, 'content/pages/resources.md'), 'utf8'));
    const parsed = resourcesPageSchema.parse(fields);
    expect(parsed.groups.length).toBeGreaterThanOrEqual(1);
    expect(parsed.groups.every((g) => g.title.trim().length > 0)).toBe(true);
    expect(parsed.groups.reduce((sum, g) => sum + g.items.length, 0)).toBeGreaterThan(0);
  });

  it('schema 支持空分类、提取码与站内封面，并拒绝非法协议与超量标签', () => {
    const valid = resourcesPageSchema.parse({
      title: '资源',
      intro: '测试导语',
      groups: [
        {
          title: '应用与安装包',
          items: [
            {
              name: 'Demo',
              href: 'https://dl.northcedar.top/demo.zip',
              summary: '示例安装包',
              code: 'abcd',
              cover: '/resources/covers/demo.webp',
              images: ['/resources/covers/shot-1.webp', 'https://example.com/shot-2.png'],
              tags: ['效率', 'Windows'],
            },
          ],
        },
        { title: '待整理空分类', items: [] },
      ],
    });
    expect(valid.groups).toHaveLength(2);
    expect(valid.groups[0].items[0].images).toHaveLength(2);
    expect(valid.groups[1].items).toEqual([]);

    expect(() =>
      resourcesPageSchema.parse({
        groups: [
          {
            title: 'A',
            items: [
              {
                name: 'TooManyImgs',
                href: 'https://example.com',
                summary: 'x',
                images: ['/a.webp', '/b.webp', '/c.webp', '/d.webp', '/e.webp'],
              },
            ],
          },
        ],
      }),
    ).toThrow();

    expect(() => resourcesPageSchema.parse({ groups: [] })).toThrow();
    expect(() =>
      resourcesPageSchema.parse({
        groups: [{ title: 'A', items: [{ name: 'Bad', href: 'javascript:alert(1)', summary: 'x' }] }],
      }),
    ).toThrow();
    expect(() =>
      resourcesPageSchema.parse({
        groups: [
          {
            title: 'A',
            items: [{ name: 'Tags', href: 'https://example.com', summary: 'x', tags: ['1', '2', '3', '4', '5'] }],
          },
        ],
      }),
    ).toThrow();
  });

  it('顶部 2D 平铺，下滑 800ms 丝滑进入 3D，按钮与 ` 键可就地丝滑切换并驱动角标形变', async () => {
    const f = await setupRunwayFixture();
    const toggle = f.doc.querySelector<HTMLButtonElement>('[data-dim-toggle]')!;
    const label = toggle.querySelector<HTMLElement>('[data-dim-label]')!;
    const hiddenPath = toggle.querySelector<SVGPathElement>('[data-svg-hidden]')!;

    expect(f.stage.dataset.stageMode).toBe('3d');
    expect(f.stage.style.getPropertyValue('--res-t')).toBe('0.0000');
    expect(f.stage.style.getPropertyValue('--runway-tilt')).toBe('0.00deg');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(label.textContent).toBe('立体视图');
    expect(hiddenPath.getAttribute('d')).toBe('');

    f.setScroll(300);
    expect(f.stage.style.getPropertyValue('--res-t')).toBe('1.0000');
    expect(f.stage.style.getPropertyValue('--runway-tilt')).toBe('46.00deg');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(label.textContent).toBe('平面视图');
    expect(hiddenPath.getAttribute('d')).not.toBe('');

    toggle.click();
    f.flushRaf();
    expect(f.stage.style.getPropertyValue('--res-t')).toBe('0.0000');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(label.textContent).toBe('立体视图');

    f.doc.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: '`', code: 'Backquote', bubbles: true }) as unknown as Event);
    f.flushRaf();
    expect(f.stage.style.getPropertyValue('--res-t')).toBe('1.0000');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('点击卡片原地立起不触发滚动跳转，随滚动渐进放平；半圆连接弧仅悬停显示；搜索实时筛选', async () => {
    const f = await setupRunwayFixture();
    f.setScroll(600);

    const railArcs = f.doc.querySelector<HTMLCanvasElement>('[data-res-rail-arcs]')!;
    const railBtns = [...f.doc.querySelectorAll<HTMLButtonElement>('[data-rail-target]')];
    // 常态无半圆；悬停目录项生成活跃半圆；移开后停留 0.4s 并按 0.14s 半衰期平滑擦除淡出（约 1.5s 后归零）
    expect(railArcs.dataset.railArcCount ?? '0').toBe('0');
    railBtns[1].dispatchEvent(new f.win.Event('pointerenter'));
    f.flushRaf(15);
    expect(Number(railArcs.dataset.railArcCount)).toBe(1);
    // 移开 0.48s（30 帧）时仍在停留/衰落过程中，不会立刻消失
    railBtns[1].dispatchEvent(new f.win.Event('pointerleave'));
    f.flushRaf(30);
    expect(Number(railArcs.dataset.railArcCount)).toBe(1);
    // 经过约 1.6s（100 帧）后完全衰减收净
    f.flushRaf(100);
    expect(Number(railArcs.dataset.railArcCount)).toBe(0);

    const [card0, card1] = f.cards;
    const scrollBeforeClick = f.win.scrollY;
    card0.click();
    expect(f.win.scrollY).toBe(scrollBeforeClick);
    expect(card0.dataset.raised).toBe('true');
    expect(card0.getAttribute('aria-expanded')).toBe('true');
    expect(f.stage.dataset.hasRaised).toBe('true');

    // 点击立起卡片中间内容区保持立起，点击外围边框区则放下
    card0.querySelector<HTMLElement>('.res-stage-desc')!.click();
    expect(card0.dataset.raised).toBe('true');

    // 小幅滚动时卡片保持立起状态并随滚动渐进放低，不会一下就收起
    f.setScroll(480);
    expect(card0.dataset.raised).toBe('true');

    // 继续滚动超过淡出距离（tiltFade * H = 520px）后平滑放平并清理状态
    f.setScroll(40);
    expect(card0.dataset.raised).toBeUndefined();
    expect(card0.getAttribute('aria-expanded')).toBe('false');
    expect(f.stage.dataset.hasRaised).toBeUndefined();

    // 再次点击另一张卡片仍不跳转；Esc 可放下
    card1.click();
    expect(f.win.scrollY).toBe(40);
    expect(card1.dataset.raised).toBe('true');
    f.doc.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event);
    expect(card1.dataset.raised).toBeUndefined();

    // 点击立起卡片的外框区域（非中间展示框）直接放下
    card0.click();
    expect(card0.dataset.raised).toBe('true');
    card0.click();
    expect(card0.dataset.raised).toBeUndefined();

    card0.click();
    f.stage.click();
    expect(card0.dataset.raised).toBeUndefined();

    const search = f.doc.querySelector<HTMLInputElement>('[data-res-search]')!;
    const clear = f.doc.querySelector<HTMLButtonElement>('[data-res-clear]')!;
    const count = f.doc.querySelector<HTMLElement>('[data-res-count]')!;
    const empty = f.doc.querySelector<HTMLElement>('[data-res-empty]')!;

    search.value = 'epub';
    search.dispatchEvent(new f.win.Event('input'));
    expect(f.cards.map((c) => c.hidden)).toEqual([true, true, false]);
    expect(f.groups.map((g) => g.hidden)).toEqual([true, false]);
    expect(count.textContent).toBe('筛出 1 / 3 项');
    expect(clear.hidden).toBe(false);
    expect(empty.hidden).toBe(true);

    search.value = 'not-found-keyword';
    search.dispatchEvent(new f.win.Event('input'));
    expect(empty.hidden).toBe(false);

    clear.click();
    expect(f.cards.every((c) => !c.hidden)).toBe(true);
    expect(f.groups.every((g) => !g.hidden)).toBe(true);
    expect(count.textContent).toBe('共 3 项');
  });

  it('两侧精简 3D 装饰（8 种可拖转大模型、少量翻滚方块、稀疏动态公式，无杂乱陈列小模型）与底部冲刺小游戏逻辑完备', () => {
    expect(FLOAT_SHAPES).toHaveLength(8);
    for (const shape of FLOAT_SHAPES) {
      const edges = getPolyhedronEdges(shape, 1.25);
      expect(edges.length).toBeGreaterThan(8);
    }

    expect(MATH_FORMULAS).toHaveLength(6);
    for (const f of MATH_FORMULAS) {
      expect(Number.isFinite(f.evalY(0.35, 1.2))).toBe(true);
    }

    const props = new SidePropsController();
    props.ensureLayout(3200);
    expect(props.getFloatsCount()).toBe(8);
    expect(props.getCubesCount()).toBeGreaterThanOrEqual(3);
    // 每个区块严格仅放 1 个独立小方块（与 Shopify `o.row(m, 1, M, v, n)` 一致，永不互相碰撞）
    expect(new Set(props.getCubeClusterIds()).size).toBe(props.getCubesCount());

    // 验证悬浮线框恒定细线宽、无大顶点圆点、无陈列小模型，具备 Shopify `Gf` 鼠标扰动弹簧，且方块翻滚步长与自身边长精确一致（不瞬移）
    const propsSrc = readFileSync(join(ROOT, 'src/scripts/resources-props.ts'), 'utf8');
    expect(propsSrc).toContain('ctx.lineWidth = 0.9;');
    expect(propsSrc).toContain('pokeSpring2D');
    expect(propsSrc).toContain('stepSpring2D');
    expect(propsSrc).toContain('(c.gx + 0.5) * s');
    expect(propsSrc).toContain('(c.gy + 0.5) * s');
    expect(propsSrc).not.toContain('STORE_GEOM');
    expect(propsSrc).not.toContain('ctx.arc(');

    // 验证小游戏立式 3D 底部控制台（90° 直立 + start ↑ 悬停 180° 翻转）+ 蜘蛛球中心不动仅外围 10 足弹簧扰动（Shopify Us/hr/yr）
    const gameSrc = readFileSync(join(ROOT, 'src/scripts/resources-game.ts'), 'utf8');
    const runwaySrc = readFileSync(join(ROOT, 'src/scripts/resources-runway.ts'), 'utf8');
    expect(gameSrc).toContain('renderBoard3D');
    expect(gameSrc).toContain('renderFinishBoard3D');
    expect(gameSrc).toContain('renderFinishBand');
    expect(gameSrc).toContain('renderFireworks');
    expect(gameSrc).toContain('drawStandingText');
    expect(gameSrc).toContain('renderAmbientSpiders');
    expect(gameSrc).toContain('renderCourseProps');
    expect(gameSrc).toContain('evalCurvedRamp');
    expect(gameSrc).toContain('evalCardStepZ');
    expect(gameSrc).toContain('evalConveyorPush');
    expect(gameSrc).toContain('getOccludingPaths');
    expect(gameSrc).toContain('solveKneeIK');
    expect(gameSrc).toContain('stepFunnelFall');
    expect(gameSrc).toContain('roundedRectRingPoint');
    expect(gameSrc).toContain('maxVisibleWordChips');
    expect(gameSrc).toContain('resetRunState');
    expect(gameSrc).not.toContain('frame.focusRow');
    // 验证立起卡片 3D 遮挡封面及纸面截断边界 `paperEndDocY` 传给 game.render（纸面在初始球与起点栏之前自然收口）
    expect(runwaySrc).toContain('const occluders = { covers, coverPaths };');
    expect(runwaySrc).toContain('const paperEndDocY = contentEndDocY + 48;');
    expect(runwaySrc).toContain('game.render(ctx, frame, scrollY, paperEndDocY, wireRgb, accentRgb, voidBgHex, isDarkTheme, occluders);');
    expect(gameSrc).toContain('const orbHomeDocY = paperEndDocY + 118;');
    expect(gameSrc).toContain('let barFaceDocY = orbHomeDocY + 215;');
    expect(gameSrc).toContain('stepAmbientSpiderPhysics');
    expect(gameSrc).toContain('nudgeAmbientSpiders');
    expect(gameSrc).toContain('findAmbientNodeAt');
    expect(runwaySrc).toContain('spots.detailLinks.find');
    // 确认加速上限合理克制、不会按 W 过快飞出页面
    expect(GAME_CONFIG.maxSpeed).toBeLessThanOrEqual(1000);
    expect(GAME_CONFIG.cruise).toBeLessThanOrEqual(600);

    const idleGame = new RunwayGameController();
    idleGame.setStartHover(true);
    idleGame.pokeAllLegsRadial();
    expect(idleGame.step(0.05, 1280)).toBe(false);
    expect(idleGame.startTurn).toBeGreaterThan(0);
    // 中心节点 [0..2] 始终为 0（中心绝对不动），外围节点 [3..] 发生弹簧扰动！
    expect(idleGame.nodeOff[0]).toBe(0);
    expect(idleGame.nodeOff[1]).toBe(0);
    expect(idleGame.nodeOff[2]).toBe(0);
    expect(Math.hypot(idleGame.nodeOff[3], idleGame.nodeOff[4], idleGame.nodeOff[5])).toBeGreaterThan(0);

    // 验证渲染一次后可拖动大模型并触发局部高斯扰动弹簧
    const mockCtx = {
      save() {}, restore() {}, transform() {}, fillText() {},
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
      stroke() {}, fill() {}, ellipse() {},
      set strokeStyle(_v: string) {}, set fillStyle(_v: string) {},
      set lineWidth(_v: number) {}, set lineCap(_v: string) {}, set lineJoin(_v: string) {},
      set font(_v: string) {}, set textAlign(_v: string) {}, set textBaseline(_v: string) {},
    } as unknown as CanvasRenderingContext2D;
    const frame = computeCurveFrame(1, 1440, 900);
    props.render(mockCtx, frame, 0, 3200, [], 1, {
      inkRgb: [10, 38, 23],
      voidBgHex: 'rgb(255,255,255)',
      accentRgb: [13, 104, 56],
      isDark: false,
    });
    props.kickFloat(0);
    props.step(0.016);
    expect(props.getFloatAngles(0).yaw).not.toBe(0);
    expect(Math.hypot(props.getFloatWarp(0).wx, props.getFloatWarp(0).wy)).toBeGreaterThan(0);

    expect(gradeForScore(0.6)).toBe('A++');
    expect(gradeForScore(0.49)).toBe('A');
    expect(gradeForScore(0.2)).toBe('D-');

    const game = new RunwayGameController();
    const manyWords = Array.from({ length: 32 }, (_, idx) => ({
      text: `词${idx}`,
      col: 640 + ((idx % 3) - 1) * 40,
      docY: 2150 - idx * 35,
    }));
    game.setPageContent(
      manyWords,
      [{ id: 'g0', label: '应用与安装包', docY: 2080, uX: 0.5, nodeLabels: [] }],
      [{ id: 0, x0: 360, x1: 920, y0: 1450, y1: 1850, top: 28 }],
    );
    game.start(1800);
    expect(game.isActive()).toBe(true);
    expect(game.getAmbientClustersCount()).toBe(1);
    expect(game.getFinishSpidersCount()).toBe(2);
    expect(game.getRampsCount()).toBeGreaterThanOrEqual(2);
    expect(game.getHolesCount()).toBeGreaterThanOrEqual(2);
    expect(game.getHolesCount()).toBeLessThanOrEqual(6);
    expect(game.hasRectangularHole()).toBe(true);
    expect(game.getConveyorsCount()).toBeGreaterThanOrEqual(1);
    // 黑洞宽度大且存在不同尺寸（含长方形大洞）
    const widths = game.getHoleWidths();
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(176);

    // 验证前进、遇到常态大蜘蛛整只融合（体积增大 + 节点融合增足）、二段式 IK 腿伸出抓取单词、卡片台阶抬升
    const startScroll = game.scrollY;
    game.onKeyDown(' ');
    game.onKeyDown('ArrowUp');
    let sawCardStep = false;
    for (let i = 0; i < 36 && game.isActive(); i++) {
      game.hop();
      game.step(0.04, 1280);
      if (game.surfaceZ > 1) sawCardStep = true;
    }
    expect(game.scrollY).toBeLessThan(startScroll);
    expect(game.collected).toBeGreaterThanOrEqual(15);
    expect(game.grow).toBeGreaterThan(1.1);
    expect(game.getTotalLegs()).toBeGreaterThan(GAME_CONFIG.legs + 10);
    expect(sawCardStep).toBe(true);
    // 可见词条受上限约束，超出后旧词条自动消失
    expect(game.getVisibleWordChipsCount()).toBeLessThanOrEqual(GAME_CONFIG.maxVisibleWordChips);

    // 验证按 S / ↓ 能够刹车并向后倒退（scrollY 增大）
    game.onKeyUp('ArrowUp');
    game.onKeyDown('s');
    for (let i = 0; i < 45 && game.isActive(); i++) game.step(0.04, 1280);
    const beforeReverse = game.scrollY;
    game.step(0.05, 1280);
    if (game.isActive()) {
      expect(game.speed).toBeLessThan(0);
      expect(game.scrollY).toBeGreaterThan(beforeReverse);
    }

    // 验证 stop() 后彻底恢复初始状态（身上无残留单词、体积回 1、腿数回 10）
    game.stop();
    expect(game.phase).toBe('idle');
    expect(game.grow).toBe(1);
    expect(game.getTotalLegs()).toBe(GAME_CONFIG.legs);
    expect(game.getVisibleWordChipsCount()).toBe(0);
    expect(game.wordsEaten).toBe(0);
    expect(game.collected).toBe(0);

    // 重新开始一局跑至冲线，验证空中跃过终点线时不瞬移拉回纸面、自然抛物线落地后再升起 3D 终点板！
    game.start(1800);
    game.onKeyDown('ArrowUp');
    let crossedMidAir = false;
    for (let i = 0; i < 450 && game.isActive(); i++) {
      game.hop();
      game.step(0.04, 1280);
      if (game.phase === 'finished' && game.zElev > 5) crossedMidAir = true;
    }
    expect(game.phase).toBe('finished');
    if (crossedMidAir) {
      // 过线下一帧仍在空中，绝不被拉回地面
      game.step(0.016, 1280);
      expect(game.zElev).toBeGreaterThan(0);
    }
    // 冲线落地后再步进，3D 终点栏从纸面丝滑升起到位
    for (let i = 0; i < 55; i++) game.step(0.04, 1280);
    expect(game.getFinishBoardRise()).toBeGreaterThan(0.8);
    expect(game.getHudSnapshot(1280, 0).grade).toMatch(/^[A-D][+-]*$/);

    // 验证常态蜘蛛物理扰动与弹回（Shopify class dh 力导向图）
    game.stop();
    game.pokeAmbientSpider(0);
    game.step(0.04, 1280);
    expect(game.getAmbientNodeDisplacement(0)).toBeGreaterThan(5);

    // 验证页面拉长后障碍物（黑洞、跳板、传送带）自动按总长度等距生成，不受 4 段封顶限制
    const longGame = new RunwayGameController();
    longGame.start(8400);
    expect(longGame.getHolesCount()).toBeGreaterThanOrEqual(8);
    expect(longGame.getConveyorsCount()).toBeGreaterThanOrEqual(3);
    expect(longGame.getRampsCount()).toBeGreaterThanOrEqual(4);
  });

  it.skipIf(!hasDist)('构建产物输出 /resources/ 宽幅卡片、透明玻璃按钮、3D 标题、底部小游戏控制台且去除页脚', () => {
    const html = readFileSync(join(DIST, 'resources', 'index.html'), 'utf8');
    expect(html).toContain('data-resources-page');
    expect(html).toContain('data-res-canvas');
    expect(html).toContain('data-res-wires');
    expect(html).toContain('data-dim-toggle');
    expect(html).toContain('res-dim-toggle liquid-glass liquid-glass--player');
    expect(html).not.toContain('data-res-popup');
    expect(html).not.toContain('data-res-close');
    expect(html).not.toContain('res-detail');
    expect(html).not.toContain('往下滑动展开立体跑道');
    expect(html).toContain('data-res-rail-arcs');
    expect(html).toContain('res-rail-label');
    expect(html).toContain('data-res-title3d');
    expect(html).toContain('res-card-wide');
    expect(html).toContain('data-res-game-dock');
    expect(html).toContain('start ↑');
    expect(html).toContain('to the finish');
    expect(html).not.toContain('<footer class="foot"');
    const { fields: pageFields } = readPost(readFileSync(join(ROOT, 'content/pages/resources.md'), 'utf8'));
    const pageData = resourcesPageSchema.parse(pageFields);
    for (const group of pageData.groups) {
      expect(html).toContain(group.title);
    }

    const forgeIdx = html.indexOf('href="/forge/"');
    const resIdx = html.indexOf('href="/resources/"');
    expect(forgeIdx).toBeGreaterThan(-1);
    expect(resIdx).toBeGreaterThan(forgeIdx);
    expect(html).toContain('>Vault</span>');
  });
});
