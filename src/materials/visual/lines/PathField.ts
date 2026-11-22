import type { LineSim } from './LineSim';

/** Rasterize only this step's sampled paths into a sparse velocity field. Material
 * solvers can then move and mix their own fluid or particles, rather than draw paths.
 */
export class PathField {
  field = new Float32Array(0);
  cols = 1;
  rows = 1;
  private weights = new Float32Array(0);
  private previous = new Float32Array(0);
  private worldWidth = 16 / 9;
  private worldHeight = 1;

  resize(worldWidth: number, worldHeight: number): void {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    const aspect = worldWidth / worldHeight;
    this.cols = Math.max(8, Math.round(aspect >= 1 ? 96 : 96 * aspect));
    this.rows = Math.max(8, Math.round(aspect >= 1 ? 96 / aspect : 96));
    this.field = new Float32Array(this.cols * this.rows * 2);
    this.weights = new Float32Array(this.cols * this.rows);
    this.previous = new Float32Array(this.field.length);
  }

  build(source: LineSim, width: number, dt: number, holdSec = 0): this {
    if (holdSec > 0) this.previous.set(this.field);
    this.field.fill(0);
    this.weights.fill(0);
    if (!(dt > 0)) return this;
    const diagonal = Math.hypot(this.worldWidth, this.worldHeight);
    const rx = Math.max(0.65, (width / this.worldWidth) * this.cols);
    const ry = Math.max(0.65, (width / this.worldHeight) * this.rows);
    for (let n = 0; n < source.emittedCount; n++) {
      const i = (source.emittedStart + n) % source.capacity;
      const dx = source.x1[i] - source.x0[i],
        dy = source.y1[i] - source.y0[i];
      const u = dx / dt / diagonal,
        v = -dy / dt / diagonal;
      const taps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(0.002, width)));
      for (let tap = 0; tap < taps; tap++) {
        const t = (tap + 0.5) / taps;
        const x = ((source.x0[i] + dx * t) / this.worldWidth) * this.cols - 0.5;
        const y = (1 - (source.y0[i] + dy * t) / this.worldHeight) * this.rows - 0.5;
        for (
          let row = Math.max(0, Math.floor(y - ry * 2));
          row <= Math.min(this.rows - 1, Math.ceil(y + ry * 2));
          row++
        ) {
          for (
            let col = Math.max(0, Math.floor(x - rx * 2));
            col <= Math.min(this.cols - 1, Math.ceil(x + rx * 2));
            col++
          ) {
            const distance = ((col - x) / rx) ** 2 + ((row - y) / ry) ** 2;
            if (distance > 4) continue;
            const weight = Math.exp(-distance * 2);
            const at = row * this.cols + col;
            this.field[at * 2] += u * weight;
            this.field[at * 2 + 1] += v * weight;
            this.weights[at] += weight;
          }
        }
      }
    }
    for (let i = 0; i < this.weights.length; i++) {
      const divisor = Math.max(1, this.weights[i]);
      this.field[i * 2] /= divisor;
      this.field[i * 2 + 1] /= divisor;
      if (holdSec > 0) {
        const decay = Math.exp(-dt / holdSec);
        const u = this.field[i * 2],
          v = this.field[i * 2 + 1];
        const oldU = this.previous[i * 2] * decay,
          oldV = this.previous[i * 2 + 1] * decay;
        // A short force envelope gives rooted blades time to bend. New opposing
        // gestures take over immediately, rather than averaging to a dead spot.
        if (u * u + v * v < oldU * oldU + oldV * oldV && u * oldU + v * oldV >= 0) {
          this.field[i * 2] = oldU;
          this.field[i * 2 + 1] = oldV;
        }
      }
    }
    return this;
  }
}
