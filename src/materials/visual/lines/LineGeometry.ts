import { hashUnit } from '../shared/hashNoise';
export interface LineState {
  capacity: number;
  start: number;
  count: number;
  time: number;
  x0: Float64Array;
  y0: Float64Array;
  x1: Float64Array;
  y1: Float64Array;
  born: Float64Array;
  fromTime: Float64Array;
  path: Uint32Array;
  arc: Float64Array;
  turn: Float64Array;
  strength: Float64Array;
  radius0?: Float64Array;
  radius1?: Float64Array;
}

/** One connected ribbon, with matching position and normal on both sides of each join. */
export class LineGeometry {
  readonly instances: Float32Array;
  readonly thickness: Float32Array;
  readonly previous: Int32Array;
  readonly next: Int32Array;
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
  private readonly smoothX: Float64Array;
  private readonly smoothY: Float64Array;
  private readonly renderArc: Float64Array;
  private readonly firstAge: Float64Array;
  private readonly pathBirth = new Map<number, number>();
  private readonly lastByPath = new Map<number, number>();
  private pointX = 0;
  private pointY = 0;
  private normalX = 0;
  private normalY = 1;

  constructor(capacity: number) {
    this.instances = new Float32Array(capacity * 16);
    this.thickness = new Float32Array(capacity * 2);
    this.previous = new Int32Array(capacity);
    this.next = new Int32Array(capacity);
    this.x0 = new Float64Array(capacity);
    this.y0 = new Float64Array(capacity);
    this.x1 = new Float64Array(capacity);
    this.y1 = new Float64Array(capacity);
    this.smoothX = new Float64Array(capacity);
    this.smoothY = new Float64Array(capacity);
    this.renderArc = new Float64Array(capacity);
    this.firstAge = new Float64Array(capacity);
  }

  private point(
    x: number,
    y: number,
    age: number,
    arc: number,
    phase: number,
    style: number,
    fall: number,
  ): void {
    this.pointX = x;
    this.pointY = y;
    if (style === 3) {
      this.pointY -= age * fall;
      return;
    }
    if (style !== 2) return;
    // A freshly drawn filament stays on the gesture. Older smoke lifts and curls into
    // a wider, diffuse wisp; all samples of a path share the same continuous phase.
    age *= 0.35;
    const growth = 1 - Math.exp(-age * 2.5);
    const curl = 0.022 * age ** 1.25 * growth;
    const angle = phase * Math.PI * 2 + age * 4.0 + arc * 12.0;
    this.pointX = x + curl * Math.sin(angle);
    this.pointY = y + 0.035 * age + 0.018 * age * age + curl * 0.6 * Math.cos(angle);
  }

