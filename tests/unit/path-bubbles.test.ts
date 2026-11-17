import { expect, it } from 'vitest';
import { PathBubbleSim } from '../../src/materials/visual/bubbles/PathBubbleSim';
import { bubbleParams } from '../../src/materials/visual/bubbles/mapping';

const p = { ...bubbleParams({}, 'draft', 'lines').sim, scatter: 0 };
function field(direction: number) {
  return {
    cols: 16,
    rows: 9,
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? direction * 0.2 : 0)),
  };
}
function run(seed = 7) {
  const sim = new PathBubbleSim(1500, 640, 360);
  sim.reset(seed);
  for (let i = 0; i < 45; i++) sim.step(field(1), p, 1 / 60);
  return sim;
}
it('emits only on gesture paths, then falls and fades', () => {
  const sim = new PathBubbleSim(1500, 640, 360);
  sim.reset(7);
  sim.populate();
  sim.step(field(0), p, 1 / 60);
  expect(sim.count).toBe(0);
  const moving = run();
  expect(moving.count).toBeGreaterThan(10);
  expect(p.fallSpeed).toBeGreaterThan(0);
  expect(Array.from(moving.vy.subarray(0, moving.count))).toEqual(Array(moving.count).fill(0));
  const y = moving.py[0];
  for (let i = 0; i < 20; i++) moving.step(field(0), p, 1 / 60);
  expect(moving.py[0]).toBeLessThan(y - 0.015);
  for (let i = 0; i < 180; i++) moving.step(field(0), p, 1 / 60);
  expect(moving.count).toBe(0);
});
it('responds to a reversed gesture and keeps particle speeds bounded', () => {
  const sim = run();
  const x = sim.px[0];
  for (let i = 0; i < 30; i++) sim.step(field(-1), p, 1 / 60);
  expect(sim.vx[0]).toBeLessThan(0);
  expect(sim.px[0]).toBeLessThan(x);
  for (let i = 0; i < sim.count; i++)
    expect(Math.hypot(sim.vx[i], sim.vy[i])).toBeLessThanOrEqual(p.maxPushSpeed! + 1e-9);
});
it('replays the same path particles after reset', () => {
  const a = run(),
    b = run();
  expect(a.px).toEqual(b.px);
  expect(a.py).toEqual(b.py);
  a.reset(7);
  for (let i = 0; i < 45; i++) a.step(field(1), p, 1 / 60);
  expect(a.px).toEqual(b.px);
  expect(run(8).px).not.toEqual(b.px);
});

it('Fall speed controls descent after gesture emission', () => {
  const slow = run(),
    fast = run();
  for (let i = 0; i < 20; i++) {
    slow.step(field(0), { ...p, fallSpeed: 0.03 }, 1 / 60);
    fast.step(field(0), { ...p, fallSpeed: 0.3 }, 1 / 60);
  }
  expect(fast.py[0]).toBeLessThan(slow.py[0] - 0.04);
});

it('lets released bubbles fall without being carried along by sustained motion', () => {
  const sim = run();
  const x = sim.px[0],
    y = sim.py[0];
  for (let i = 0; i < 30; i++) sim.step(field(1), p, 1 / 60);
  const sideways = Math.abs(sim.px[0] - x);
  const descent = y - sim.py[0];
  expect(descent).toBeGreaterThan(0.03);
  expect(sideways).toBeLessThan(descent * 0.5);
});
