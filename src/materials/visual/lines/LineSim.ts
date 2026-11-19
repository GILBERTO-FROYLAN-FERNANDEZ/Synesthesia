import { hashString32, hash32 } from '../../../chance/prng';
import { hashUnit } from '../shared/hashNoise';
import { ProjectedField, worldSize, type FieldInput } from '../shared/fieldSampling';

export interface LineParams {
  count: number;
  range: number;
  gain: number;
  lag: number;
  scatter: number;
  lifetime: number;
  /** Ignore weak capture motion and require travel before showing a new path. */
  motionThreshold?: number;
  minimumTravel?: number;
}

/** Coherent, short-lived sample points; a bounded ring stores their fading paths. */
export class LineSim {
  readonly capacity = 32768;
  readonly heads = 96;
  readonly x0 = new Float64Array(this.capacity);
  readonly y0 = new Float64Array(this.capacity);
  readonly x1 = new Float64Array(this.capacity);
  readonly y1 = new Float64Array(this.capacity);
  readonly born = new Float64Array(this.capacity);
  readonly fromTime = new Float64Array(this.capacity);
  readonly path = new Uint32Array(this.capacity);
  readonly turn = new Float64Array(this.capacity);
  readonly strength = new Float64Array(this.capacity);
  readonly arc = new Float64Array(this.capacity);
  emittedStart = 0;
  emittedCount = 0;
  start = 0;
  count = 0;
  time = 0;
  worldWidth = 16 / 9;
  worldHeight = 1;
  private readonly x = new Float64Array(this.heads);
  private readonly y = new Float64Array(this.heads);
  private readonly u = new Float64Array(this.heads);
  private readonly v = new Float64Array(this.heads);
  private readonly remaining = new Float64Array(this.heads);
  private readonly pendingTravel = new Float64Array(this.heads);
  private readonly distance = new Float64Array(this.heads);
  private readonly generations = new Uint32Array(this.heads);
  private readonly field = new ProjectedField();
  private cells = new Int32Array(0);
  private key = 0;
  private budget = 0;
  private width = 1600;
  private height = 900;

  setCanvas(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const world = worldSize(width, height);
    const sx = world.width / this.worldWidth,
      sy = world.height / this.worldHeight;
    for (let i = 0; i < this.heads; i++) {
      this.x[i] *= sx;
      this.y[i] *= sy;
      this.u[i] *= sx;
      this.v[i] *= sy;
    }
    for (let j = 0; j < this.count; j++) {
      const i = (this.start + j) % this.capacity;
      this.x0[i] *= sx;
      this.x1[i] *= sx;
      this.y0[i] *= sy;
      this.y1[i] *= sy;
    }
    this.worldWidth = world.width;
    this.worldHeight = world.height;
  }

  reset(seed: number): void {
    this.key = hash32(seed, hashString32('sampled-lines'));
    this.start = 0;
    this.count = 0;
    this.time = 0;
    this.budget = 1;
    this.emittedCount = 0;
    this.remaining.fill(0);
    this.generations.fill(0);
    this.u.fill(0);
    this.v.fill(0);
    this.pendingTravel.fill(0);
  }

