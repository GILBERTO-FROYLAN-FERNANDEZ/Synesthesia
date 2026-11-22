import { expect, it } from 'vitest';
import { GrassSim } from '../../src/materials/visual/grass/GrassSim';
function field(speed: number) {
  return {
    cols: 16,
    rows: 9,
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? speed : 0)),
  };
}
function step(sim: GrassSim, speed: number, n: number) {
  for (let i = 0; i < n; i++) sim.step(field(speed), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60);
}
it('deforms in the movement direction and returns to rest', () => {
  const sim = new GrassSim();
  step(sim, 0.2, 45);
  expect(sim.data[(18 * 64 + 32) * 4]).toBeGreaterThan(0.01);
  step(sim, 0, 360);
  expect(Math.max(...sim.data.filter((_, i) => i % 4 < 3).map(Math.abs))).toBeLessThan(0.001);
});
it('ignores tiny noise, remains bounded, and replays after reset', () => {
  const sim = new GrassSim();
  step(sim, 0.001, 60);
  expect(Math.max(...sim.data)).toBe(0);
  step(sim, 10, 120);
  expect(Math.max(...sim.data)).toBeLessThanOrEqual(1);
  sim.reset();
  step(sim, -0.2, 45);
  const first = sim.data.slice();
  sim.reset();
  step(sim, -0.2, 45);
  expect(sim.data).toEqual(first);
  expect(sim.data[(18 * 64 + 32) * 4]).toBeLessThan(0);
});
it('Grass returns upright sooner after movement passes', () => {
  const grass = new GrassSim(),
    normal = new GrassSim();
  for (let i = 0; i < 45; i++) {
    grass.step(field(0.2), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'grass');
    normal.step(field(0.2), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60);
  }
  const at = (18 * 64 + 32) * 4,
    initialGrass = grass.data[at],
    initialNormal = normal.data[at];
  for (let i = 0; i < 30; i++) {
    grass.step(field(0), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'grass');
    normal.step(field(0), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60);
  }
  expect(Math.abs(grass.data[at] / initialGrass)).toBeLessThan(
    Math.abs(normal.data[at] / initialNormal),
  );
});

it('Grass preserves both gesture axes, including vertical and diagonal movement', () => {
  for (const [x, y] of [
    [0, -0.3],
    [0, 0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
  ]) {
    const sim = new GrassSim();
    const input = {
      cols: 16,
      rows: 9,
      field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? x : y)),
    };
    for (let i = 0; i < 45; i++) sim.step(input, 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'grass');
    const at = (18 * 64 + 32) * 4;
    expect(Math.sign(sim.data[at])).toBe(Math.sign(x));
    // Capture coordinates point down; the rendering field points up.
    expect(Math.sign(sim.data[at + 1])).toBe(y < 0 ? 1 : -1);
    if (x !== 0) expect(Math.abs(sim.data[at])).toBeCloseTo(Math.abs(sim.data[at + 1]), 5);
    for (let i = 0; i < 180; i++) sim.step(field(0), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'grass');
    expect(Math.abs(sim.data[at]) + Math.abs(sim.data[at + 1])).toBeLessThan(0.001);
  }
});

it('Grass settles smoothly after release without flipping to the other side', () => {
  const sim = new GrassSim();
  for (let i = 0; i < 60; i++) sim.step(field(0.3), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'grass');
  const at = (18 * 64 + 32) * 4;
  let previous = sim.data[at];
  expect(previous).toBeGreaterThan(0.05);
  for (let i = 0; i < 180; i++) {
    sim.step(field(0), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'grass');
    expect(sim.data[at]).toBeGreaterThanOrEqual(0);
    expect(sim.data[at]).toBeLessThanOrEqual(previous + 1e-6);
    previous = sim.data[at];
  }
  expect(previous).toBeLessThan(0.001);
});
