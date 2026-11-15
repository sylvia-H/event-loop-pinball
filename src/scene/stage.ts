// 3D 場景：一台常駐的彈珠台。畫面完全由 viewAt(run, t) 決定；
// 唯一不由 t 驅動的是亮著的管線上流動的光點與指標的視差（環境動畫）。
// 三個 draw call：星空、線段批次（軌道、輸送帶、玻璃管、機械臂、掛勾、殘影）、
// 貼片批次（彈珠、夾爪、軸心、取球點、倒數弧）。
// 沒有變化就不排 rAF。

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  ARM_REST,
  BALL_R,
  HUB,
  IMMEDIATE,
  LANE_INFO,
  MACRO,
  MICRO,
  STACK,
  TICK,
  TIMERS,
  TIMER_DROP_DEG,
  immediateSlot,
  macroSlot,
  microSlot,
  tickSlot,
  timerSlot,
} from '../core/geometry.ts';
import type { BallKind, Lane, MachineView, Run } from '../core/types.ts';
import { viewAt } from '../core/view.ts';
import {
  BELT_PITCH,
  BELT_WAVE_SLATS,
  KIND_BALL,
  KIND_GRIP,
  KIND_HUB,
  KIND_JOINT,
  KIND_MARK,
  KIND_TIMER,
  RAIL_WAVE,
  SEG_BELT,
  SEG_DASH,
  SEG_FILL,
  SEG_PLAIN,
  SEG_RAIL,
  SEG_TRAIL,
  segFrag,
  segVert,
  spriteFrag,
  spriteVert,
  starFrag,
  starVert,
} from './shaders.ts';

export interface StageHooks {
  /** 指標指到／離開彈珠（BallView.id） */
  onHover(ballId: string | null): void;
}

type RGB = readonly [number, number, number];

const C_BALL: Record<BallKind, RGB> = {
  sync: [0.92, 0.95, 1.0],
  micro: [0.45, 0.9, 1.0],
  macro: [1.0, 0.78, 0.25],
  tick: [0.78, 0.6, 1.0],
  immediate: [1.0, 0.55, 0.3],
};
const C_LANE: Record<Lane, RGB> = {
  stack: [0.78, 0.88, 1.0],
  micro: [0.4, 0.88, 1.0],
  macro: [1.0, 0.76, 0.24],
  timers: [1.0, 0.84, 0.45],
  tick: [0.76, 0.58, 1.0],
  immediate: [0.92, 0.52, 0.22],
};
const C_ARM: RGB = [0.86, 0.93, 1.0];
/** 沒亮的部件偏向這個冷灰色，只留一點點自己的顏色 */
const C_DIM: RGB = [0.5, 0.58, 0.78];
/** 沒亮的部件剩多少亮度 */
const DIM = 0.16;
/** 管線名稱沒亮時的不透明度 */
const LANE_LABEL_DIM = 0.35;

const FOV = 20;
const TAN_HALF = Math.tan((FOV * Math.PI) / 360);
/** 整台機器的範圍（geometry.ts 的約定）與四周留給標籤的餘裕 */
const HALF_X = 7.2;
const HALF_Y = 4.2;
const MARGIN = 0.45;

const MAX_SPRITES = 256;
const MAX_SEGS = 768;
const RAD = Math.PI / 180;

/** 殘影：拿 t 往回這麼多的位置當尾巴 */
const TRAIL_DT = 0.06;
const TRAIL_MAX = 1.5;
/** setT 之後這段時間內算「動畫進行中」，流動的光點會動 */
const PLAY_HOLD_MS = 400;
/** 光點沿軌道跑的速度（機器單位／秒） */
const FLOW_SPEED: Record<FlowLane, number> = { micro: 1.5, tick: 1.3, macro: 0.9, immediate: 0.8 };
const FLOW_WAVE: Record<FlowLane, number> = {
  micro: RAIL_WAVE,
  tick: RAIL_WAVE,
  macro: BELT_PITCH * BELT_WAVE_SLATS,
  immediate: BELT_PITCH * BELT_WAVE_SLATS,
};
type FlowLane = 'micro' | 'tick' | 'macro' | 'immediate';
const FLOW_LANES: readonly FlowLane[] = ['micro', 'tick', 'macro', 'immediate'];

/** 輸送帶兩條邊離中線多遠 */
const MACRO_HALF = 0.22;
const IMMEDIATE_HALF = 0.15;
/** 計時器架的橫桿比掛著的彈珠高多少 */
const RAIL_UP = 0.56;
const MIN_HOOKS = 4;
/** 標籤離彈珠邊緣幾個像素 */
const LABEL_PAD = 5;
/** 並排的兩個標籤之間至少留幾個像素 */
const LABEL_GAP = 8;
/** 標籤撞到東西時依序改試的方向（相對原本的方向轉幾度） */
const LABEL_TURNS = [0, 45, -45, 90, -90, 135, -135, 180];

