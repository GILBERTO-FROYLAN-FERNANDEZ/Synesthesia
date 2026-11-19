import { describe, expect, it } from 'vitest';
import { LiveMotionActivity } from '../../src/screens/Perform/liveActivity';

describe('live motion sound gate', () => {
  it('stays silent on small camera noise, opens on movement, and closes after stillness', () => {
    const gate = new LiveMotionActivity();
    expect(gate.update(0.003, 100, 1)).toBe(false);
    expect(gate.update(0.009, 150, 1)).toBe(false);
    expect(gate.update(0.02, 200, 1)).toBe(true);
    expect(gate.update(0.001, 300, 1)).toBe(true);
    expect(gate.update(0.001, 490, 1)).toBe(false);
    expect(gate.update(0.02, 550, 1)).toBe(true);
  });

  it('closes when camera frames stop and does not reopen on noise', () => {
    const gate = new LiveMotionActivity();
    expect(gate.update(0.003, 100, 2)).toBe(false);
    expect(gate.update(0.009, 150, 2)).toBe(false);
    expect(gate.update(0.02, 160, 2)).toBe(true);
    expect(gate.active(511)).toBe(false);
    expect(gate.update(0.003, 520, 2)).toBe(false);
    expect(gate.update(0.02, 550, 2)).toBe(true);
  });
});
