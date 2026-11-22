import { ProjectedField, type FieldInput } from '../shared/fieldSampling';

/** Local springs return to rest; fixed roots/patches never drift off screen. */
export class GrassSim {
  readonly cols = 64;
  readonly rows = 36;
  readonly data = new Float32Array(this.cols * this.rows * 4);
  private readonly vx = new Float64Array(this.cols * this.rows);
  private readonly vy = new Float64Array(this.cols * this.rows);
  private readonly field = new ProjectedField();
  reset(): void {
    this.data.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
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
    mode: 'normal' | 'grass' = 'normal',
  ): void {
    if (!(dt > 0)) return;
    this.field.set(input, range, width, height);
    const worldW = width / Math.min(width, height),
      worldH = height / Math.min(width, height);
    const spring = (10 + 35 * (1 - recovery)) * (mode === 'grass' ? 3.5 : 1);
    // Near-critical damping keeps the stronger two-axis bend from ringing on release.
    const drag = mode === 'grass' ? (2 + 0.3 * resistance) * Math.sqrt(spring) : 5 + 7 * resistance;
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) {
        const i = row * this.cols + col,
          at = i * 4;
        this.field.sample(((col + 0.5) / this.cols) * worldW, ((row + 0.5) / this.rows) * worldH);
        const speed = Math.hypot(this.field.u, this.field.v);
        const gain = 0.4 + 2.2 * intensity;
        const ramp = Math.max(0, Math.min(1, (speed - 0.004) / 0.02));
        const gate = mode === 'grass' ? ramp * ramp * (3 - 2 * ramp) : speed > 0.012 ? 1 : 0;
        const u = this.field.u * gain * gate;
        const v = this.field.v * gain * gate;
        this.vx[i] = (this.vx[i] + (u * 15 - this.data[at] * spring) * dt) * Math.exp(-drag * dt);
        this.vy[i] =
          (this.vy[i] + (v * 15 - this.data[at + 1] * spring) * dt) * Math.exp(-drag * dt);
        this.data[at] = Math.max(-0.65, Math.min(0.65, this.data[at] + this.vx[i] * dt));
        this.data[at + 1] = Math.max(-0.65, Math.min(0.65, this.data[at + 1] + this.vy[i] * dt));
      }
  }
}
