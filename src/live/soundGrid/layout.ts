/**
 * Sound grid layout: how the camera frame is cut into zones and which note each zone plays.
 *
 * Zones are numbered the way they appear on screen: row 0 is the top, column 0 is the left
 * of the (mirrored) camera preview, so zone `row * cols + col`. Pitch rises from the
 * bottom-left zone to the top-right one, like a pad controller: low notes near the floor,
 * high notes above the head.
 *
 * Pure: no Web Audio, no clocks.
 */

export interface GridLayout {
  cols: number;
  rows: number;
}

/** The grid sizes offered in the panel, smallest first. */
export const GRID_SIZES: readonly GridLayout[] = [
  { cols: 2, rows: 2 },
  { cols: 3, rows: 3 },
  { cols: 4, rows: 3 },
  { cols: 4, rows: 4 },
];

export const DEFAULT_GRID_SIZE = 1; // 3 × 3

export function zoneCount(layout: GridLayout): number {
  return layout.cols * layout.rows;
}

export const SCALES = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
} as const satisfies Record<string, readonly number[]>;

export type ScaleId = keyof typeof SCALES;
export const SCALE_IDS: readonly ScaleId[] = ['pentatonic', 'major', 'minor', 'wholeTone'];
export const SCALE_LABELS: Record<ScaleId, string> = {
  pentatonic: 'Pentatonic',
  major: 'Major',
  minor: 'Minor',
  wholeTone: 'Whole tone',
};

/** Root notes offered in the panel (MIDI note numbers). */
export const ROOTS: readonly number[] = [36, 41, 43, 48, 53, 55, 60];
export const DEFAULT_ROOT = 48; // C3

/** Column and row of a zone index. */
export function zonePosition(zone: number, layout: GridLayout): { col: number; row: number } {
  return { col: zone % layout.cols, row: Math.floor(zone / layout.cols) };
}

/**
 * Order of a zone from low to high pitch: 0 at the bottom-left, rising left to right, then
 * up a row.
 */
export function pitchRank(zone: number, layout: GridLayout): number {
  const { col, row } = zonePosition(zone, layout);
  return (layout.rows - 1 - row) * layout.cols + col;
}

/** MIDI note a zone plays: the scale walked upward from the root, octave after octave. */
export function zoneNote(zone: number, layout: GridLayout, scale: ScaleId, root: number): number {
  const steps = SCALES[scale];
  const rank = pitchRank(zone, layout);
  const octave = Math.floor(rank / steps.length);
  return root + 12 * octave + (steps[rank % steps.length] ?? 0);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** "C3", "F♯4". Middle C (MIDI 60) is C4. */
export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

/** Stereo position of a zone's column: −0.7 at the left edge to 0.7 at the right. */
export function zonePan(zone: number, layout: GridLayout, width = 0.7): number {
  if (layout.cols <= 1) return 0;
  const { col } = zonePosition(zone, layout);
  return (col / (layout.cols - 1)) * 2 * width - width;
}
