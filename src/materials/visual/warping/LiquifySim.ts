import { ProjectedField, type FieldInput } from '../shared/fieldSampling';

/** An inverse coordinate map: advect existing artwork through a smooth outward flow,
 * rather than growing cells or magnifying about a moving global center. */
export class LiquifySim {
  readonly cols = 128;
  readonly rows = 72;
  readonly data = new Float32Array(this.cols * this.rows * 4);
  private readonly previous = new Float32Array(this.data.length);
  private readonly pressure = new Float64Array(this.cols * this.rows);
  private readonly scratch = new Float64Array(this.pressure.length);
  private readonly field = new ProjectedField();
  private readonly weights = Float64Array.from({ length: 9 }, (_, k) =>
    Math.exp(-((k - 4) ** 2) / 10),
  );
  private worldWidth = 16 / 9;
  private worldHeight = 1;

  constructor() {
    const sum = this.weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < this.weights.length; i++) this.weights[i] /= sum;
  }
  reset(): void {
    this.data.fill(0);
    this.pressure.fill(0);
  }
  private sample(x: number, y: number, channel: number): number {
    const gx = Math.max(0, Math.min(this.cols - 1, (x / this.worldWidth) * this.cols - 0.5));
    const gy = Math.max(0, Math.min(this.rows - 1, (y / this.worldHeight) * this.rows - 0.5));
    const ix = Math.floor(gx),
      iy = Math.floor(gy),
      fx = gx - ix,
      fy = gy - iy;
    const jx = Math.min(this.cols - 1, ix + 1),
      jy = Math.min(this.rows - 1, iy + 1);
    const a = this.previous[(iy * this.cols + ix) * 4 + channel];
    const b = this.previous[(iy * this.cols + jx) * 4 + channel];
    const c = this.previous[(jy * this.cols + ix) * 4 + channel];
    const d = this.previous[(jy * this.cols + jx) * 4 + channel];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
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
  ): void {
    if (!(dt > 0)) return;
    const short = Math.min(width, height);
    const w = width / short,
      h = height / short;
    if (w !== this.worldWidth || h !== this.worldHeight) {
      for (let i = 0; i < this.data.length; i += 4) {
        this.data[i] *= w / this.worldWidth;
        this.data[i + 1] *= h / this.worldHeight;
      }
      this.worldWidth = w;
      this.worldHeight = h;
    }
    this.field.set(input, range, width, height);
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) {
        this.field.sample(((col + 0.5) / this.cols) * w, ((row + 0.5) / this.rows) * h);
        const speed = Math.hypot(this.field.u, this.field.v);
        this.pressure[row * this.cols + col] = speed > 0.014 ? Math.min(1, speed * 2) : 0;
      }
    // Spatial smoothing is applied to the influence, not the artwork: color edges stay crisp.
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) {
        let sum = 0;
        for (let k = -4; k <= 4; k++)
          sum +=
            this.pressure[row * this.cols + Math.max(0, Math.min(this.cols - 1, col + k))] *
            this.weights[k + 4];
        this.scratch[row * this.cols + col] = sum;
      }
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) {
        let sum = 0;
        for (let k = -4; k <= 4; k++)
          sum +=
            this.scratch[Math.max(0, Math.min(this.rows - 1, row + k)) * this.cols + col] *
            this.weights[k + 4];
        this.pressure[row * this.cols + col] = sum;
      }
    this.previous.set(this.data);
    const gain = (0.008 + 0.04 * intensity) / (0.7 + resistance);
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) {
        const i = row * this.cols + col,
          at = i * 4;
        const gx =
          (this.pressure[row * this.cols + Math.min(this.cols - 1, col + 1)] -
            this.pressure[row * this.cols + Math.max(0, col - 1)]) /
          ((2 * w) / this.cols);
        const gy =
          (this.pressure[Math.min(this.rows - 1, row + 1) * this.cols + col] -
            this.pressure[Math.max(0, row - 1) * this.cols + col]) /
          ((2 * h) / this.rows);
        // Backtrace a small step through radial expansion. Composing small smooth steps
        // stretches the same surface continuously, instead of folding a one-shot warp.
        const speed = Math.hypot(gx, gy) * gain;
        const limit = Math.min(1, 0.25 / Math.max(1e-9, speed));
        const dx = gx * gain * limit * dt,
          dy = gy * gain * limit * dt;
        const x = ((col + 0.5) / this.cols) * w,
          y = ((row + 0.5) / this.rows) * h;
        const active = Math.min(1, this.pressure[i] / 0.025);
        const relax = Math.exp(-dt * (0.65 + 2.5 * (1 - recovery)) * (1 - active));
        this.data[at] = (this.sample(x + dx, y + dy, 0) + dx) * relax;
        this.data[at + 1] = (this.sample(x + dx, y + dy, 1) + dy) * relax;
      }
  }
}
