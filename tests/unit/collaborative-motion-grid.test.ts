import { describe, expect, it } from 'vitest';
import { motionRegion } from '../../src/screens/Collaborative/motionGrid';
import type { SignatureFrame } from '../../src/signature/types';

function movementAt(region: number | null): SignatureFrame {
  const cols = 9;
  const rows = 9;
  const field = new Float32Array(cols * rows * 2);
  if (region !== null) {
    const row = Math.floor(region / 3) * 3 + 1;
    const col = (region % 3) * 3 + 1;
    field[(row * cols + col) * 2] = 0.18;
  }
  return { cols, rows, field } as SignatureFrame;
}

describe('collaborative live sound grid', () => {
  it('maps each moving third of the camera frame to the matching sound cell', () => {
    for (let region = 0; region < 9; region++) {
      expect(motionRegion(movementAt(region))).toBe(region);
    }
  });

  it('leaves the grid inactive when the camera frame is still', () => {
    expect(motionRegion(movementAt(null))).toBeNull();
  });
});
