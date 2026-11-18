import { expect, it } from 'vitest';
import { ContactBubbleSim } from '../../src/materials/visual/bubbles/ContactBubbleSim';
import { bubbleParams } from '../../src/materials/visual/bubbles/mapping';
const p = bubbleParams({}, 'draft', 'warping').sim;
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
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 && i < 144 ? 0.3 : 0)),
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
