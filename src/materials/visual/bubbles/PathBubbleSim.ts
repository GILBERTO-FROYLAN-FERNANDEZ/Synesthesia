import { createRng, type Rng } from '../../../chance/prng';
import { LineSim } from '../lines/LineSim';
import { ProjectedField, type FieldInput } from '../shared/fieldSampling';
import { BubbleSim } from './BubbleSim';
import type { BubbleSimParams } from './mapping';

/** Independent bubbles emitted along sampled gestures, with no falling source. */
export class PathBubbleSim extends BubbleSim {
  readonly opacity: Float64Array;
  private readonly age: Float64Array;
  private readonly source = new LineSim();
  private readonly gestureField = new ProjectedField();
  private readonly spacing = new Map<number, number>();
  private emissionBudget = 0;
  private random: Rng = createRng(0);

  constructor(
    capacity: number,
    width: number,
    height: number,
    private readonly fullMovement = false,
  ) {
    super(capacity, width, height);
    this.opacity = new Float64Array(capacity);
    this.age = new Float64Array(capacity);
  }
  override reset(seed: number): void {
    super.reset(seed);
    this.source.reset(seed);
    this.random = createRng(seed);
    this.spacing.clear();
    this.emissionBudget = 0;
    this.age.fill(0);
    this.opacity.fill(0);
  }
  override populate(): void {
    /* Only gestures create bubbles. */
  }

  override step(input: FieldInput, p: BubbleSimParams, dt: number): void {
    if (!(dt > 0)) return;
    this.steps++;
    const width = this.worldWidth * 1000,
      height = this.worldHeight * 1000;
    this.source.setCanvas(width, height);
    this.gestureField.set(input, p.range, width, height);
    const lifetime = p.pathLifetime ?? 1.8;
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= lifetime) {
        const last = --this.count;
        for (const array of [
          this.px,
          this.py,
          this.vx,
          this.vy,
          this.gx,
          this.gy,
          this.size,
          this.fall,
          this.age,
          this.opacity,
        ])
          array[i] = array[last];
        continue;
      }
      this.gestureField.sample(this.px[i], this.py[i]);
      const decay = Math.exp(-p.drag * dt);
      // Released bubbles become less coupled to later gestures, so falling stays readable.
      const coupling = 0.25 + 0.75 * Math.exp(-this.age[i] / 0.25);
      this.vx[i] =
        this.vx[i] * decay + (this.gestureField.u * p.forceGain * coupling * (1 - decay)) / p.drag;
      this.vy[i] =
        this.vy[i] * decay + (this.gestureField.v * p.forceGain * coupling * (1 - decay)) / p.drag;
      const limit = Math.min(
        1,
        (p.maxPushSpeed ?? 0.7) / Math.max(1e-9, Math.hypot(this.vx[i], this.vy[i])),
      );
      this.vx[i] *= limit;
      this.vy[i] *= limit;
      this.px[i] += this.vx[i] * dt;
      // Newly drawn bubbles first follow the gesture, then ease into a gentle fall.
      this.fall[i] = (0.7 + 0.3 * this.size[i]) * (1 - Math.exp(-this.age[i] / 0.35));
      this.py[i] += (this.vy[i] - p.fallSpeed * this.fall[i]) * dt;
      this.gx[i] = this.vx[i];
      this.gy[i] = this.vy[i];
      this.opacity[i] = Math.min(1, (1 - this.age[i] / lifetime) * 3);
    }
    if (this.fullMovement) {
      // Uniform spatial sampling preserves broad moving shapes instead of tracing paths.
      // A time budget makes emission independent of render frame rate.
      this.emissionBudget += (Math.min(this.capacity, p.count) * 3 * dt) / lifetime;
      const attempts = Math.floor(this.emissionBudget);
      this.emissionBudget -= attempts;
      for (let n = 0; n < attempts; n++) {
        const x = this.random() * this.worldWidth,
          y = this.random() * this.worldHeight;
        this.gestureField.sample(x, y);
        const speed = Math.hypot(this.gestureField.u, this.gestureField.v);
        if (speed < 0.025 || this.random() > Math.min(1, speed * 4)) continue;
        this.emit(x, y, this.gestureField.u, this.gestureField.v, p);
      }
      return;
    }
    this.source.step(
      input,
      {
        count: p.pathCount ?? 54,
        range: p.range,
        gain: 0.9,
        lag: 0.012 + p.lagSec,
        scatter: p.scatter,
        lifetime: 0.3,
      },
      dt,
    );
    const s = this.source;
    for (let n = 0; n < s.emittedCount; n++) {
      const k = (s.emittedStart + n) % s.capacity;
      const dx = s.x1[k] - s.x0[k],
        dy = s.y1[k] - s.y0[k];
      const length = Math.hypot(dx, dy);
      let distance = this.spacing.get(s.path[k]) ?? this.random() * 0.025;
      while (distance < length) {
        const t = distance / Math.max(length, 1e-9);
        this.emit(s.x0[k] + dx * t, s.y0[k] + dy * t, dx / dt, dy / dt, p);
        distance += 0.018 + this.random() * 0.035;
      }
      this.spacing.set(s.path[k], distance - length);
    }
    while (this.spacing.size > 512) this.spacing.delete(this.spacing.keys().next().value!);
  }
  private emit(x: number, y: number, u: number, v: number, p: BubbleSimParams): void {
    if (this.count >= Math.min(this.capacity, p.count)) return;
    const i = this.count++;
    this.px[i] = x;
    this.py[i] = y;
    const scale = Math.min(1, (p.maxPushSpeed ?? 0.7) / Math.max(Math.hypot(u, v), 1e-9));
    this.vx[i] = u * scale * 0.25;
    this.vy[i] = v * scale * 0.25;
    this.gx[i] = this.vx[i];
    this.gy[i] = this.vy[i];
    this.size[i] = 0.55 + 1.3 * this.random() ** 2.3;
    this.fall[i] = this.age[i] = 0;
    this.opacity[i] = 1;
  }
}
