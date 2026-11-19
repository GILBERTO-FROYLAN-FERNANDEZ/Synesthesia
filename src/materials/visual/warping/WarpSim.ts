import { ProjectedField, type FieldInput } from '../shared/fieldSampling';

/** Local springs return to rest; fixed roots/patches never drift off screen. */
export class WarpSim {
  readonly cols = 64;
  readonly rows = 36;
  readonly focus = new Float32Array([0.5, 0.5]);
  readonly data = new Float32Array(this.cols * this.rows * 4);
  private readonly smoothGrowth = new Float32Array(this.cols * this.rows);
  private readonly vx = new Float64Array(this.cols * this.rows);
  private readonly vy = new Float64Array(this.cols * this.rows);
  private readonly pop = new Float64Array(this.cols * this.rows);
  private readonly armed = new Uint8Array(this.cols * this.rows).fill(1);
  private readonly field = new ProjectedField();
  reset(): void {
    this.data.fill(0);
    this.focus.set([0.5, 0.5]);
    this.vx.fill(0);
    this.vy.fill(0);
    this.pop.fill(0);
    this.armed.fill(1);
  }
  step(
    input: FieldInput,
    width: number,
    height: number,
    intensity: number,
    recovery: number,
    resistance: number,
    range: number,
    dt: number,
    mode: 'normal' | 'growth' | 'grass' = 'normal',
  ): void {
    if (!(dt > 0)) return;
    this.field.set(input, range, width, height);
    const worldW = width / Math.min(width, height),
      worldH = height / Math.min(width, height);
    const spring = (10 + 35 * (1 - recovery)) * (mode === 'grass' ? 3.5 : 1);
    const drag = 5 + 7 * resistance;
    let focusX = 0,
      focusY = 0,
      weight = 0;
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) {
        const i = row * this.cols + col,
          at = i * 4;
        this.field.sample(((col + 0.5) / this.cols) * worldW, ((row + 0.5) / this.rows) * worldH);
        const speed = Math.hypot(this.field.u, this.field.v);
        const gain = 0.4 + 2.2 * intensity;
        const u = speed > 0.012 ? this.field.u * gain : 0;
        const v = speed > 0.012 ? this.field.v * gain : 0;
        this.vx[i] = (this.vx[i] + (u * 15 - this.data[at] * spring) * dt) * Math.exp(-drag * dt);
        this.vy[i] =
          (this.vy[i] + (v * 15 - this.data[at + 1] * spring) * dt) * Math.exp(-drag * dt);
        this.data[at] = Math.max(-0.65, Math.min(0.65, this.data[at] + this.vx[i] * dt));
        this.data[at + 1] = Math.max(-0.65, Math.min(0.65, this.data[at + 1] + this.vy[i] * dt));
        const heat = Math.min(1, Math.hypot(u, v) * 2);
        const follow =
          1 - Math.exp(-dt * (heat > this.data[at + 2] ? 18 : 1.5 + 4 * (1 - recovery)));
        if (mode === 'growth') {
          this.data[at + 2] =
            heat > 0
              ? Math.min(32, this.data[at + 2] + heat * dt * 0.9)
              : this.data[at + 2] * Math.exp(-dt * (0.7 + 1.5 * (1 - recovery)));
          focusX += ((col + 0.5) / this.cols) * heat;
          focusY += ((row + 0.5) / this.rows) * heat;
          weight += heat;
        } else this.data[at + 2] += (heat - this.data[at + 2]) * follow;
        if (speed < 0.02) this.armed[i] = 1;
        if (heat > 0.25 && this.armed[i] && this.pop[i] === 0) {
          this.pop[i] = 0.001;
          this.armed[i] = 0;
        }
        if (this.pop[i] > 0) {
          this.pop[i] += dt / (1.2 + recovery * 2);
          if (this.pop[i] >= 1) this.pop[i] = 0;
        }
        this.data[at + 3] = this.pop[i];
      }
    if (mode === 'growth') {
      // Spread the influence gently between neighboring patches, without moving their
      // anchors. Apply from a snapshot so the result is independent of iteration order.
      for (let row = 0; row < this.rows; row++)
        for (let col = 0; col < this.cols; col++) {
          const i = row * this.cols + col;
          const left = row * this.cols + Math.max(0, col - 1);
          const right = row * this.cols + Math.min(this.cols - 1, col + 1);
          const down = Math.max(0, row - 1) * this.cols + col;
          const up = Math.min(this.rows - 1, row + 1) * this.cols + col;
          const center = this.data[i * 4 + 2];
          const average =
            (this.data[left * 4 + 2] +
              this.data[right * 4 + 2] +
              this.data[down * 4 + 2] +
              this.data[up * 4 + 2]) *
            0.25;
          this.smoothGrowth[i] = center + (average - center) * (1 - Math.exp(-dt * 8));
        }
      for (let i = 0; i < this.smoothGrowth.length; i++)
        this.data[i * 4 + 2] = this.smoothGrowth[i];
    }
    if (weight > 0) {
      this.focus[0] = focusX / weight;
      this.focus[1] = focusY / weight;
    }
  }
}