  build(sim: LineState, lifetime: number, style: number, fall = 0): number {
    this.lastByPath.clear();
    this.pathBirth.clear();
    this.previous.fill(-1);
    this.next.fill(-1);
    // Connect samples by path identity, never by visual proximity. A new sampled point
    // therefore cannot be accidentally joined to a different stroke.
    for (let j = 0; j < sim.count; j++) {
      const i = (sim.start + j) % sim.capacity;
      const age = sim.time - sim.born[i];
      if (age >= lifetime) continue;
      const path = sim.path[i];
      if (!this.pathBirth.has(path)) this.pathBirth.set(path, sim.fromTime[i]);
      const candidate = this.lastByPath.get(path);
      let prev = -1;
      if (
        candidate !== undefined &&
        Math.hypot(sim.x1[candidate] - sim.x0[i], sim.y1[candidate] - sim.y0[i]) < 1e-8
      ) {
        prev = candidate;
        this.previous[i] = prev;
        this.next[prev] = i;
      }
      const phase = hashUnit(0x1a1e, path, 0);
      const age0 = Math.min(lifetime, sim.time - (prev >= 0 ? sim.born[prev] : sim.fromTime[i]));
      this.firstAge[i] = age0;
      if (prev >= 0) {
        this.x0[i] = this.x1[prev];
        this.y0[i] = this.y1[prev];
      } else {
        this.point(sim.x0[i], sim.y0[i], age0, sim.arc[i], phase, style, fall);
        this.x0[i] = this.pointX;
        this.y0[i] = this.pointY;
      }
      const length = Math.hypot(sim.x1[i] - sim.x0[i], sim.y1[i] - sim.y0[i]);
      this.point(sim.x1[i], sim.y1[i], age, sim.arc[i] + length, phase, style, fall);
      this.x1[i] = this.pointX;
      this.y1[i] = this.pointY;
      this.lastByPath.set(path, i);
    }
    if (style === 2) {
      // Smooth shared path vertices, not individual segment ends. Three gentle passes
      // remove capture corners while preserving distinct paths and their end points.
      for (let pass = 0; pass < 3; pass++) {
        this.smoothX.set(this.x1);
        this.smoothY.set(this.y1);
        for (let j = 0; j < sim.count; j++) {
          const i = (sim.start + j) % sim.capacity,
            next = this.next[i];
          if (next < 0 || sim.time - sim.born[i] >= lifetime) continue;
          this.smoothX[i] = 0.25 * this.x0[i] + 0.5 * this.x1[i] + 0.25 * this.x1[next];
          this.smoothY[i] = 0.25 * this.y0[i] + 0.5 * this.y1[i] + 0.25 * this.y1[next];
        }
        this.x1.set(this.smoothX);
        this.y1.set(this.smoothY);
        for (let j = 0; j < sim.count; j++) {
          const i = (sim.start + j) % sim.capacity,
            prev = this.previous[i];
          if (prev >= 0) {
            this.x0[i] = this.x1[prev];
            this.y0[i] = this.y1[prev];
          }
        }
      }
    }
    // The shader uses distance along the finished ribbon, shared across every join.
    for (let j = 0; j < sim.count; j++) {
      const i = (sim.start + j) % sim.capacity,
        prev = this.previous[i];
      this.renderArc[i] =
        prev < 0
          ? sim.arc[i]
          : this.renderArc[prev] +
            Math.hypot(this.x1[prev] - this.x0[prev], this.y1[prev] - this.y0[prev]);
    }
    let count = 0;
    for (let j = 0; j < sim.count; j++) {
      const i = (sim.start + j) % sim.capacity;
      const age = sim.time - sim.born[i];
      if (age >= lifetime) continue;
      const prev = this.previous[i],
        next = this.next[i];
      const dx = this.x1[i] - this.x0[i],
        dy = this.y1[i] - this.y0[i];
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const nx = -dy / len,
        ny = dx / len;
      this.thickness[count * 2] = sim.radius0?.[i] ?? 1;
      this.thickness[count * 2 + 1] = sim.radius1?.[i] ?? 1;
      if (style === 2) {
        // Ease the whole new trail in, and taper its origin. A short first segment
        // must not appear as a full-width puff before the path has developed.
        const age = Math.max(0, sim.time - (this.pathBirth.get(sim.path[i]) ?? sim.time));
        const t = Math.min(1, age / 0.18);
        const emergence = t * t * (3 - 2 * t);
        const taper = (arc: number) => {
          const t = Math.min(1, Math.max(0, arc / 0.035));
          return 0.08 + 0.92 * t * t * (3 - 2 * t);
        };
        this.thickness[count * 2] *= emergence * taper(sim.arc[i]);
        this.thickness[count * 2 + 1] *=
          emergence * taper(sim.arc[i] + Math.hypot(sim.x1[i] - sim.x0[i], sim.y1[i] - sim.y0[i]));
      }
      const at = count++ * 16,
        out = this.instances;
      out[at] = this.x0[i];
      out[at + 1] = this.y0[i];
      out[at + 2] = this.x1[i];
      out[at + 3] = this.y1[i];
      this.joinNormal(prev, nx, ny);
      out[at + 4] = this.normalX;
      out[at + 5] = this.normalY;
      this.joinNormal(next, nx, ny);
      out[at + 6] = this.normalX;
      out[at + 7] = this.normalY;
      out[at + 8] = this.firstAge[i] / lifetime;
      out[at + 9] = age / lifetime;
      out[at + 10] = prev >= 0 ? sim.turn[prev] : sim.turn[i];
      // Unwrap palette angles through the shortest turn, keeping curved strokes smooth.
      const delta = sim.turn[i] - out[at + 10];
      out[at + 11] = out[at + 10] + delta - Math.round(delta);
      out[at + 12] = prev >= 0 ? sim.strength[prev] : sim.strength[i];
      out[at + 13] = sim.strength[i];
      out[at + 14] = style === 2 ? this.renderArc[i] : sim.arc[i];
      out[at + 15] =
        hashUnit(0x1a1e, sim.path[i], 0) * 0.999 + (prev < 0 ? 1 : 0) + (next < 0 ? 2 : 0);
    }
    return count;
  }

  private joinNormal(neighbor: number, nx: number, ny: number): void {
    this.normalX = nx;
    this.normalY = ny;
    if (neighbor < 0) return;
    const dx = this.x1[neighbor] - this.x0[neighbor],
      dy = this.y1[neighbor] - this.y0[neighbor];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return;
    let mx = nx - dy / len,
      my = ny + dx / len;
    const m = Math.hypot(mx, my);
    if (m < 1e-8) return;
    mx /= m;
    my /= m;
    const scale = 1 / Math.max(0.4, mx * nx + my * ny);
    this.normalX = mx * scale;
    this.normalY = my * scale;
  }
}
