import type { SignatureFrame } from '../../signature/types';

/** The strongest moving third of the camera image, laid out like the sound grid. */
export function motionRegion(frame: SignatureFrame): number | null {
  const strengths = new Float32Array(9);
  const counts = new Uint16Array(9);
  for (let row = 0; row < frame.rows; row++) {
    for (let col = 0; col < frame.cols; col++) {
      const cell = row * frame.cols + col;
      const region = Math.min(2, Math.floor((row * 3) / frame.rows)) * 3 +
        Math.min(2, Math.floor((col * 3) / frame.cols));
      strengths[region] += Math.hypot(frame.field[cell * 2], frame.field[cell * 2 + 1]);
      counts[region]++;
    }
  }
  let strongest = 0;
  let region: number | null = null;
  for (let index = 0; index < 9; index++) {
    const average = strengths[index] / Math.max(1, counts[index]);
    if (average > strongest) {
      strongest = average;
      region = index;
    }
  }
  return strongest >= 0.003 ? region : null;
}
