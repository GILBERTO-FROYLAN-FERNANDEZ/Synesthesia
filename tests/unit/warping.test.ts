import { expect, it } from 'vitest';
import { WarpSim } from '../../src/materials/visual/warping/WarpSim';
import {
  getVisualMaterial,
  listVisualMaterials,
  visualIdForMapping,
} from '../../src/materials/registry';
function field(speed: number) {
  return {
    cols: 16,
    rows: 9,
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? speed : 0)),
  };
}
function step(sim: WarpSim, speed: number, n: number) {
  for (let i = 0; i < n; i++) sim.step(field(speed), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60);
}
it('deforms in the movement direction and returns to rest', () => {
  const sim = new WarpSim();
  step(sim, 0.2, 45);
  expect(sim.data[(18 * 64 + 32) * 4]).toBeGreaterThan(0.01);
  step(sim, 0, 360);
  expect(Math.max(...sim.data.filter((_, i) => i % 4 < 3).map(Math.abs))).toBeLessThan(0.001);
});
it('ignores tiny noise, remains bounded, and replays after reset', () => {
  const sim = new WarpSim();
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
it('pops on contact and reforms without repeatedly popping under a held gesture', () => {
  const sim = new WarpSim();
  step(sim, 0.2, 15);
  expect(sim.data[(18 * 64 + 32) * 4 + 3]).toBeGreaterThan(0);
  step(sim, 0.2, 240);
  expect(sim.data[(18 * 64 + 32) * 4 + 3]).toBe(0);
  step(sim, 0, 60);
  step(sim, 0.2, 15);
  expect(sim.data[(18 * 64 + 32) * 4 + 3]).toBeGreaterThan(0);
});
it('keeps Warping scenes separate from the usual medium choices', () => {
  expect(listVisualMaterials('warping').map((e) => e.meta.name)).toEqual([
    'Color field',
    'Grass',
    'Falling bubbles',
  ]);
  expect(listVisualMaterials().some((e) => e.meta.id.startsWith('warp-'))).toBe(false);
  expect(visualIdForMapping('honey', 'warping')).toBe('warp-colors');
  expect(visualIdForMapping('warp-grass', 'ripples')).toBe('water');
  expect(getVisualMaterial('warp-grass')).toBeDefined();
});

it('continues building color magnification under sustained input, then relaxes', () => {
  const sim = new WarpSim(),
    at = (18 * 64 + 32) * 4 + 2;
  const tick = (speed: number, n: number) => {
    for (let i = 0; i < n; i++)
      sim.step(field(speed), 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'growth');
  };
  tick(0.2, 120);
  const first = sim.data[at];
  tick(0.2, 240);
  expect(sim.data[at]).toBeGreaterThan(first * 2);
  tick(0, 360);
  expect(sim.data[at]).toBeLessThan(0.01);
});
it('Grass returns upright sooner after movement passes', () => {
  const grass = new WarpSim(),
    normal = new WarpSim();
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

it('keeps local growth continuous when movement jumps between separate areas', () => {
  const sim = new WarpSim();
  const left = field(0),
    right = field(0);
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 16; col++) {
      if (col < 5) left.field[(row * 16 + col) * 2] = 0.2;
      if (col > 10) right.field[(row * 16 + col) * 2] = 0.2;
    }
  for (let i = 0; i < 120; i++) sim.step(left, 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'growth');
  const before = sim.data.slice();
  sim.step(right, 640, 360, 0.5, 0.5, 0.5, 0.5, 1 / 60, 'growth');
  for (let i = 2; i < sim.data.length; i += 4)
    expect(Math.abs(sim.data[i] - before[i])).toBeLessThan(0.05);
  expect(sim.data[(18 * 64 + 8) * 4 + 2]).toBeGreaterThan(0.2);
});