interface Pt {
  x: number;
  y: number;
}
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface Disc {
  x: number;
  y: number;
  r: number;
}
/** 一條折線與每個點沿線的累積長度；scale 把累積長度縮放到花紋首尾剛好接上 */
interface Poly {
  xy: number[];
  s: number[];
  scale: number;
}
interface Tag {
  el: HTMLSpanElement;
  text: string;
  w: number;
  h: number;
  opacity: string;
  transform: string;
}

const rnd = (seed: number, i: number): number => {
  const v = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** 沒亮時是偏灰的淡輪廓，亮起時是部件自己的顏色 */
const tint = (c: RGB, lit: number): [number, number, number] => {
  const k = clamp01(lit);
  const d = DIM * (1 - k);
  return [
    (C_DIM[0] * 0.6 + c[0] * 0.4) * d + c[0] * k,
    (C_DIM[1] * 0.6 + c[1] * 0.4) * d + c[1] * k,
    (C_DIM[2] * 0.6 + c[2] * 0.4) * d + c[2] * k,
  ];
};

/** 橢圓上從 fromDeg 到 toDeg 的一段弧，切成 n 段 */
const arcPoly = (cx: number, cy: number, rx: number, ry: number, fromDeg: number, toDeg: number, n: number): Poly => {
  const xy: number[] = [];
  const s: number[] = [];
  let acc = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= n; i++) {
    const a = (fromDeg + ((toDeg - fromDeg) * i) / n) * RAD;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    if (i > 0) acc += Math.hypot(x - px, y - py);
    xy.push(x, y);
    s.push(acc);
    px = x;
    py = y;
  }
  return { xy, s, scale: 1 };
};

/** 封閉的軌道：把累積長度縮放成 wave 的整數倍，花紋繞一圈回來才接得上 */
const closed = (poly: Poly, wave: number): Poly => {
  const total = poly.s[poly.s.length - 1] ?? 0;
  if (total <= 0) return poly;
  return { ...poly, scale: (Math.max(1, Math.round(total / wave)) * wave) / total };
};

const EMPTY_VIEW: MachineView = {
  balls: [],
  lit: { stack: 0, micro: 0, macro: 0, timers: 0, tick: 0, immediate: 0 },
  arm: { x: ARM_REST.x, y: ARM_REST.y, grip: 0, lit: 0 },
  outputCount: 0,
  timerLeft: {},
};

/** 一個 instanced quad 批次：每個屬性一條 Float32Array，每幀重填 */
class Batch {
  readonly geo = new InstancedBufferGeometry();
  readonly mesh: Mesh;
  private readonly attrs: { arr: Float32Array; attr: InstancedBufferAttribute }[] = [];
  private readonly stride: number;
  private readonly cap: number;
  count = 0;

