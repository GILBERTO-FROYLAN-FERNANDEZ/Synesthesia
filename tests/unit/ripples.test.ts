import { expect, it } from 'vitest';
import { RippleSim, type RippleParams } from '../../src/materials/visual/ripples/RippleSim';
import { visualMappingProperties } from '../../src/materials/visual/lines/properties';
import { WATER_PROPERTIES } from '../../src/materials/visual/water/properties';
const params: RippleParams = { density: 0.5, intensity: 0.5, range: 0.5, lifetime: 2 };
function field(speed: number) {
  return {
    cols: 16,
    rows: 9,
    field: Float32Array.from({ length: 288 }, (_, i) => (i % 2 === 0 ? speed : 0)),
  };
}
function run(seed = 7, density = 0.5, speed = 0.2) {
  const sim = new RippleSim();
  sim.reset(seed);
  for (let i = 0; i < 60; i++) sim.step(field(speed), { ...params, density }, 1 / 60);
  return sim;
}
it('starts empty and rejects weak capture noise', () => {
  expect(run(7, 0.5, 0).count).toBe(0);
  expect(run(7, 0.5, 0.003).count).toBe(0);
});
it('emits repeatably and reset replays the same events', () => {
  const a = run(),
    b = run();
  expect(a.count).toBeGreaterThan(60);
  expect(a.x).toEqual(b.x);
  expect(run(8).x).not.toEqual(a.x);
  a.reset(7);
  for (let i = 0; i < 60; i++) a.step(field(0.2), params, 1 / 60);
  expect(a.x).toEqual(b.x);
  expect(a.age).toEqual(b.age);
});
it('responds to density and strength without emitting once motion stops', () => {
  expect(run(7, 0.1).count).toBeLessThan(run(7, 0.9).count);
  const sim = run();
  const count = sim.count;
  for (let i = 0; i < 20; i++) sim.step(field(0), params, 1 / 60);
  expect(sim.count).toBe(count);
  for (let i = 0; i < 150; i++) sim.step(field(0), params, 1 / 60);
  expect(sim.count).toBe(0);
  expect(run(7, 0.5, 0.03).strength[0]).toBeLessThan(run().strength[0]);
});
it('keeps emission bounded under sustained motion and very long lifetimes', () => {
  const sim = new RippleSim();
  sim.reset(7);
  for (let i = 0; i < 900; i++)
    sim.step(field(10), { ...params, density: 1, lifetime: 100 }, 1 / 60);
  expect(sim.count).toBe(sim.capacity);
});
it('places events inside the active projected region', () => {
  const input = field(0);
  input.field[(4 * 16 + 8) * 2] = 0.3;
  const sim = new RippleSim();
  sim.reset(7);
  for (let i = 0; i < 120; i++) sim.step(input, params, 1 / 60);
  expect(sim.count).toBeGreaterThan(0);
  for (let i = 0; i < sim.count; i++) {
    expect(sim.x[i]).toBeGreaterThan(0.75);
    expect(sim.x[i]).toBeLessThan(1.15);
    expect(sim.y[i]).toBeGreaterThan(0.35);
    expect(sim.y[i]).toBeLessThan(0.65);
  }
});
it('offers ripple controls without changing medium definitions', () => {
  expect(
    visualMappingProperties(WATER_PROPERTIES, 'ripples').find((p) => p.id === 'size')?.label,
  ).toBe('Ripple size');
  expect(WATER_PROPERTIES.some((p) => p.id === 'size')).toBe(false);
});

it('builds more layers for faster motion without lowering the noise threshold', () => {
  const slow = run(7, 0.5, 0.03),
    fast = run(7, 0.5, 0.2);
  expect(fast.count).toBeGreaterThan(slow.count * 2);
});

it('reduces Smoke overlap without changing the shared motion threshold', () => {
  const sim = new RippleSim();
  sim.reset(7);
  for (let i = 0; i < 60; i++) sim.step(field(0.2), { ...params, emissionScale: 0.28 }, 1 / 60);
  expect(sim.count).toBeGreaterThan(10);
  expect(sim.count).toBeLessThan(run().count * 0.4);
  expect(
    visualMappingProperties(WATER_PROPERTIES, 'ripples').some((p) => p.id === 'fallSpeed'),
  ).toBe(false);
});

it('staggers Smoke emission and retention without resetting older rings on new movement', () => {
  const sim = new RippleSim();
  sim.reset(7);
  const smoke = { ...params, emissionScale: 0.28, independentTiming: true };
  for (let i = 0; i < 45; i++) sim.step(field(0.2), smoke, 1 / 60);
  expect(new Set(sim.age.subarray(0, sim.count)).size).toBeGreaterThan(8);
  expect(new Set(sim.durationScale.subarray(0, sim.count)).size).toBe(sim.count);
  const age = sim.age[0];
  for (let i = 0; i < 15; i++) sim.step(field(0), smoke, 1 / 60);
  sim.step(field(0.2), smoke, 1 / 60);
  expect(sim.age[0]).toBeCloseTo(age + 16 / 60, 9);
});
