import { describe, expect, it } from 'vitest';
import { HoneyStrands } from '../../src/materials/visual/lines/HoneyStrands';
import { LineSim } from '../../src/materials/visual/lines/LineSim';
import { PathField } from '../../src/materials/visual/lines/PathField';

function deposited() {
  const source = new LineSim();
  source.reset(7);
  source.time = 0.05;
  source.count = 3;
  source.emittedStart = 0;
  source.emittedCount = 3;
  for (let i = 0; i < 3; i++) {
    source.x0[i] = 0.2 + i * 0.06;
    source.y0[i] = 0.5;
    source.x1[i] = 0.26 + i * 0.06;
    source.y1[i] = 0.5;
    source.born[i] = (i + 1) / 60;
    source.fromTime[i] = i / 60;
    source.path[i] = 3;
    source.arc[i] = i * 0.06;
    source.strength[i] = 0.5;
  }
  return source;
}
function run(viscosity: number) {
  const source = deposited(),
    honey = new HoneyStrands();
  honey.step(source, { viscosity, lifetime: 6 }, 1 / 60);
  source.emittedCount = 0;
  for (let i = 0; i < 180; i++) {
    source.time += 1 / 60;
    honey.step(source, { viscosity, lifetime: 6 }, 1 / 60);
  }
  return honey;
}

describe('honey deposited along sampled paths', () => {
  it('keeps strands attached while released tips sag and collect thickness', () => {
    const honey = run(0.5);
    expect(honey.count).toBe(3);
    expect(honey.x0[0]).toBe(0.2);
    expect(honey.y0[0]).toBe(0.5);
    expect(honey.y1[2]).toBeLessThan(0.48);
    expect(honey.x0[1]).toBe(honey.x1[0]);
    expect(honey.y0[1]).toBe(honey.y1[0]);
    expect(honey.radius0[1]).toBe(honey.radius1[0]);
    expect(
      Math.max(...honey.radius1.subarray(0, 3)) - Math.min(...honey.radius1.subarray(0, 3)),
    ).toBeGreaterThan(0.05);
  });
  it('conserves deposited mass while it drains downhill, and replays deterministically', () => {
    const source = deposited(),
      honey = new HoneyStrands();
    honey.step(source, { viscosity: 0.5, lifetime: 6 }, 1 / 60);
    const mass = honey.mass.subarray(0, 3).reduce((a, b) => a + b, 0);
    const a = run(0.5),
      b = run(0.5);
    expect(a.mass.subarray(0, 3).reduce((x, y) => x + y, 0)).toBeCloseTo(mass, 10);
    expect(a.x1.subarray(0, 3)).toEqual(b.x1.subarray(0, 3));
    expect(a.y1.subarray(0, 3)).toEqual(b.y1.subarray(0, 3));
    expect(a.mass.subarray(0, 3)).toEqual(b.mass.subarray(0, 3));
    expect(a.mass[2]).toBeGreaterThan(a.mass[0]);
  });
  it('thicker honey settles more slowly, with finite bounded thickness', () => {
    const thin = run(0),
      thick = run(1);
    expect(thin.y1[2]).toBeLessThan(thick.y1[2]);
    for (const honey of [thin, thick]) {
      for (let i = 0; i < honey.count; i++) {
        expect(Number.isFinite(honey.x1[i]) && Number.isFinite(honey.y1[i])).toBe(true);
        expect(honey.radius1[i]).toBeGreaterThanOrEqual(0.35);
        expect(honey.radius1[i]).toBeLessThanOrEqual(2.6);
      }
    }
  });
});

describe('sampled paths as forces on a native medium', () => {
  it('is sparse, repeatable, preserves direction, and gets wider with the path width', () => {
    const source = deposited(),
      field = new PathField();
    field.resize(16 / 9, 1);
    const narrow = field.build(source, 0.01, 1 / 60).field.slice();
    expect(narrow.filter((x) => x !== 0).length).toBeGreaterThan(0);
    expect(narrow.filter((x) => x !== 0).length).toBeLessThan(narrow.length * 0.1);
    for (let i = 0; i < narrow.length; i += 2) {
      expect(narrow[i]).toBeGreaterThanOrEqual(0);
      expect(narrow[i + 1]).toBe(0);
    }
    expect(field.build(source, 0.01, 1 / 60).field).toEqual(narrow);
    expect(field.build(source, 0.04, 1 / 60).field.filter((x) => x !== 0).length).toBeGreaterThan(
      narrow.filter((x) => x !== 0).length,
    );
    source.emittedCount = 0;
    expect(field.build(source, 0.01, 1 / 60).field.every((x) => x === 0)).toBe(true);
  });
});
