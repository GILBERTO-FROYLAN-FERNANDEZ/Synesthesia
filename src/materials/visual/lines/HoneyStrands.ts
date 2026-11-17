import type { LineSim } from './LineSim';

export interface HoneyStrandParams {
  lifetime: number;
  viscosity: number;
}

/** Deposited honey is a connected material with mass and velocity, not a frozen path.
 * New tips follow the sampled gesture; released tips sag and mass drains downhill.
 * Positions, constraints, and mass transfer advance only in fixed simulation steps.
 */
export class HoneyStrands {
  readonly capacity = 32768;
  readonly x0 = new Float64Array(this.capacity);
  readonly y0 = new Float64Array(this.capacity);
  readonly x1 = new Float64Array(this.capacity);
  readonly y1 = new Float64Array(this.capacity);
  readonly born = new Float64Array(this.capacity);
  readonly fromTime = new Float64Array(this.capacity);
  readonly path = new Uint32Array(this.capacity);
  readonly arc = new Float64Array(this.capacity);
  readonly turn = new Float64Array(this.capacity);
  readonly strength = new Float64Array(this.capacity);
  readonly radius0 = new Float64Array(this.capacity);
  readonly radius1 = new Float64Array(this.capacity);
  readonly mass = new Float64Array(this.capacity);
  private readonly rest = new Float64Array(this.capacity);
  private readonly vx = new Float64Array(this.capacity);
  private readonly vy = new Float64Array(this.capacity);
  private readonly oldX = new Float64Array(this.capacity);
  private readonly oldY = new Float64Array(this.capacity);
  private readonly sourceX = new Float64Array(this.capacity);
  private readonly sourceY = new Float64Array(this.capacity);
  private readonly previous = new Int32Array(this.capacity);
  private readonly next = new Int32Array(this.capacity);
  private readonly alive = new Uint8Array(this.capacity);
  private readonly lastByPath = new Map<number, number>();
  start = 0;
  count = 0;
  time = 0;

  reset(): void {
    this.start = 0;
    this.count = 0;
    this.time = 0;
    this.lastByPath.clear();
    this.alive.fill(0);
  }

  private removeOldest(): void {
    const i = this.start,
      prev = this.previous[i],
      next = this.next[i];
    if (prev >= 0 && this.alive[prev]) this.next[prev] = -1;
    if (next >= 0 && this.alive[next]) {
      this.previous[next] = -1;
      this.x0[next] = this.x1[i];
      this.y0[next] = this.y1[i];
    }
    if (this.lastByPath.get(this.path[i]) === i) this.lastByPath.delete(this.path[i]);
    this.alive[i] = 0;
    this.start = (this.start + 1) % this.capacity;
    this.count--;
  }

  private held(i: number): boolean {
    return this.next[i] < 0 && this.time - this.born[i] < 0.045;
  }

