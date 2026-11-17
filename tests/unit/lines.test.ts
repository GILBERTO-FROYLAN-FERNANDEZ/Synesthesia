import { describe, expect, it } from 'vitest';
import { LineSim, type LineParams } from '../../src/materials/visual/lines/LineSim';
import { visualMappingProperties } from '../../src/materials/visual/lines/properties';
import { getVisualMaterial, listVisualMaterials } from '../../src/materials/registry';
import { createSyntheticSampler } from '../../src/signature/synthetic';

const params: LineParams = {
  count: 54,
  range: 0.5,
  gain: 0.9,
  lag: 0.04,
  scatter: 0.1,
  lifetime: 1,
};
const still = { cols: 16, rows: 9, field: new Float32Array(16 * 9 * 2) };
function snapshot(sim: LineSim) {
  return Array.from({ length: sim.count }, (_, j) => {
    const i = (sim.start + j) % sim.capacity;
    return [sim.x0[i], sim.y0[i], sim.x1[i], sim.y1[i], sim.born[i], sim.turn[i], sim.arc[i]];
  });
}
function run(seed = 7, count = 54) {
  const sim = new LineSim();
  sim.setCanvas(960, 540);
  sim.reset(seed);
  const sampler = createSyntheticSampler('sweep');
  for (let i = 0; i < 120; i++) sim.step(sampler.sample(i / 60), { ...params, count }, 1 / 60);
  return sim;
}

describe('sampled lines', () => {
  it('is repeatable and reset replays the same paths', () => {
    const a = run(),
      b = run();
    expect(a.count).toBeGreaterThan(10);
    expect(snapshot(a)).toEqual(snapshot(b));
    a.reset(7);
    const sampler = createSyntheticSampler('sweep');
    for (let i = 0; i < 120; i++) a.step(sampler.sample(i / 60), params, 1 / 60);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(snapshot(run(8))).not.toEqual(snapshot(b));
  });
  it('draws nothing at rest and lets old trails disappear completely', () => {
    const sim = new LineSim();
    sim.reset(7);
    for (let i = 0; i < 120; i++) sim.step(still, params, 1 / 60);
    expect(sim.count).toBe(0);
    const moving = run();
    for (let i = 0; i < 180; i++) moving.step(still, params, 1 / 60);
    expect(moving.count).toBe(0);
  });
  it('keeps sampling sparse and responds to density', () => {
    expect(run(7, 12).count).toBeLessThan(run(7, 90).count);
  });
  for (const direction of [-1, 1]) {
    it(`follows ${direction < 0 ? 'left' : 'right'} without connecting unrelated sample points`, () => {
      const sim = new LineSim();
      sim.reset(7);
      const field = new Float32Array(still.field.length);
      for (let i = 0; i < field.length; i += 2) field[i] = direction * 0.3;
      for (let i = 0; i < 60; i++) sim.step({ ...still, field }, { ...params, scatter: 0 }, 1 / 60);
      expect(sim.count).toBeGreaterThan(50);
      for (const [x0, y0, x1, y1] of snapshot(sim)) {
        expect(direction * (x1 - x0)).toBeGreaterThan(0);
        expect(Math.abs(y1 - y0)).toBeLessThan(1e-12);
        expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThanOrEqual(0.040001);
      }
    });
  }
  it('bounds fast gestures and memory during prolonged input', () => {
    const sim = new LineSim();
    sim.reset(7);
    const field = new Float32Array(still.field.length).fill(100);
    for (let i = 0; i < 1200; i++)
      sim.step({ ...still, field }, { ...params, count: 96, lifetime: 4 }, 1 / 60);
    expect(sim.count).toBeGreaterThan(0);
    expect(sim.count).toBeLessThanOrEqual(sim.capacity);
    for (const [x0, y0, x1, y1] of snapshot(sim)) {
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThanOrEqual(0.040001);
      expect([x0, y0, x1, y1].every(Number.isFinite)).toBe(true);
    }
  });
  it('scales existing paths with the canvas aspect', () => {
    const sim = run();
    const before = snapshot(sim);
    sim.setCanvas(540, 540);
    expect(sim.worldWidth).toBe(1);
    expect(sim.count).toBe(before.length);
    expect(sim.x0[sim.start]).toBeCloseTo(before[0][0] / (16 / 9));
  });
  it('is a mapping rather than a medium and exposes appropriate line controls', () => {
    expect(listVisualMaterials().some((entry) => entry.meta.id === 'lines')).toBe(false);
    for (const id of ['water', 'honey', 'smoke', 'bubbles']) {
      const meta = getVisualMaterial(id)!.meta;
      const defs = visualMappingProperties(meta.properties, 'lines');
      expect(defs.some((def) => def.label === 'Line width')).toBe(true);
      expect(defs.some((def) => def.id === 'density')).toBe(true);
      expect(defs.some((def) => def.id === 'persistence')).toBe(true);
      expect(defs.some((def) => def.id === 'elasticity')).toBe(false);
    }
  });
});

describe('Smoke motion gate', () => {
  const smokeParams = { ...params, motionThreshold: 0.006, minimumTravel: 0.008 };
  function uniform(speed: number) {
    return {
      cols: 16,
      rows: 9,
      field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? speed : 0)),
    };
  }
  it('rejects continuous low-level jitter that the ordinary sampler records', () => {
    const smoke = new LineSim(),
      ordinary = new LineSim();
    smoke.reset(7);
    ordinary.reset(7);
    for (let i = 0; i < 120; i++) {
      smoke.step(uniform(0.003), smokeParams, 1 / 60);
      ordinary.step(uniform(0.003), params, 1 / 60);
    }
    expect(smoke.count).toBe(0);
    expect(ordinary.count).toBeGreaterThan(0);
  });
  it('rejects brief twitches but responds promptly to a deliberate swipe', () => {
    const smoke = new LineSim();
    smoke.reset(7);
    for (let i = 0; i < 120; i++)
      smoke.step(uniform(i % 12 === 0 ? 0.035 : 0), smokeParams, 1 / 60);
    expect(smoke.count).toBe(0);
    for (let i = 0; i < 8; i++) smoke.step(uniform(0.2), smokeParams, 1 / 60);
    expect(smoke.count).toBeGreaterThan(0);
  });
});