  step(input: FieldInput, p: LineParams, dt: number): void {
    this.emittedCount = 0;
    if (!(dt > 0)) return;
    this.time += dt;
    while (this.count > 0 && this.time - this.born[this.start] >= p.lifetime) {
      this.start = (this.start + 1) % this.capacity;
      this.count--;
    }
    this.field.set(input, p.range, this.width, this.height);
    const cells = Math.max(0, input.cols * input.rows);
    if (this.cells.length < cells) this.cells = new Int32Array(cells);
    const threshold = p.motionThreshold ?? 0.0008;
    let moving = 0;
    for (let i = 0; i < cells; i++) {
      const u = input.field[2 * i] ?? 0,
        v = input.field[2 * i + 1] ?? 0;
      if (Number.isFinite(u) && Number.isFinite(v) && u * u + v * v > threshold * threshold)
        this.cells[moving++] = i;
    }
    const limit = Math.min(this.heads, Math.max(1, Math.round(p.count)));
    const target = Math.min(limit, moving * 2);
    this.budget = moving > 0 ? Math.min(3, this.budget + (dt * limit) / 0.65) : 1;
    let active = 0;
    for (let i = 0; i < limit; i++) if (this.remaining[i] > 0) active++;
    const rect = this.field.rect;
    const follow = p.lag > 0 ? 1 - Math.exp(-dt / p.lag) : 1;
    for (let h = 0; h < this.heads; h++) {
      if (h >= limit) {
        this.remaining[h] = 0;
        continue;
      }
      if (this.remaining[h] <= 0 && active < target && this.budget >= 1) {
        const generation = ++this.generations[h];
        const cell =
          this.cells[Math.min(moving - 1, Math.floor(hashUnit(this.key, h, generation) * moving))];
        const jx = 0.2 + 0.6 * hashUnit(this.key + 1, h, generation);
        const jy = 0.2 + 0.6 * hashUnit(this.key + 2, h, generation);
        this.x[h] = rect.x + (((cell % input.cols) + jx) / input.cols) * rect.width;
        this.y[h] = rect.y + (1 - (Math.floor(cell / input.cols) + jy) / input.rows) * rect.height;
        this.remaining[h] = 0.45 + 0.65 * hashUnit(this.key + 3, h, generation);
        this.u[h] = 0;
        this.v[h] = 0;
        this.distance[h] = 0;
        this.pendingTravel[h] = 0;
        this.budget--;
        active++;
      }
      if (this.remaining[h] <= 0) continue;
      this.remaining[h] -= dt;
      this.field.sample(this.x[h], this.y[h]);
      if (p.motionThreshold && Math.hypot(this.field.u, this.field.v) < threshold * rect.diagonal) {
        this.u[h] = 0;
        this.v[h] = 0;
        this.pendingTravel[h] = 0;
        continue;
      }
      const angle = (hashUnit(this.key + 4, h, this.generations[h]) - 0.5) * p.scatter;
      const c = Math.cos(angle),
        s = Math.sin(angle);
      const u = (c * this.field.u - s * this.field.v) * p.gain;
      const v = (s * this.field.u + c * this.field.v) * p.gain;
      this.u[h] += (u - this.u[h]) * follow;
      this.v[h] += (v - this.v[h]) * follow;
      const speed = Math.hypot(this.u[h], this.v[h]);
      if (speed > 2.4) {
        this.u[h] *= 2.4 / speed;
        this.v[h] *= 2.4 / speed;
      }
      let dx = this.u[h] * dt,
        dy = this.v[h] * dt;
      const length = Math.hypot(dx, dy);
      // Bound each segment without discarding the direction of a fast swipe.
      if (length > 0.04) {
        dx *= 0.04 / length;
        dy *= 0.04 / length;
      }
      if (Math.hypot(dx, dy) < 0.00004) continue;
      const nextX = this.x[h] + dx,
        nextY = this.y[h] + dy;
      if (nextX < 0 || nextY < 0 || nextX > this.worldWidth || nextY > this.worldHeight) {
        this.remaining[h] = 0;
        continue;
      }
      if (this.distance[h] === 0 && p.minimumTravel) {
        this.pendingTravel[h] += Math.hypot(dx, dy);
        if (this.pendingTravel[h] < p.minimumTravel) {
          this.x[h] = nextX;
          this.y[h] = nextY;
          continue;
        }
      }
      const i = (this.start + this.count) % this.capacity;
      if (this.emittedCount === 0) this.emittedStart = i;
      this.emittedCount++;
      this.x0[i] = this.x[h];
      this.y0[i] = this.y[h];
      this.x1[i] = nextX;
      this.y1[i] = nextY;
      this.born[i] = this.time;
      this.fromTime[i] = this.time - dt;
      this.path[i] = h + this.heads * this.generations[h];
      this.turn[i] = Math.atan2(dy, dx) / (2 * Math.PI);
      this.strength[i] = Math.min(1, Math.hypot(dx, dy) / dt / 0.7);
      this.arc[i] = this.distance[h];
      this.distance[h] += Math.hypot(dx, dy);
      if (this.count === this.capacity) this.start = (this.start + 1) % this.capacity;
      else this.count++;
      this.x[h] = nextX;
      this.y[h] = nextY;
    }
  }
}