  step(source: LineSim, p: HoneyStrandParams, dt: number): void {
    if (!(dt > 0)) return;
    this.time = source.time;
    while (this.count > 0 && this.time - this.born[this.start] >= p.lifetime) this.removeOldest();
    for (let n = 0; n < source.emittedCount; n++) {
      const s = (source.emittedStart + n) % source.capacity;
      if (this.count === this.capacity) this.removeOldest();
      const i = (this.start + this.count) % this.capacity;
      let prev = this.lastByPath.get(source.path[s]) ?? -1;
      if (
        prev >= 0 &&
        (!this.alive[prev] ||
          Math.hypot(this.sourceX[prev] - source.x0[s], this.sourceY[prev] - source.y0[s]) > 1e-8)
      )
        prev = -1;
      this.previous[i] = prev;
      this.next[i] = -1;
      if (prev >= 0) this.next[prev] = i;
      this.x0[i] = prev >= 0 ? this.x1[prev] : source.x0[s];
      this.y0[i] = prev >= 0 ? this.y1[prev] : source.y0[s];
      this.x1[i] = source.x1[s];
      this.y1[i] = source.y1[s];
      this.sourceX[i] = source.x1[s];
      this.sourceY[i] = source.y1[s];
      this.born[i] = source.born[s];
      this.fromTime[i] = source.fromTime[s];
      this.path[i] = source.path[s];
      this.arc[i] = source.arc[s];
      this.strength[i] = source.strength[s];
      this.turn[i] = source.turn[s];
      const length = Math.hypot(source.x1[s] - source.x0[s], source.y1[s] - source.y0[s]);
      // A nearly constant feed deposits more thickness where the hand travels slowly.
      this.rest[i] = length * 1.08 + 0.0006;
      this.mass[i] = this.rest[i];
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.alive[i] = 1;
      this.count++;
      this.lastByPath.set(this.path[i], i);
    }
    const drag = Math.exp(-(3 + 18 * p.viscosity * p.viscosity) * dt);
    for (let n = 0; n < this.count; n++) {
      const i = (this.start + n) % this.capacity;
      this.oldX[i] = this.x1[i];
      this.oldY[i] = this.y1[i];
      if (this.held(i)) continue;
      this.vx[i] *= drag;
      this.vy[i] = this.vy[i] * drag - 0.18 * dt;
      this.x1[i] += this.vx[i] * dt;
      this.y1[i] += this.vy[i] * dt;
    }
    // Soft length constraints let a strand stretch under the hand, then sag into its
    // available slack. The root stays attached; a released tip is free to gather a drop.
    for (let pass = 0; pass < 4; pass++) {
      for (let n = 0; n < this.count; n++) {
        const i = (this.start + n) % this.capacity,
          prev = this.previous[i];
        const sx = prev >= 0 ? this.x1[prev] : this.x0[i];
        const sy = prev >= 0 ? this.y1[prev] : this.y0[i];
        const dx = this.x1[i] - sx,
          dy = this.y1[i] - sy,
          length = Math.hypot(dx, dy);
        const endWeight = this.held(i) ? 0 : 1;
        const startWeight = prev >= 0 && !this.held(prev) ? 1 : 0;
        if (length <= this.rest[i] || endWeight + startWeight === 0) continue;
        const correction =
          Math.min(0.015, (length - this.rest[i]) * (0.35 + 0.4 * p.viscosity)) /
          (endWeight + startWeight);
        const cx = (dx / length) * correction,
          cy = (dy / length) * correction;
        this.x1[i] -= cx * endWeight;
        this.y1[i] -= cy * endWeight;
        if (startWeight) {
          this.x1[prev] += cx;
          this.y1[prev] += cy;
        }
      }
    }
    // Transfer material to a lower neighbor. This conserves the live strand's mass;
    // stretching thins it, while low points collect thicker, rounded drops.
    const flow = 1 - Math.exp(-0.9 * (1 - 0.7 * p.viscosity) * dt);
    for (let n = 0; n < this.count; n++) {
      const i = (this.start + n) % this.capacity;
      const prev = this.previous[i],
        next = this.next[i];
      let lower = -1;
      if (prev >= 0 && this.y1[prev] < this.y1[i] - 0.00001) lower = prev;
      if (
        next >= 0 &&
        this.y1[next] < this.y1[i] - 0.00001 &&
        (lower < 0 || this.y1[next] < this.y1[lower])
      )
        lower = next;
      if (lower >= 0) {
        const transfer = this.mass[i] * flow;
        this.mass[i] -= transfer;
        this.mass[lower] += transfer;
      }
    }
    for (let n = 0; n < this.count; n++) {
      const i = (this.start + n) % this.capacity,
        prev = this.previous[i];
      if (prev >= 0) {
        this.x0[i] = this.x1[prev];
        this.y0[i] = this.y1[prev];
      }
      const length = Math.hypot(this.x1[i] - this.x0[i], this.y1[i] - this.y0[i]);
      this.radius1[i] = Math.min(
        2.6,
        Math.max(0.35, Math.sqrt(this.mass[i] / Math.max(0.0001, length))),
      );
      this.turn[i] = Math.atan2(this.y1[i] - this.y0[i], this.x1[i] - this.x0[i]) / (Math.PI * 2);
      this.vx[i] = (this.x1[i] - this.oldX[i]) / dt;
      this.vy[i] = (this.y1[i] - this.oldY[i]) / dt;
      const speed = Math.hypot(this.vx[i], this.vy[i]);
      if (speed > 0.35) {
        this.vx[i] *= 0.35 / speed;
        this.vy[i] *= 0.35 / speed;
      }
    }
    for (let n = 0; n < this.count; n++) {
      const i = (this.start + n) % this.capacity;
      this.radius0[i] = this.previous[i] >= 0 ? this.radius1[this.previous[i]] : this.radius1[i];
    }
  }

  resize(sx: number, sy: number): void {
    for (let n = 0; n < this.count; n++) {
      const i = (this.start + n) % this.capacity;
      this.x0[i] *= sx;
      this.x1[i] *= sx;
      this.sourceX[i] *= sx;
      this.vx[i] *= sx;
      this.y0[i] *= sy;
      this.y1[i] *= sy;
      this.sourceY[i] *= sy;
      this.vy[i] *= sy;
    }
  }
}
