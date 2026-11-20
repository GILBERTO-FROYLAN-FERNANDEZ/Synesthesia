import { expect, it } from 'vitest';
import {
  movementMapping,
  movementSettings,
  mappingForVisual,
} from '../../src/materials/visual/movement';
import { PathBubbleSim } from '../../src/materials/visual/bubbles/PathBubbleSim';
import { bubbleParams } from '../../src/materials/visual/bubbles/mapping';

it('retains all original presets and supports sampled interaction with existing material', () => {
  expect(movementSettings('wake')).toEqual({ sampled: false, existing: false });
  expect(movementSettings('lines')).toEqual({ sampled: true, existing: false });
  expect(movementSettings('displacement')).toEqual({ sampled: false, existing: true });
  for (const sampled of [false, true])
    for (const existing of [false, true])
      expect(movementSettings(movementMapping(sampled, existing))).toEqual({ sampled, existing });
});

it('full generated bubbles follow the moving area, start empty, and replay deterministically', () => {
  const params = bubbleParams({}, 'draft', 'lines').sim;
  const input = { cols: 16, rows: 9, field: new Float32Array(288) };
  const a = new PathBubbleSim(1500, 640, 360, true);
  a.reset(7);
  for (let i = 0; i < 60; i++) a.step(input, params, 1 / 60);
  expect(a.count).toBe(0);
  // Only the left half is moving. Emissions must remain in that region.
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 7; col++) input.field[(row * 16 + col) * 2] = 0.2;
  const b = new PathBubbleSim(1500, 640, 360, true);
  b.reset(7);
  a.reset(7);
  for (let i = 0; i < 30; i++) {
    a.step(input, params, 1 / 60);
    b.step(input, params, 1 / 60);
  }
  expect(a.count).toBeGreaterThan(10);
  expect(a.px).toEqual(b.px);
  for (let i = 0; i < a.count; i++) expect(a.px[i]).toBeLessThan(a.worldWidth * 0.55);
  input.field.fill(0);
  for (let i = 0; i < 600; i++) a.step(input, params, 1 / 60);
  expect(a.count).toBe(0);
});

it('rooted grass coerces generated movement into the corresponding existing mode', () => {
  expect(mappingForVisual('grass', 'wake')).toBe('displacement');
  expect(mappingForVisual('grass', 'lines')).toBe('sampled-displacement');
  expect(mappingForVisual('grass', 'sampled-displacement')).toBe('sampled-displacement');
});
