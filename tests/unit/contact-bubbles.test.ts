import { expect, it } from 'vitest';
import { ContactBubbleSim } from '../../src/materials/visual/bubbles/ContactBubbleSim';
import { bubbleParams } from '../../src/materials/visual/bubbles/mapping';
const base = bubbleParams({}, 'draft', 'displacement').sim;
const p = { ...base, sourceFromTop: false };
const still = { cols: 16, rows: 9, field: new Float32Array(288) };
it('pops only contacted particles while untouched bubbles continue falling', () => {
  const sim = new ContactBubbleSim(1500, 640, 360);
  sim.reset(7);
  sim.step(still, p, 1 / 60);
  sim.px[0] = sim.px[1] = 0.8;
  sim.py[0] = 0.8;
  sim.py[1] = 0.2;
  const input = {
    ...still,
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 && i < 144 ? 0.8 : 0)),
  };
  const y = sim.py[1];
  sim.step(input, p, 1 / 60);
  expect(sim.wear[0]).toBeGreaterThanOrEqual(1);
  expect(sim.wear[1]).toBe(0);
  expect(sim.py[1]).toBeLessThan(y);
  sim.wear[0] = 2;
  sim.step(still, p, 1 / 60);
  expect(sim.py[0]).toBeGreaterThan(1);
  expect(sim.wear[0]).toBe(0);
});

it('staggers a batch of popped bubbles over the fall cycle and redistributes entry positions', () => {
  const a = new ContactBubbleSim(1500, 640, 360),
    b = new ContactBubbleSim(1500, 640, 360);
  for (const sim of [a, b]) {
    sim.reset(7);
    sim.step(still, p, 1 / 60);
    for (let i = 0; i < 200; i++) {
      sim.wear[i] = 2;
      sim.px[i] = 0.8;
    }
    sim.step(still, p, 1 / 60);
  }
  const delays = a.birthDelay.subarray(0, 200);
  expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThan(2);
  expect(new Set(delays).size).toBeGreaterThan(190);
  expect(Math.max(...a.px.subarray(0, 200)) - Math.min(...a.px.subarray(0, 200))).toBeGreaterThan(
    1,
  );
  expect(a.birthDelay).toEqual(b.birthDelay);
  expect(a.px).toEqual(b.px);
});

it('gentle motion pushes existing bubbles without popping them', () => {
  const sim = new ContactBubbleSim(1500, 640, 360);
  sim.reset(7);
  sim.step(still, p, 1 / 60);
  const before = sim.dx.slice();
  const input = {
    ...still,
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? 0.15 : 0)),
  };
  for (let i = 0; i < 30; i++) sim.step(input, p, 1 / 60);
  expect(sim.dx).not.toEqual(before);
  expect(sim.wear.some((wear) => wear >= 1)).toBe(false);
  expect(sim.mist.count).toBe(0);
});

it('a sharp sweep pops a few with mist, rather than erasing the field', () => {
  const sim = new ContactBubbleSim(1500, 640, 360);
  sim.reset(7);
  const params = { ...p, fallSpeed: 0, walk: 0 };
  sim.step(still, params, 1 / 60);
  for (let i = 0; i < sim.count; i++) {
    sim.px[i] = 0.8;
    sim.py[i] = 0.5;
  }
  const input = {
    ...still,
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? 0.8 : 0)),
  };
  sim.step(input, params, 1 / 60);
  const popped = () => Array.from(sim.wear.subarray(0, sim.count)).filter((v) => v >= 1).length;
  expect(popped()).toBe(3);
  expect(sim.mist.count).toBe(18);
  for (let i = 0; i < 20; i++) sim.step(input, params, 1 / 60);
  expect(popped()).toBeLessThanOrEqual(3);
  expect(sim.mist.count).toBe(18); // No further bursts during sustained movement.
  expect(sim.count).toBeGreaterThan(100);
  sim.reset(7);
  expect(sim.mist.count).toBe(0);
});
