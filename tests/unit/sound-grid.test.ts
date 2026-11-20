import { afterEach, describe, expect, it } from 'vitest';
import {
  bendCents,
  DEFAULT_ACTIVITY,
  fullScaleFromResponse,
  holdCutoff,
  holdGain,
  measurePointZones,
  measureZones,
  midiToHz,
  noteName,
  pitchRank,
  SoundGridEngine,
  strikeGain,
  VOICES,
  zoneAt,
  ZoneActivity,
  zoneNote,
  zonePan,
  type GridLayout,
  type SoundGridSnapshot,
} from '../../src/live/soundGrid';

const G3: GridLayout = { cols: 3, rows: 3 };

/** A cols × rows field, still except one cell moving at (u, v). */
function fieldWith(cols: number, rows: number, cell: [number, number] | null, u = 0.5, v = 0) {
  const field = new Float32Array(cols * rows * 2);
  if (cell) {
    const [c, r] = cell;
    field[(r * cols + c) * 2] = u;
    field[(r * cols + c) * 2 + 1] = v;
  }
  return { cols, rows, field };
}

describe('sound grid layout', () => {
  it('rises in pitch from the bottom-left zone to the top-right one', () => {
    expect(pitchRank(6, G3)).toBe(0); // bottom-left
    expect(pitchRank(8, G3)).toBe(2); // bottom-right
    expect(pitchRank(0, G3)).toBe(6); // top-left
    expect(pitchRank(2, G3)).toBe(8); // top-right
  });

  it('walks the scale up from the root, octave after octave', () => {
    // Pentatonic from C3 (48): C D E G A C' D' E' G'
    const notes = [6, 7, 8, 3, 4, 5, 0, 1, 2].map((z) => zoneNote(z, G3, 'pentatonic', 48));
    expect(notes).toEqual([48, 50, 52, 55, 57, 60, 62, 64, 67]);
  });

  it('names and tunes notes', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C♯4');
    expect(noteName(48)).toBe('C3');
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });

  it('places columns across the stereo field', () => {
    expect(zonePan(3, G3)).toBeCloseTo(-0.7);
    expect(zonePan(4, G3)).toBeCloseTo(0);
    expect(zonePan(5, G3)).toBeCloseTo(0.7);
    expect(zonePan(0, { cols: 1, rows: 2 })).toBe(0);
  });
});

