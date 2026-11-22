import { describe, expect, it } from 'vitest';
import { LineSim } from '../../src/materials/visual/lines/LineSim';
import { LineGeometry } from '../../src/materials/visual/lines/LineGeometry';

function path() {
  const sim = new LineSim();
  sim.reset(7);
  sim.count = 4;
  sim.time = 0.25;
  const points = [
    [0.2, 0.3],
    [0.25, 0.3],
    [0.29, 0.33],
    [0.32, 0.36],
  ];
  let arc = 0;
  for (let i = 0; i < 3; i++) {
    sim.x0[i] = points[i][0];
    sim.y0[i] = points[i][1];
    sim.x1[i] = points[i + 1][0];
    sim.y1[i] = points[i + 1][1];
    sim.path[i] = 3;
    sim.fromTime[i] = i / 60;
    sim.born[i] = (i + 1) / 60;
    sim.strength[i] = 0.5;
    sim.turn[i] = Math.atan2(sim.y1[i] - sim.y0[i], sim.x1[i] - sim.x0[i]) / (Math.PI * 2);
    sim.arc[i] = arc;
    arc += Math.hypot(sim.x1[i] - sim.x0[i], sim.y1[i] - sim.y0[i]);
  }
  // A different sampled stroke starts at the same place as the preceding one ends.
  sim.x0[3] = sim.x1[2];
  sim.y0[3] = sim.y1[2];
  sim.x1[3] = 0.36;
  sim.y1[3] = 0.36;
  sim.path[3] = 4;
  sim.fromTime[3] = 0.05;
  sim.born[3] = 0.067;
  return sim;
}

function expectJoined(geometry: LineGeometry) {
  const out = geometry.instances;
  for (let i = 0; i < 2; i++) {
    const a = i * 16,
      b = (i + 1) * 16;
    expect(out[a + 2]).toBe(out[b]);
    expect(out[a + 3]).toBe(out[b + 1]);
    expect(out[a + 6]).toBeCloseTo(out[b + 4], 6);
    expect(out[a + 7]).toBeCloseTo(out[b + 5], 6);
    expect(out[a + 9]).toBe(out[b + 8]);
  }
  expect(geometry.next[2]).toBe(-1);
  expect(geometry.previous[3]).toBe(-1);
}

describe('continuous line material geometry', () => {
  it('gives Honey shared edges, normals, and fade at joins, without connecting separate strokes', () => {
    const sim = path();
    const geometry = new LineGeometry(sim.capacity);
    expect(geometry.build(sim, 1.35, 1)).toBe(4);
    expectJoined(geometry);
    expect(geometry.x1[1]).toBe(sim.x1[1]);
    expect(geometry.y1[1]).toBe(sim.y1[1]);
    expect(Math.floor(geometry.instances[15])).toBe(1); // rounded tail
    expect(Math.floor(geometry.instances[31])).toBe(0); // no internal cap or seam
    expect(Math.floor(geometry.instances[47])).toBe(2); // rounded head
  });
  it('lets Smoke lift and curl with age, keeping its joins coherent and its source unchanged', () => {
    const sim = path();
    const geometry = new LineGeometry(sim.capacity);
    const original = Array.from(sim.y1.subarray(0, 4));
    geometry.build(sim, 6, 2);
    const x = geometry.x1[2],
      y = geometry.y1[2];
    sim.time = 3.25;
    expect(geometry.build(sim, 6, 2)).toBe(4);
    expectJoined(geometry);
    expect(geometry.y1[2] - y).toBeGreaterThan(0.025);
    expect(Math.abs(geometry.x1[2] - x)).toBeGreaterThan(0.001);
    expect(Array.from(sim.y1.subarray(0, 4))).toEqual(original);
    const image = geometry.instances.slice(0, 64);
    geometry.build(sim, 6, 2);
    expect(geometry.instances.slice(0, 64)).toEqual(image);
    sim.time = 7;
    expect(geometry.build(sim, 6, 2)).toBe(0);
  });
});

it('eases Smoke into its full width and tapers the start without breaking joins', () => {
  const sim = path();
  const geometry = new LineGeometry(sim.capacity);
  sim.time = 0.07;
  geometry.build(sim, 6, 2);
  const early = geometry.thickness[1];
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(0.4);
  expect(geometry.thickness[0]).toBeLessThan(early * 0.1);
  expect(geometry.thickness[1]).toBeCloseTo(geometry.thickness[2], 6);
  sim.time = 0.3;
  geometry.build(sim, 6, 2);
  expect(geometry.thickness[1]).toBeCloseTo(1, 6);
  expect(geometry.thickness[0]).toBeCloseTo(0.08, 6);
  expectJoined(geometry);
});

it('smooths Smoke corners with shared edges and continuous shading distance', () => {
  const sim = path();
  const geometry = new LineGeometry(sim.capacity);
  const before =
    Math.atan2(sim.y1[1] - sim.y0[1], sim.x1[1] - sim.x0[1]) -
    Math.atan2(sim.y1[0] - sim.y0[0], sim.x1[0] - sim.x0[0]);
  geometry.build(sim, 6, 2);
  const after =
    Math.atan2(geometry.y1[1] - geometry.y0[1], geometry.x1[1] - geometry.x0[1]) -
    Math.atan2(geometry.y1[0] - geometry.y0[0], geometry.x1[0] - geometry.x0[0]);
  expect(Math.abs(after)).toBeLessThan(Math.abs(before));
  expectJoined(geometry);
  for (let i = 0; i < 2; i++) {
    const at = i * 16;
    const length = Math.hypot(
      geometry.instances[at + 2] - geometry.instances[at],
      geometry.instances[at + 3] - geometry.instances[at + 1],
    );
    expect(geometry.instances[at + 14] + length).toBeCloseTo(geometry.instances[at + 30], 6);
  }
  const snapshot = geometry.instances.slice(0, 64);
  geometry.build(sim, 6, 2);
  expect(geometry.instances.slice(0, 64)).toEqual(snapshot);
});