  /** 每個屬性都是 vec4 */
  constructor(cap: number, names: string[], material: ShaderMaterial) {
    this.cap = cap;
    this.stride = names.length * 4;
    const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    this.geo.setAttribute('position', new BufferAttribute(quad, 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    for (const name of names) {
      const arr = new Float32Array(cap * 4);
      const attr = new InstancedBufferAttribute(arr, 4);
      attr.setUsage(DynamicDrawUsage);
      this.geo.setAttribute(name, attr);
      this.attrs.push({ arr, attr });
    }
    this.geo.instanceCount = 0;
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
  }

  /** 依屬性宣告的順序攤平寫入一筆 */
  push(values: number[]): void {
    if (this.count >= this.cap) return;
    const base = this.count * 4;
    for (let o = 0; o < this.stride; o++) {
      const a = this.attrs[o >> 2];
      if (a) a.arr[base + (o & 3)] = values[o] ?? 0;
    }
    this.count++;
  }

  flush(): void {
    for (const a of this.attrs) a.attr.needsUpdate = true;
    this.geo.instanceCount = this.count;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

const additive = (vertexShader: string, fragmentShader: string, uniforms: ShaderMaterial['uniforms']) =>
  new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    blending: AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

export class Stage {
  private readonly canvas: HTMLCanvasElement;
  private readonly labels: HTMLElement;
  private readonly hooks: StageHooks;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 400);
  private readonly uPx = { value: 0.01 };
  private readonly uStarScale = { value: 1 };
  private readonly spriteMat: ShaderMaterial;
  private readonly segMat: ShaderMaterial;
  private readonly starMat: ShaderMaterial;
  private readonly sprites: Batch;
  private readonly segs: Batch;
  private readonly starGeo = new BufferGeometry();
  private readonly ro: ResizeObserver;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly v3 = new Vector3();

  // 靜態的機器：建構時照 geometry.ts 算好折線，每幀只換顏色
  private readonly polyMicro = closed(arcPoly(HUB.x, HUB.y, MICRO.r, MICRO.r, 0, 360, 72), RAIL_WAVE);
  private readonly polyTick = closed(arcPoly(HUB.x, HUB.y, TICK.r, TICK.r, 0, 360, 48), RAIL_WAVE);
  private readonly polyMacro = closed(
    arcPoly(HUB.x, HUB.y, MACRO.rx, MACRO.ry, 0, 360, 120),
    BELT_PITCH * BELT_WAVE_SLATS,
  );
  // 支線的隊伍往 from 那一端前進，所以折線從 to 畫回 from，光點才會往取球點流
  private readonly polyImmediate = arcPoly(
    HUB.x, HUB.y, IMMEDIATE.rx, IMMEDIATE.ry, IMMEDIATE.to, IMMEDIATE.from, 32,
  );

  private run: Run | null = null;
  private t = 0;
  private hl: ReadonlySet<string> | null = null;
  private view: MachineView = EMPTY_VIEW;
  /** 每顆彈珠在 t − TRAIL_DT 的位置（畫殘影用） */
  private readonly before = new Map<string, Pt>();
  private viewStale = true;
  private hookCount = MIN_HOOKS;

  private w = 1;
  private h = 1;
  private dist = 30;
  private raf = 0;
  private last = 0;
  private disposed = false;

  private timeScale = 0;
  private tChangedAt = -1e9;
  private readonly phase: Record<FlowLane, number> = { micro: 0, tick: 0, macro: 0, immediate: 0 };
  private pointerIn = false;
  private ndc: Pt = { x: 0, y: 0 };
  private cam: Pt = { x: 0, y: 0 };

  private hits: { id: string; sx: number; sy: number; r: number }[] = [];
  private hoverId: string | null = null;

  private readonly tags = new Map<string, Tag>();

  constructor(canvas: HTMLCanvasElement, labels: HTMLElement, hooks: StageHooks) {
    this.canvas = canvas;
    this.labels = labels;
    this.hooks = hooks;

    // WebGL 不可用時這裡會 throw，由呼叫端顯示替代內容
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0x07080c, 1);

    this.spriteMat = additive(spriteVert, spriteFrag, { uPx: this.uPx });
    this.segMat = additive(segVert, segFrag, { uPx: this.uPx });
    this.starMat = additive(starVert, starFrag, { uScale: this.uStarScale });

    const starCount = 260;
    const pos = new Float32Array(starCount * 3);
    const size = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      pos[i * 3] = (rnd(1.37, i) - 0.5) * 44;
      pos[i * 3 + 1] = (rnd(2.71, i) - 0.5) * 28;
      pos[i * 3 + 2] = -5 - rnd(3.19, i) * 28;
      size[i] = 0.25 + rnd(4.43, i) * 0.75;
    }
    this.starGeo.setAttribute('position', new BufferAttribute(pos, 3));
    this.starGeo.setAttribute('aSize', new BufferAttribute(size, 1));
    const stars = new Points(this.starGeo, this.starMat);
    stars.frustumCulled = false;

    this.segs = new Batch(MAX_SEGS, ['iAB', 'iColor', 'iParam', 'iExtra', 'iNb'], this.segMat);
    this.sprites = new Batch(MAX_SPRITES, ['iPosSize', 'iColor', 'iParam'], this.spriteMat);
    this.scene.add(stars, this.segs.mesh, this.sprites.mesh);

    canvas.addEventListener('pointerenter', this.onEnter);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointercancel', this.onLeave);
    canvas.addEventListener('pointermove', this.onMove);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.motion.addEventListener('change', this.invalidate);

    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  /** 換一段程式（或自己發球後更新）；機器不重建，只換彈珠 */
  setRun(run: Run): void {
    this.run = run;
    let hooks = MIN_HOOKS;
    for (const st of run.states) hooks = Math.max(hooks, st.timers.length);
    this.hookCount = hooks;
    for (const [id, tag] of this.tags) {
      if (id.startsWith('ball:')) {
        tag.el.remove();
        this.tags.delete(id);
      }
    }
    this.viewStale = true;
    this.invalidate();
  }

  setT(t: number): void {
    if (t === this.t) return;
    this.t = t;
    this.tChangedAt = performance.now();
    this.viewStale = true;
    this.invalidate();
  }

  /** 亮起指定的彈珠，其餘變淡；null 還原 */
  setHighlight(ids: ReadonlySet<string> | null): void {
    this.hl = ids && ids.size > 0 ? ids : null;
    this.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerenter', this.onEnter);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('pointercancel', this.onLeave);
    c.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.motion.removeEventListener('change', this.invalidate);
    for (const tag of this.tags.values()) tag.el.remove();
    this.tags.clear();
    this.sprites.dispose();
    this.segs.dispose();
    this.starGeo.dispose();
    this.spriteMat.dispose();
    this.segMat.dispose();
    this.starMat.dispose();
    this.renderer.dispose();
  }

  // ---- 排程 ----

  private readonly invalidate = (): void => {
    if (this.raf || this.disposed || document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  private readonly onVisibility = (): void => {
    if (!document.hidden) this.invalidate();
  };

  private readonly resize = (): void => {
    const box = this.canvas.parentElement ?? this.canvas;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w < 2 || h < 2) return;
    this.w = w;
    this.h = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // 整台機器加上標籤的餘裕要完整放進畫面：看寬高哪一邊先頂到
    this.dist = Math.max((HALF_Y + MARGIN) / TAN_HALF, (HALF_X + MARGIN) / (TAN_HALF * aspect));
    this.uPx.value = (2 * TAN_HALF * this.dist) / (h * dpr);
    this.uStarScale.value = h * dpr * 0.12;
    // 字型或字級可能跟著版面變了，標籤的大小重新量
    for (const tag of this.tags.values()) tag.w = -1;
    this.invalidate();
  };

  // ---- 指標 ----

  private readonly onEnter = (): void => {
    this.pointerIn = true;
    this.invalidate();
  };

  private readonly onLeave = (): void => {
    this.pointerIn = false;
    this.setHover(null);
    this.invalidate();
  };

  private readonly onMove = (e: PointerEvent): void => {
    this.pointerIn = true;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    this.ndc = { x: (px / Math.max(r.width, 1)) * 2 - 1, y: -((py / Math.max(r.height, 1)) * 2 - 1) };
    let best: string | null = null;
    let bestD = Infinity;
    for (const hit of this.hits) {
      const d = Math.hypot(hit.sx - px, hit.sy - py);
      if (d <= hit.r && d < bestD) {
        best = hit.id;
        bestD = d;
      }
    }
    this.setHover(best);
    this.invalidate();
  };

  private setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    const cursor = id ? 'pointer' : '';
    if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
    this.hooks.onHover(id);
  }

  // ---- 每幀 ----

  private toScreen(x: number, y: number): Pt {
    const v = this.v3.set(x, y, 0).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** t 或 run 變了才重算畫面；環境動畫的幀沿用上一次的結果 */
  private refreshView(): void {
    if (!this.viewStale) return;
    this.viewStale = false;
    this.before.clear();
    if (!this.run) {
      this.view = EMPTY_VIEW;
      return;
    }
    this.view = viewAt(this.run, this.t);
    for (const b of viewAt(this.run, Math.max(0, this.t - TRAIL_DT)).balls) this.before.set(b.id, { x: b.x, y: b.y });
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const raw = this.last ? (now - this.last) / 1000 : 0;
    const dt = Math.min(0.05, raw);
    this.last = now;
    const reduced = this.motion.matches;
    this.refreshView();
    const view = this.view;

    // 環境時間：只在指標在場景上或時間軸正在走的時候前進，而且只推亮著的管線
    const playing = now - this.tChangedAt < PLAY_HOLD_MS;
    const target = !reduced && (this.pointerIn || playing) ? 1 : 0;
    // 收尾用沒有夾過的間隔：畫得慢的機器也會在固定的時間內停下來，不會拖著 rAF
    this.timeScale += (target - this.timeScale) * Math.min(1, raw * 5);
    if (target === 0 && this.timeScale < 0.002) this.timeScale = 0;
    let flowLit = 0;
    for (const lane of FLOW_LANES) {
      const lit = clamp01(view.lit[lane]);
      flowLit = Math.max(flowLit, lit);
      this.phase[lane] = (this.phase[lane] + dt * this.timeScale * lit * FLOW_SPEED[lane]) % FLOW_WAVE[lane];
    }

    // 相機視差（很輕，機器本身幾乎不動，動的是後面的星空）
    const cx = this.pointerIn && !reduced ? this.ndc.x * 0.7 : 0;
    const cy = this.pointerIn && !reduced ? this.ndc.y * 0.45 : 0;
    const k = reduced ? 1 : Math.min(1, dt * 6);
    this.cam.x += (cx - this.cam.x) * k;
    this.cam.y += (cy - this.cam.y) * k;
    const camMoving = Math.abs(cx - this.cam.x) + Math.abs(cy - this.cam.y) > 0.002;
    this.camera.position.set(this.cam.x, this.cam.y, this.dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    this.fill(view);
    this.renderer.render(this.scene, this.camera);

    const flowing = flowLit > 0.02 && (target === 1 || this.timeScale > 0);
    if (flowing || camMoving) this.invalidate();
    else this.last = 0;
  };

  private fill(view: MachineView): void {
    const sprites = this.sprites;
    const segs = this.segs;
    sprites.count = 0;
    segs.count = 0;
    this.hits = [];
    const pxPerUnit = this.h / (2 * TAN_HALF * this.dist);
    const used = new Set<string>();
    const lit = view.lit;

    const seg = (
      ax: number, ay: number, bx: number, by: number, c: RGB, alpha: number,
      width: number, mode: number, hw: number, glow = 0, s0 = 0, p1 = 0, p2 = 0, scale = 1,
      // 前一點與後一點（折線的接縫用它們斜接）；單獨一段時就是自己往兩頭延伸
      px = ax * 2 - bx, py = ay * 2 - by, nx = bx * 2 - ax, ny = by * 2 - ay,
    ) => segs.push([ax, ay, bx, by, c[0], c[1], c[2], alpha, width, mode, s0, glow, hw, p1, p2, scale, px, py, nx, ny]);
    const poly = (
      p: Poly, c: RGB, alpha: number, width: number, mode: number, hw: number, glow = 0, p1 = 0, p2 = 0,
    ) => {
      const n = p.s.length - 1;
      const at = (i: number, k: number) => p.xy[i * 2 + k] ?? 0;
      const loop = Math.hypot(at(0, 0) - at(n, 0), at(0, 1) - at(n, 1)) < 1e-4;
      for (let i = 0; i < n; i++) {
        const ax = at(i, 0);
        const ay = at(i, 1);
        const bx = at(i + 1, 0);
        const by = at(i + 1, 1);
        // 封閉的軌道首尾相接；開放的折線兩端沒有鄰居，照自己的方向收尾
        const pi = i > 0 ? i - 1 : loop ? n - 1 : -1;
        const ni = i + 2 <= n ? i + 2 : loop ? 1 : -1;
        seg(
          ax, ay, bx, by, c, alpha, width, mode, hw, glow, p.s[i] ?? 0, p1, p2, p.scale,
          pi < 0 ? ax * 2 - bx : at(pi, 0), pi < 0 ? ay * 2 - by : at(pi, 1),
          ni < 0 ? bx * 2 - ax : at(ni, 0), ni < 0 ? by * 2 - ay : at(ni, 1),
        );
      }
    };
    /** 一段圓弧，直接切成實線 */
    const arc = (cx: number, cy: number, r: number, from: number, to: number, n: number, c: RGB, alpha: number, hw: number, glow: number) =>
      poly(arcPoly(cx, cy, r, r, from, to, n), c, alpha, 0.34, SEG_PLAIN, hw, glow);
    const sprite = (
      x: number, y: number, size: number, kind: number, c: RGB, alpha: number, p1 = 0, p2 = 0, p3 = 0, rot = 0,
    ) => sprites.push([x, y, size, rot, c[0], c[1], c[2], alpha, kind, p1, p2, p3]);

    // ── 外圈輸送帶、setImmediate 支線 ──
    poly(this.polyMacro, tint(C_LANE.macro, lit.macro), 1, 1.3, SEG_BELT, 0.017, lit.macro, this.phase.macro, MACRO_HALF);
    poly(
      this.polyImmediate, tint(C_LANE.immediate, lit.immediate), 1, 1.0, SEG_BELT, 0.014,
      lit.immediate, this.phase.immediate, IMMEDIATE_HALF,
    );
    // ── 內圈快軌、超車道 ──
    poly(this.polyMicro, tint(C_LANE.micro, lit.micro), 1, 0.7, SEG_RAIL, 0.024, lit.micro, this.phase.micro);
    poly(this.polyTick, tint(C_LANE.tick, lit.tick), 1, 0.5, SEG_RAIL, 0.015, lit.tick, this.phase.tick);

    // ── 取球點 ──
    const markR = BALL_R + 0.15;
    const marks: [Pt, Lane][] = [
      [microSlot(0), 'micro'], [tickSlot(0), 'tick'], [macroSlot(0), 'macro'], [immediateSlot(0), 'immediate'],
    ];
    // 兩段括弧橫跨軌道（缺口朝軸心與外側），相鄰兩條軌道的標記才不會交叉成一團
    for (const [p, lane] of marks) {
      const rot = Math.atan2(p.y - HUB.y, p.x - HUB.x);
      sprite(p.x, p.y, markR + 0.3, KIND_MARK, tint(C_LANE[lane], lit[lane]), 1, markR, lit[lane], 0, rot);
    }

    // ── 主管：玻璃管的兩條邊、圓底、喇叭形的管口、管身、底座 ──
    {
      const c = tint(C_LANE.stack, lit.stack);
      const g = lit.stack;
      const r = STACK.width / 2;
      const cy = STACK.bottom + r;
      const flare = 0.32;
      const wall = 0.022;
      for (const side of [-1, 1]) {
        const x = STACK.x + side * r;
        seg(x, cy, x, STACK.top, c, 1, 0.34, SEG_PLAIN, wall, g);
        // 管口往外翻：圓心在管壁外側，從管壁頂端轉 90 度
        const from = side < 0 ? 0 : 180;
        arc(x + side * flare, STACK.top, flare, from, from + (side < 0 ? 90 : -90), 24, c, 1, wall, g);
      }
      arc(STACK.x, cy, r, 180, 360, 40, c, 1, wall, g);
      // 管身與左側一道反光，讓它看起來是玻璃
      seg(STACK.x, cy - r * 0.55, STACK.x, STACK.top, c, 0.1 + 0.2 * g, STACK.width, SEG_FILL, 0);
      seg(STACK.x - r + 0.13, cy + 0.15, STACK.x - r + 0.13, STACK.top - 0.35, c, 0.4, 0.2, SEG_PLAIN, 0.012);
      // 底座
      const y0 = STACK.bottom - 0.12;
      const y1 = STACK.bottom - 0.3;
      seg(STACK.x - 0.62, y0, STACK.x + 0.62, y0, c, 0.9, 0.3, SEG_PLAIN, 0.02, g);
      seg(STACK.x - 0.9, y1, STACK.x + 0.9, y1, c, 0.9, 0.3, SEG_PLAIN, 0.02, g);
      seg(STACK.x - 0.62, y0, STACK.x - 0.9, y1, c, 0.9, 0.3, SEG_PLAIN, 0.02, g);
      seg(STACK.x + 0.62, y0, STACK.x + 0.9, y1, c, 0.9, 0.3, SEG_PLAIN, 0.02, g);
    }

    // ── 計時器架：橫桿、一排掛勾、到期後掉上外圈的落點 ──
    {
      const c = tint(C_LANE.timers, lit.timers);
      const g = lit.timers;
      const railY = TIMERS.y + RAIL_UP;
      const first = timerSlot(0);
      const lastHook = timerSlot(this.hookCount - 1);
      seg(first.x + 0.45, railY, lastHook.x - 0.45, railY, c, 1, 0.34, SEG_PLAIN, 0.026, g);
      for (let i = 0; i < this.hookCount; i++) {
        const p = timerSlot(i);
        const end = p.y + BALL_R + 0.1;
        seg(p.x, railY, p.x, end, c, 1, 0.3, SEG_PLAIN, 0.018, g);
        arc(p.x + 0.07, end, 0.07, 180, 330, 6, c, 1, 0.018, 0);
      }
      const drop = {
        x: HUB.x + MACRO.rx * Math.cos(TIMER_DROP_DEG * RAD),
        y: HUB.y + MACRO.ry * Math.sin(TIMER_DROP_DEG * RAD),
      };
      const tip = drop.y + BALL_R + 0.22;
      const top = Math.max(tip + 0.3, TIMERS.y - BALL_R - 0.75);
      seg(drop.x, top, drop.x, tip, c, 0.8, 0.3, SEG_DASH, 0.014);
      seg(drop.x - 0.13, tip + 0.13, drop.x, tip, c, 0.8, 0.3, SEG_PLAIN, 0.016, g);
      seg(drop.x + 0.13, tip + 0.13, drop.x, tip, c, 0.8, 0.3, SEG_PLAIN, 0.016, g);
    }

    // ── 機械臂：軸心、上臂、關節、前臂、夾爪 ──
    {
      const a = view.arm;
      const armLit = clamp01(a.lit);
      const c = tint(C_ARM, armLit);
      const grip = clamp01(a.grip);
      const ringR = BALL_R + 0.15 - 0.06 * grip;
      const dx = a.x - HUB.x;
      const dy = a.y - HUB.y;
      const d = Math.hypot(dx, dy);
      sprite(HUB.x, HUB.y, 0.5, KIND_HUB, c, 1, armLit);
      if (d > 0.05) {
        // 關節往臂的左側凸出去，臂伸得越長凸得越多（不是剛體的連桿，只求看起來有關節）
        const bend = Math.min(0.75, 0.16 * d);
        const ex = HUB.x + dx * 0.5 - (dy / d) * bend;
        const ey = HUB.y + dy * 0.5 + (dx / d) * bend;
        const ux = ex - HUB.x;
        const uy = ey - HUB.y;
        const ul = Math.hypot(ux, uy) || 1;
        const fx = a.x - ex;
        const fy = a.y - ey;
        const fl = Math.hypot(fx, fy) || 1;
        const hubR = Math.min(0.22, ul * 0.4);
        const wrist = Math.min(ringR + 0.1, fl * 0.8);
        seg(
          HUB.x + (ux / ul) * hubR, HUB.y + (uy / ul) * hubR, ex - (ux / ul) * 0.09, ey - (uy / ul) * 0.09,
          c, 1, 0.42, SEG_PLAIN, 0.045, armLit,
        );
        seg(
          ex + (fx / fl) * 0.09, ey + (fy / fl) * 0.09, a.x - (fx / fl) * wrist, a.y - (fy / fl) * wrist,
          c, 1, 0.36, SEG_PLAIN, 0.028, armLit,
        );
        sprite(ex, ey, 0.2, KIND_JOINT, c, 1, 0.09);
        sprite(a.x, a.y, ringR + 0.32, KIND_GRIP, c, 1, ringR, grip, armLit, Math.atan2(fy, fx));
      } else {
        sprite(a.x, a.y, ringR + 0.32, KIND_GRIP, c, 1, ringR, grip, armLit, Math.PI / 2);
      }
    }

    // ── 彈珠 ──
    const discs: Disc[] = [];
    const shown: { i: number; sx: number; sy: number; rp: number; own: number }[] = [];
    for (let i = 0; i < view.balls.length; i++) {
      const b = view.balls[i];
      if (!b || b.alpha < 0.01) continue;
      const c = C_BALL[b.kind];
      const on = this.hl ? this.hl.has(b.id) : false;
      const glow = clamp01(b.glow);
      const bright = (this.hl ? (on ? 1.3 : 0.4) : 1) * (1 + 0.12 * glow);
      const r = BALL_R * b.scale * (on ? 1.06 : 1);
      const rgb: RGB = [c[0] * bright, c[1] * bright, c[2] * bright];

      const prev = this.before.get(b.id);
      if (prev) {
        let tx = prev.x - b.x;
        let ty = prev.y - b.y;
        const len = Math.hypot(tx, ty);
        if (len > 0.03) {
          const cut = Math.min(1, TRAIL_MAX / len);
          tx *= cut;
          ty *= cut;
          seg(b.x, b.y, b.x + tx, b.y + ty, rgb, b.alpha * 0.55 * clamp01(len / 0.25), r * 2, SEG_TRAIL, r * 0.8);
        }
      }
      sprite(b.x, b.y, r * 3.4, KIND_BALL, rgb, b.alpha, r, glow);
      const left = view.timerLeft[b.id];
      if (left !== undefined) {
        const tr = r + 0.07;
        sprite(b.x, b.y, tr + 0.3, KIND_TIMER, tint(C_LANE.timers, 1), b.alpha, tr, clamp01(left), lit.timers);
      }

      const sp = this.toScreen(b.x, b.y);
      const rp = r * pxPerUnit;
      if (b.alpha > 0.3) this.hits.push({ id: b.id, sx: sp.x, sy: sp.y, r: Math.max(18, rp * 1.3) });
      // 標籤要讓開的半徑：計時器的彈珠連倒數弧一起算，被夾著的連夾爪一起算
      const held = clamp01(1 - Math.hypot(b.x - view.arm.x, b.y - view.arm.y) / 0.3) * clamp01(view.arm.grip);
      const keep = (left !== undefined ? r + 0.1 : r + 0.16 * held) * pxPerUnit;
      discs.push({ x: sp.x, y: sp.y, r: keep + 2 });
      shown.push({ i, sx: sp.x, sy: sp.y, rp: keep, own: discs.length - 1 });
    }

    {
      const hub = this.toScreen(HUB.x, HUB.y);
      discs.push({ x: hub.x, y: hub.y, r: 0.3 * pxPerUnit });
    }

    // ── 管線的名稱 ──
    const rects: Rect[] = [];
    const lane = (id: Lane, x: number, y: number, dx: number, dy: number) => {
      const key = `lane:${id}`;
      used.add(key);
      const tag = this.tag(key, `lbl lbl-lane lbl-lane-${id}`, LANE_INFO[id].name);
      const s = this.toScreen(x, y);
      // 畫面很窄時名稱比機器還寬，至少不要被畫面邊緣切掉
      const cx = Math.min(this.w - tag.w / 2 - 2, Math.max(tag.w / 2 + 2, s.x + (dx * tag.w) / 2));
      const cy = s.y + (dy * tag.h) / 2;
      this.put(tag, cx, cy, LANE_LABEL_DIM + (1 - LANE_LABEL_DIM) * clamp01(lit[id]));
      rects.push({ x0: cx - tag.w / 2, y0: cy - tag.h / 2, x1: cx + tag.w / 2, y1: cy + tag.h / 2 });
    };
    // dx、dy 是標籤往哪一邊長（螢幕座標，y 往下）：0 置中、±1 從錨點往那一邊排
    lane('stack', STACK.x, STACK.bottom - 0.5, 0, 1);
    lane('micro', HUB.x, HUB.y - MICRO.r - 0.22, 0, 1);
    lane('tick', HUB.x, HUB.y - (TICK.r + MICRO.r) / 2, 0, 0);
    {
      // 外圈：左下方的外側（隊伍在上半圈，支線在正下方，這裡兩邊都不會擠到）
      const a = 226 * RAD;
      const nx = Math.cos(a) / MACRO.rx;
      const ny = Math.sin(a) / MACRO.ry;
      const nl = Math.hypot(nx, ny);
      const off = MACRO_HALF + 0.2;
      lane(
        'macro', HUB.x + MACRO.rx * Math.cos(a) + (nx / nl) * off, HUB.y + MACRO.ry * Math.sin(a) + (ny / nl) * off, -1, 1,
      );
    }
    {
      // 支線：靠 to 那一端的外側（隊伍從 from 那一端排過來，要排很多顆才會到這裡）
      const a = (IMMEDIATE.to - (IMMEDIATE.to - IMMEDIATE.from) * 0.18) * RAD;
      lane(
        'immediate', HUB.x + IMMEDIATE.rx * Math.cos(a) + 0.12,
        HUB.y + IMMEDIATE.ry * Math.sin(a) - IMMEDIATE_HALF - 0.16, 1, 1,
      );
    }
    lane('timers', timerSlot(this.hookCount - 1).x - 0.62, TIMERS.y + RAIL_UP, -1, 0);

    // ── 彈珠的標籤：主管裡的放右側、軌道上的放外側；撞到別的彈珠或標籤就換一邊 ──
    for (const { i, sx, sy, rp, own } of shown) {
      const b = view.balls[i];
      if (!b || !b.label) continue;
      const key = `ball:${b.id}`;
      used.add(key);
      const tag = this.tag(key, `lbl lbl-ball lbl-${b.kind}`, b.label);
      const on = this.hl ? this.hl.has(b.id) : true;
      const alpha = b.alpha * (on ? 1 : 0.45);
      if (alpha < 0.02) {
        this.put(tag, 0, 0, 0);
        continue;
      }
      // 偏好的方向（螢幕座標，y 往下）
      let dx = 1;
      let dy = 0;
      let pad = LABEL_PAD;
      const hx = b.x - HUB.x;
      const hy = b.y - HUB.y;
      const hd = Math.hypot(hx, hy);
      if (b.lane === 'stack') {
        // 停在管子裡的要越過管壁，標籤才不會壓在玻璃的線上
        const inTube = clamp01(1 - Math.abs(b.x - STACK.x) / 0.4) * (b.y < STACK.top + 0.2 ? 1 : 0);
        pad += inTube * (STACK.width / 2 - BALL_R * b.scale + 0.1) * pxPerUnit;
      } else if (b.lane === 'timers') {
        dx = 0;
        dy = 1;
      } else if (hd > 0.2) {
        // 超車道外側緊貼著內圈，沒有位置，改放內側
        const sign = b.lane === 'tick' ? -1 : 1;
        dx = (hx / hd) * sign;
        dy = (-hy / hd) * sign;
      }
      // 每個方向先試貼著彈珠，再試退開一行（計時器架上相鄰的標籤比間距寬，要上下錯開）
      let best: Rect | null = null;
      search: for (const turn of LABEL_TURNS) {
        const ca = Math.cos(turn * RAD);
        const sa = Math.sin(turn * RAD);
        const ux = dx * ca - dy * sa;
        const uy = dx * sa + dy * ca;
        for (const back of [0, tag.h + 2]) {
          const cx = sx + ux * (rp + pad + back + tag.w / 2);
          const cy = sy + uy * (rp + pad + back + tag.h / 2);
          const rect = { x0: cx - tag.w / 2, y0: cy - tag.h / 2, x1: cx + tag.w / 2, y1: cy + tag.h / 2 };
          best ??= rect;
          if (this.free(rect, rects, discs, own)) {
            best = rect;
            break search;
          }
        }
      }
      if (best) {
        rects.push(best);
        this.put(tag, (best.x0 + best.x1) / 2, (best.y0 + best.y1) / 2, alpha);
      }
    }

    for (const [id, tag] of this.tags) {
      if (!used.has(id)) this.put(tag, 0, 0, 0);
    }

    sprites.flush();
    segs.flush();
  }

  /** 這塊矩形有沒有壓到別的標籤、別顆彈珠或機械臂的軸心（own 是自己那顆，不算） */
  private free(rect: Rect, rects: readonly Rect[], discs: readonly Disc[], own: number): boolean {
    for (const o of rects) {
      // 左右多留一點，並排的兩個標籤才不會黏成一串
      if (rect.x0 < o.x1 + LABEL_GAP && rect.x1 > o.x0 - LABEL_GAP && rect.y0 < o.y1 && rect.y1 > o.y0) return false;
    }
    for (let i = 0; i < discs.length; i++) {
      const c = discs[i];
      if (!c || i === own) continue;
      const nx = Math.min(rect.x1, Math.max(rect.x0, c.x));
      const ny = Math.min(rect.y1, Math.max(rect.y0, c.y));
      if (Math.hypot(nx - c.x, ny - c.y) < c.r) return false;
    }
    return true;
  }

  /** 取得（沒有就建立）一個標籤，並量好它的大小 */
  private tag(id: string, cls: string, text: string): Tag {
    let tag = this.tags.get(id);
    if (!tag) {
      const el = document.createElement('span');
      el.className = cls;
      el.style.opacity = '0';
      this.labels.appendChild(el);
      tag = { el, text: '', w: -1, h: 0, opacity: '0', transform: '' };
      this.tags.set(id, tag);
    }
    if (tag.text !== text) {
      tag.text = text;
      tag.el.textContent = text;
      tag.w = -1;
    }
    if (tag.w < 0) {
      tag.w = tag.el.offsetWidth;
      tag.h = tag.el.offsetHeight;
    }
    return tag;
  }

  /** 把標籤的中心放到螢幕座標 (x, y) */
  private put(tag: Tag, x: number, y: number, alpha: number): void {
    const opacity = alpha < 0.02 ? '0' : alpha.toFixed(2);
    if (tag.opacity !== opacity) {
      tag.opacity = opacity;
      tag.el.style.opacity = opacity;
    }
    if (opacity === '0') return;
    const transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (tag.transform !== transform) {
      tag.transform = transform;
      tag.el.style.transform = transform;
    }
  }
}