describe('sound grid zones', () => {
  it('finds the zone under a point, mirrored or not', () => {
    expect(zoneAt(0.1, 0.1, G3, false)).toBe(0);
    expect(zoneAt(0.1, 0.1, G3, true)).toBe(2);
    expect(zoneAt(0.99, 0.99, G3, false)).toBe(8);
    expect(zoneAt(1, 1, G3, false)).toBe(8);
    expect(zoneAt(-0.1, 0.5, G3, false)).toBe(-1);
    expect(zoneAt(Number.NaN, 0.5, G3, false)).toBe(-1);
  });

  it('puts movement in each third of the field into the matching zone', () => {
    for (let zone = 0; zone < 9; zone++) {
      const c = (zone % 3) * 3 + 1;
      const r = Math.floor(zone / 3) * 3 + 1;
      const motion = measureZones(fieldWith(9, 9, [c, r]), G3, false);
      const loudest = motion.level.indexOf(Math.max(...motion.level));
      expect(loudest).toBe(zone);
      expect([...motion.level].filter((l) => l > 0)).toHaveLength(1);
    }
  });

  it('mirrors columns and horizontal flow to match the mirrored preview', () => {
    const plain = measureZones(fieldWith(9, 9, [0, 4], 0.4), G3, false);
    const mirrored = measureZones(fieldWith(9, 9, [0, 4], 0.4), G3, true);
    expect(plain.level[3]).toBeGreaterThan(0); // camera-left, middle row
    expect(mirrored.level[5]).toBeCloseTo(plain.level[3]); // shows on screen-right
    expect(plain.flowX[3]).toBeGreaterThan(0);
    expect(mirrored.flowX[5]).toBeLessThan(0);
  });

  it('measures RMS speed, so a small moving part of a zone is not diluted away', () => {
    // One moving cell of nine at 0.9: mean would be 0.1, RMS is 0.3.
    const motion = measureZones(fieldWith(3, 3, [1, 1], 0.9), { cols: 1, rows: 1 }, false);
    expect(motion.level[0]).toBeCloseTo(0.3, 5);
  });

  it('is silent for a still frame and tolerates an empty one', () => {
    expect([...measureZones(fieldWith(24, 18, null), G3, true).level].every((l) => l === 0)).toBe(
      true,
    );
    const empty = measureZones({ cols: 1, rows: 1, field: new Float32Array(0) }, G3, true);
    expect(empty.level).toHaveLength(9);
  });

  it('reuses its output and resizes it for a new layout', () => {
    const out = measureZones(fieldWith(9, 9, [1, 1]), G3, false);
    expect(measureZones(fieldWith(9, 9, [1, 1]), G3, false, out)).toBe(out);
    expect(
      measureZones(fieldWith(9, 9, [1, 1]), { cols: 4, rows: 4 }, false, out).level,
    ).toHaveLength(16);
  });

  it('turns body landmark speed into zone speed in field units', () => {
    const before = [{ x: 0.1, y: 0.5 }];
    const after = [{ x: 0.2, y: 0.5 }];
    // Square frame: moving 0.1 of the width in 0.1 s is 1 width/s = 1/√2 diagonals/s.
    const motion = measurePointZones(after, before, 0.1, 1, G3, false);
    expect(motion.level[3]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(motion.flowX[3]).toBeGreaterThan(0);
    const mirrored = measurePointZones(after, before, 0.1, 1, G3, true);
    expect(mirrored.level[5]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('ignores landmarks that are hidden or have no previous position', () => {
    const hidden = measurePointZones(
      [{ x: 0.5, y: 0.5, visibility: 0.1 }],
      [{ x: 0.4, y: 0.5 }],
      0.1,
      1,
      G3,
      false,
    );
    expect(Math.max(...hidden.level)).toBe(0);
    const first = measurePointZones([{ x: 0.5, y: 0.5 }], null, 0.1, 1, G3, false);
    expect(Math.max(...first.level)).toBe(0);
  });
});

describe('sound grid activity', () => {
  const dt = 1 / 30;
  const full = DEFAULT_ACTIVITY.fullScale;

  it('strikes once when movement starts in a zone, then holds', () => {
    const activity = new ZoneActivity({ cols: 2, rows: 1 });
    const moving = [full, 0];
    let state = activity.update(moving, dt);
    expect(state.onset[0]).toBe(1);
    expect(state.velocity[0]).toBeCloseTo(1);
    expect(state.onset[1]).toBe(0);
    for (let i = 0; i < 10; i++) {
      state = activity.update(moving, dt);
      expect(state.onset[0]).toBe(0);
      expect(state.active[0]).toBe(1);
    }
    expect(state.level[0]).toBeGreaterThan(0.9);
  });

  it('rings down after movement stops and closes the gate', () => {
    const activity = new ZoneActivity({ cols: 1, rows: 1 });
    for (let i = 0; i < 15; i++) activity.update([full], dt);
    const peak = activity.state.level[0];
    activity.update([0], dt);
    expect(activity.state.level[0]).toBeLessThan(peak);
    expect(activity.state.level[0]).toBeGreaterThan(peak * 0.8); // release, not a cut
    for (let i = 0; i < 60; i++) activity.update([0], dt);
    expect(activity.state.active[0]).toBe(0);
    expect(activity.state.level[0]).toBeLessThan(0.01);
  });

  it('does not strike on movement below the threshold', () => {
    const activity = new ZoneActivity({ cols: 1, rows: 1 });
    for (let i = 0; i < 30; i++) {
      expect(activity.update([full * DEFAULT_ACTIVITY.onThreshold * 0.5], dt).onset[0]).toBe(0);
    }
  });

  it('strikes again on a sudden accent, but not within the refractory time', () => {
    const activity = new ZoneActivity({ cols: 1, rows: 1 });
    activity.update([full * 0.2], dt); // first strike
    expect(activity.update([full], dt).onset[0]).toBe(0); // surge, but too soon
    for (let i = 0; i < 30; i++) activity.update([full * 0.2], dt);
    expect(activity.update([full], dt).onset[0]).toBe(1); // accent
  });

  it('maps Response to a full-scale speed, higher response = smaller movements', () => {
    expect(fullScaleFromResponse(0)).toBeCloseTo(0.8);
    expect(fullScaleFromResponse(1)).toBeCloseTo(0.08);
    expect(fullScaleFromResponse(0.5)).toBeCloseTo(Math.sqrt(0.8 * 0.08));
    expect(fullScaleFromResponse(Number.NaN)).toBeCloseTo(fullScaleFromResponse(0.5));
  });
});

describe('sound grid voices', () => {
  it('keeps the sum of all hold voices under full scale', () => {
    for (const zones of [4, 9, 12, 16]) {
      expect(holdGain(1, zones) * zones).toBeLessThan(2.5);
      expect(holdGain(1, zones) * Math.sqrt(zones)).toBeLessThanOrEqual(0.45 + 1e-9);
    }
    expect(holdGain(0, 9)).toBe(0);
    expect(holdGain(0.5, 9)).toBeLessThan(holdGain(1, 9) / 2); // quiet for small movement
  });

  it('opens the hold filter with movement', () => {
    const spec = VOICES.reed;
    expect(holdCutoff(spec, 0)).toBe(spec.hold.cutoffBase);
    expect(holdCutoff(spec, 1)).toBe(spec.hold.cutoffBase + spec.hold.cutoffSpan);
    expect(holdCutoff(spec, 2)).toBe(holdCutoff(spec, 1));
  });

  it('bends up for upward movement, within ±40 cents', () => {
    expect(bendCents(-1, 0.3)).toBe(40);
    expect(bendCents(1, 0.3)).toBe(-40);
    expect(bendCents(0, 0.3)).toBeCloseTo(0);
  });

  it('scales strikes with velocity', () => {
    expect(strikeGain(0)).toBe(0);
    expect(strikeGain(1)).toBeCloseTo(0.32);
    expect(strikeGain(0.5)).toBeLessThan(strikeGain(1));
  });
});

describe('sound grid engine (without audio)', () => {
  let engine: SoundGridEngine | null = null;
  afterEach(() => engine?.dispose());

  it('lights and strikes the zone the movement is in, mirrored', async () => {
    engine = new SoundGridEngine({ mirror: true });
    let snap: SoundGridSnapshot | null = null;
    engine.subscribe((s) => (snap = s));
    // Camera-left top cell → screen-right top zone (2) when mirrored.
    for (let i = 0; i < 6; i++) {
      engine.update(fieldWith(9, 9, [1, 1], 0.6));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(snap).not.toBeNull();
    const s = snap as unknown as SoundGridSnapshot;
    expect(s.level[2]).toBeGreaterThan(0.3);
    expect(s.active[2]).toBe(1);
    expect(s.strikes[2]).toBe(1);
    expect(s.level[0]).toBe(0);
    expect(s.notes).toHaveLength(9);
    expect(s.sounding).toBe(false);
  });

  it('rebuilds its zones and notes when the grid changes', () => {
    engine = new SoundGridEngine();
    let snap: SoundGridSnapshot | null = null;
    engine.subscribe((s) => (snap = s));
    engine.configure({ size: 3, root: 36, scale: 'major' });
    const s = snap as unknown as SoundGridSnapshot;
    expect(s.layout).toEqual({ cols: 4, rows: 4 });
    expect(s.notes).toHaveLength(16);
    expect(s.notes[12]).toBe(36); // bottom-left
    expect(Math.max(...s.notes)).toBe(36 + 24 + 2); // 16th step of the major scale
  });

  it('stays usable after dispose (StrictMode remounts)', () => {
    engine = new SoundGridEngine({ mirror: false });
    engine.dispose();
    let snap: SoundGridSnapshot | null = null;
    engine.subscribe((s) => (snap = s));
    engine.update(fieldWith(9, 9, [1, 1], 0.6));
    expect((snap as unknown as SoundGridSnapshot).level[0]).toBeGreaterThan(0);
  });
});
