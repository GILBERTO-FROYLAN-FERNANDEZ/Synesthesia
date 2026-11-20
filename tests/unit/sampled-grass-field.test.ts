import { expect, it } from 'vitest';
import { LineSim } from '../../src/materials/visual/lines/LineSim';
import { PathField } from '../../src/materials/visual/lines/PathField';

it('briefly holds sampled grass forces, follows reversals, and fades after movement stops', () => {
  const source = new LineSim();
  source.emittedCount = 1;
  source.emittedStart = 0;
  source.x0[0] = 0.4;
  source.x1[0] = 0.42;
  source.y0[0] = source.y1[0] = 0.5;
  const field = new PathField();
  field.resize(16 / 9, 1);
  field.build(source, 0.065, 1 / 60, 0.16);
  const initial = Math.max(...field.field);
  const at = field.field.indexOf(initial);
  expect(initial).toBeGreaterThan(0.1);
  source.emittedCount = 0;
  for (let i = 0; i < 6; i++) field.build(source, 0.065, 1 / 60, 0.16);
  expect(field.field[at]).toBeGreaterThan(initial * 0.4);
  expect(field.field[at]).toBeLessThan(initial);
  source.emittedCount = 1;
  source.x0[0] = 0.42;
  source.x1[0] = 0.4;
  field.build(source, 0.065, 1 / 60, 0.16);
  expect(field.field[at]).toBeLessThan(-initial * 0.9);
  source.emittedCount = 0;
  for (let i = 0; i < 180; i++) field.build(source, 0.065, 1 / 60, 0.16);
  expect(Math.max(...field.field.map(Math.abs))).toBeLessThan(1e-6);
});

it('other sampled mediums keep their immediate force release', () => {
  const source = new LineSim();
  source.emittedCount = 1;
  source.x0[0] = 0.4;
  source.x1[0] = 0.42;
  source.y0[0] = source.y1[0] = 0.5;
  const field = new PathField();
  field.resize(16 / 9, 1);
  field.build(source, 0.018, 1 / 60);
  expect(Math.max(...field.field)).toBeGreaterThan(0.1);
  source.emittedCount = 0;
  field.build(source, 0.018, 1 / 60);
  expect(field.field.every((v) => v === 0)).toBe(true);
});
