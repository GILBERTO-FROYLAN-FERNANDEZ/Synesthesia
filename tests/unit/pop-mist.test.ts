import { expect, it } from 'vitest';
import { PopMist } from '../../src/materials/visual/bubbles/PopMist';
it('spreads from a pop then drifts downward and expires', () => {
  const mist = new PopMist();
  mist.reset(7);
  mist.emit(0.5, 0.5, 1);
  expect(mist.count).toBe(6);
  const initial = mist.y.slice(0, 6);
  for (let i = 0; i < 30; i++) mist.step(1 / 60);
  for (let i = 0; i < 6; i++) expect(mist.y[i]).toBeLessThan(initial[i]);
  for (let i = 0; i < 120; i++) mist.step(1 / 60);
  for (let i = 0; i < 6; i++) expect(mist.age[i]).toBeGreaterThan(mist.lifetime[i]);
});
it('stays bounded and reset replays the spray', () => {
  const mist = new PopMist();
  mist.reset(7);
  mist.emit(0.5, 0.5, 1);
  const first = mist.vx.slice(0, 6);
  mist.reset(7);
  mist.emit(0.5, 0.5, 1);
  expect(mist.vx.slice(0, 6)).toEqual(first);
  for (let i = 0; i < 600; i++) mist.emit(0.5, 0.5, 1);
  expect(mist.count).toBe(mist.capacity);
});
