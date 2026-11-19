import { hashUnit } from '../shared/hashNoise';

/** Seeded, bounded spray emitted only when a falling bubble pops. */
export class PopMist {
  readonly capacity = 2048;
  readonly x = new Float64Array(this.capacity);
  readonly y = new Float64Array(this.capacity);
  readonly vx = new Float64Array(this.capacity);
  readonly vy = new Float64Array(this.capacity);
  readonly age = new Float64Array(this.capacity);
  readonly lifetime = new Float64Array(this.capacity);
  readonly radius = new Float64Array(this.capacity);
  count = 0;
  private cursor = 0;
  private serial = 0;
  private seed = 0;
  reset(seed: number): void {
    this.seed = seed;
    this.count = this.cursor = this.serial = 0;
    this.lifetime.fill(0);
  }
  emit(x: number, y: number, size: number): void {
    for (let n = 0; n < 6; n++) {
      const serial = this.serial++,
        i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      this.count = Math.min(this.capacity, this.count + 1);
      const angle = hashUnit(this.seed, serial, 0) * Math.PI * 2;
      const spread = 0.025 + hashUnit(this.seed, serial, 1) * 0.055;
      this.x[i] = x + Math.cos(angle) * 0.005 * size;
      this.y[i] = y + Math.sin(angle) * 0.005 * size;
      this.vx[i] = Math.cos(angle) * spread;
      this.vy[i] = Math.sin(angle) * spread * 0.3 - 0.035;
      this.age[i] = 0;
      this.lifetime[i] = 0.9 + hashUnit(this.seed, serial, 2) * 0.9;
      this.radius[i] =
        (n < 2 ? 0.002 : 0.005) *
        (0.7 + 0.6 * hashUnit(this.seed, serial, 3)) *
        Math.min(1.5, size);
    }
  }
  step(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.lifetime[i]) continue;
      this.vx[i] *= Math.exp(-dt * 1.8);
      this.vy[i] = this.vy[i] * Math.exp(-dt * 0.8) - 0.045 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }
}
