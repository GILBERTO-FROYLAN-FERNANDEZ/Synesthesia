import { hashUnit } from '../shared/hashNoise';
import { ProjectedField, worldSize, type FieldInput } from '../shared/fieldSampling';

export interface RippleParams {
  density: number;
  intensity: number;
  range: number;
  lifetime: number;
  emissionScale?: number;
  independentTiming?: boolean;
}

/** Bounded, deterministic touch events. Grid cooldowns keep one moving area from
 * emitting a new wave on every frame; quiet capture noise never creates an event. */
export class RippleSim {
  readonly capacity = 768;
  readonly x = new Float64Array(this.capacity);
  readonly y = new Float64Array(this.capacity);
  readonly age = new Float64Array(this.capacity);
  readonly strength = new Float64Array(this.capacity);
  readonly durationScale = new Float64Array(this.capacity).fill(1);
  readonly phase = new Float64Array(this.capacity);
  count = 0;
  worldWidth = 16 / 9;
  worldHeight = 1;
  private readonly field = new ProjectedField();
  private readonly cooldown = new Float64Array(32 * 32);
  private readonly candidates: number[] = [];
  private width = 1600;
  private height = 900;
  private seed = 0;
  private serial = 0;
  private budget = 1;
  private emissionCost = 1;

  setCanvas(width: number, height: number): void {
    const world = worldSize(width, height);
    for (let i = 0; i < this.count; i++) {
      this.x[i] *= world.width / this.worldWidth;
      this.y[i] *= world.height / this.worldHeight;
    }
    this.worldWidth = world.width;
    this.worldHeight = world.height;
    this.width = width;
    this.height = height;
  }
  reset(seed: number): void {
    this.seed = seed;
    this.serial = 0;
    this.count = 0;
    this.budget = 1;
    this.emissionCost = 1;
    this.durationScale.fill(1);
    this.cooldown.fill(0);
  }
  step(input: FieldInput, p: RippleParams, dt: number): void {
    if (!(dt > 0)) return;
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= p.lifetime * this.durationScale[i]) {
        const last = --this.count;
        for (const array of [
          this.x,
          this.y,
          this.age,
          this.strength,
          this.phase,
          this.durationScale,
        ])
          array[i] = array[last];
      }
    }
    this.field.set(input, p.range, this.width, this.height);
    const cols =
      this.worldWidth >= this.worldHeight
        ? 32
        : Math.max(8, Math.round((32 * this.worldWidth) / this.worldHeight));
    const rows =
      this.worldHeight >= this.worldWidth
        ? 32
        : Math.max(8, Math.round((32 * this.worldHeight) / this.worldWidth));
    this.candidates.length = 0;
    let energy = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        this.cooldown[i] = Math.max(0, this.cooldown[i] - dt);
        this.field.sample(
          ((col + 0.5) / cols) * this.worldWidth,
          ((row + 0.5) / rows) * this.worldHeight,
        );
        const speed = Math.hypot(this.field.u, this.field.v);
        if (this.cooldown[i] === 0 && speed > 0.014) {
          this.candidates.push(i);
          energy += Math.min(0.5, speed);
        }
      }
    }
    if (!this.candidates.length) {
      this.budget = Math.min(1, this.budget);
      return;
    }
    this.budget = Math.min(
      8,
      this.budget +
        dt *
          (p.emissionScale ?? 1) *
          (12 + 110 * p.density) *
          Math.min(1, this.candidates.length / 4) *
          Math.min(1.8, Math.max(0.3, energy / this.candidates.length / 0.2)),
    );
    while (
      this.budget >= this.emissionCost &&
      this.candidates.length &&
      this.count < this.capacity
    ) {
      const serial = this.serial++;
      const pick = Math.floor(hashUnit(this.seed, serial, 0) * this.candidates.length);
      const cell = this.candidates.splice(pick, 1)[0];
      const col = cell % cols,
        row = Math.floor(cell / cols);
      if (this.cooldown[cell] > 0) continue;
      const x = ((col + 0.25 + 0.5 * hashUnit(this.seed, serial, 1)) / cols) * this.worldWidth;
      const y = ((row + 0.25 + 0.5 * hashUnit(this.seed, serial, 2)) / rows) * this.worldHeight;
      this.field.sample(x, y);
      const i = this.count++;
      this.x[i] = x;
      this.y[i] = y;
      this.age[i] = 0;
      this.strength[i] =
        Math.min(1, Math.hypot(this.field.u, this.field.v) / 0.35) * (0.4 + 1.2 * p.intensity);
      this.phase[i] = hashUnit(this.seed, serial, 3);
      this.durationScale[i] = p.independentTiming
        ? 0.82 + 0.36 * hashUnit(this.seed, serial, 4)
        : 1;
      // Let adjacent points contribute together, so moving limbs produce layered waves.
      // The same location may pulse again soon, without emitting on every frame.
      this.cooldown[cell] = 0.055 + 0.09 * (1 - p.density);
      this.budget -= this.emissionCost;
      this.emissionCost = p.independentTiming ? 0.55 + 0.9 * hashUnit(this.seed, serial, 5) : 1;
    }
  }
}
