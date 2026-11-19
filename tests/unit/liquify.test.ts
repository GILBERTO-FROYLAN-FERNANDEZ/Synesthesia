import { expect, it } from 'vitest';
import { LiquifySim } from '../../src/materials/visual/warping/LiquifySim';
function input(active: boolean) {
  return {
    cols: 32,
    rows: 18,
    field: Float32Array.from({ length: 32 * 18 * 2 }, (_, i) => {
      if (i % 2 || !active) return 0;
      const cell = i / 2,
        x = ((cell % 32) + 0.5) / 32,
        y = (Math.floor(cell / 32) + 0.5) / 18;
      return 0.25 * Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) / 0.018);
    }),
  };
}
function tick(sim: LiquifySim, active: boolean, steps: number) {
  for (let i = 0; i < steps; i++) sim.step(input(active), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60);
}
it('expands artwork radially and continues composing expansion under sustained input', () => {
  const sim = new LiquifySim();
  const at = (36 * 128 + 74) * 4;
  tick(sim, true, 60);
  const early = sim.data[at];
  expect(early).toBeLessThan(0);
  tick(sim, true, 120);
  expect(sim.data[at]).toBeLessThan(early);
  expect(sim.data[(36 * 128 + 53) * 4]).toBeGreaterThan(0);
});
it('returns the coordinate map to the original surface and resets repeatably', () => {
  const sim = new LiquifySim();
  tick(sim, true, 60);
  const snapshot = sim.data.slice();
  tick(sim, false, 420);
  expect(Math.max(...sim.data.map(Math.abs))).toBeLessThan(0.001);
  sim.reset();
  tick(sim, true, 60);
  expect(sim.data).toEqual(snapshot);
});
it('keeps the stretched surface continuous without folding during sustained expansion', () => {
  const sim = new LiquifySim();
  tick(sim, true, 240);
  const dx = 16 / 9 / sim.cols,
    dy = 1 / sim.rows;
  let min = Infinity;
  for (let row = 1; row < sim.rows - 1; row++)
    for (let col = 1; col < sim.cols - 1; col++) {
      const i = (row * sim.cols + col) * 4;
      const xx = 1 + (sim.data[i + 4] - sim.data[i - 4]) / (2 * dx);
      const xy = (sim.data[i + sim.cols * 4] - sim.data[i - sim.cols * 4]) / (2 * dy);
      const yx = (sim.data[i + 5] - sim.data[i - 3]) / (2 * dx);
      const yy = 1 + (sim.data[i + sim.cols * 4 + 1] - sim.data[i - sim.cols * 4 + 1]) / (2 * dy);
      min = Math.min(min, xx * yy - xy * yx);
    }
  expect(min).toBeGreaterThan(0);
});
