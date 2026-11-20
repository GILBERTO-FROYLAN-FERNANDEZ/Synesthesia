/**
 * Movement per zone, from either tracker:
 *
 * - `measureZones` reads a `SignatureFrame` (the optical-flow field from `trackLiveVideo`,
 *   or the body-masked field from the body-tracking worker). Every signature cell belongs to
 *   the zone that holds its centre.
 * - `measurePointZones` reads body landmarks (e.g. MediaPipe wrists and ankles, x/y in 0–1
 *   image coordinates) and turns each point's speed into the same units.
 *
 * Units are the signature's: field diagonals per second (SPEC 8.1). Zone `level` is the
 * root-mean-square speed of the zone's cells, so a hand that fills a fifth of a zone still
 * counts (a plain mean would dilute it by the still cells around it).
 *
 * The camera preview is mirrored (`transform: scaleX(-1)`), but the field is not. With
 * `mirror` on, zone columns and horizontal flow are flipped so a zone lights where the
 * performer sees their own hand.
 *
 * Pure: no Web Audio, no clocks.
 */
import type { SignatureFrame } from '../../signature/types';
import { zoneCount, type GridLayout } from './layout';

export interface ZoneMotion {
  /** RMS speed per zone, field diagonals per second. */
  level: Float32Array;
  /** Mean horizontal flow per zone (positive = toward screen right after mirroring). */
  flowX: Float32Array;
  /** Mean vertical flow per zone (positive = down, image coordinates). */
  flowY: Float32Array;
}

export function createZoneMotion(count: number): ZoneMotion {
  return {
    level: new Float32Array(count),
    flowX: new Float32Array(count),
    flowY: new Float32Array(count),
  };
}

/** Zone index of a point in 0–1 frame coordinates, or -1 outside the frame. */
export function zoneAt(x: number, y: number, layout: GridLayout, mirror: boolean): number {
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return -1;
  let col = Math.min(layout.cols - 1, Math.floor(x * layout.cols));
  const row = Math.min(layout.rows - 1, Math.floor(y * layout.rows));
  if (mirror) col = layout.cols - 1 - col;
  return row * layout.cols + col;
}

/**
 * Pool a signature frame's field into the zones of `layout`. Reuses `out` when it has the
 * right size.
 */
export function measureZones(
  frame: Pick<SignatureFrame, 'cols' | 'rows' | 'field'>,
  layout: GridLayout,
  mirror: boolean,
  out: ZoneMotion = createZoneMotion(zoneCount(layout)),
): ZoneMotion {
  const count = zoneCount(layout);
  if (out.level.length !== count) out = createZoneMotion(count);
  const sumSq = out.level;
  const sumX = out.flowX;
  const sumY = out.flowY;
  sumSq.fill(0);
  sumX.fill(0);
  sumY.fill(0);
  const cells = new Uint16Array(count);
  const { cols, rows, field } = frame;
  if (cols > 0 && rows > 0 && field.length >= cols * rows * 2) {
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) / rows;
      for (let c = 0; c < cols; c++) {
        const zone = zoneAt((c + 0.5) / cols, y, layout, mirror);
        const i = (r * cols + c) * 2;
        const u = field[i] ?? 0;
        const v = field[i + 1] ?? 0;
        sumSq[zone] += u * u + v * v;
        sumX[zone] += mirror ? -u : u;
        sumY[zone] += v;
        cells[zone]++;
      }
    }
  }
  for (let z = 0; z < count; z++) {
    const n = Math.max(1, cells[z] ?? 0);
    sumSq[z] = Math.sqrt(sumSq[z] / n);
    sumX[z] /= n;
    sumY[z] /= n;
  }
  return out;
}

/** A body landmark: x, y in 0–1 of the camera image (not mirrored), optional confidence. */
export interface TrackedPoint {
  x: number;
  y: number;
  visibility?: number;
}

/**
 * MediaPipe Pose landmark indices that make good "fingers" for the grid: wrists, index
 * fingertips and ankles. `res.landmarks[0]` from PoseLandmarker.detectForVideo holds 33.
 */
export const POSE_PLAYING_POINTS: readonly number[] = [15, 16, 19, 20, 27, 28];

/**
 * Zone motion from tracked points. Each point adds its speed (field diagonals per second,
 * from its move since `previous`) to the zone it is in now; flow follows the same mirroring
 * as `measureZones`. Points below `minVisibility`, or missing from `previous`, add nothing.
 */
export function measurePointZones(
  points: readonly TrackedPoint[],
  previous: readonly TrackedPoint[] | null,
  dt: number,
  aspect: number,
  layout: GridLayout,
  mirror: boolean,
  out: ZoneMotion = createZoneMotion(zoneCount(layout)),
  minVisibility = 0.5,
): ZoneMotion {
  const count = zoneCount(layout);
  if (out.level.length !== count) out = createZoneMotion(count);
  out.level.fill(0);
  out.flowX.fill(0);
  out.flowY.fill(0);
  if (!previous || !(dt > 0)) return out;
  // Width and height as fractions of the frame diagonal, so speeds match the field's units.
  const diag = Math.hypot(aspect, 1);
  const w = aspect / diag;
  const h = 1 / diag;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = previous[i];
    if (!p || !q) continue;
    if ((p.visibility ?? 1) < minVisibility || (q.visibility ?? 1) < minVisibility) continue;
    const zone = zoneAt(p.x, p.y, layout, mirror);
    if (zone < 0) continue;
    const u = ((p.x - q.x) * w) / dt;
    const v = ((p.y - q.y) * h) / dt;
    // Strongest point wins the zone's level; flow adds up.
    out.level[zone] = Math.max(out.level[zone] ?? 0, Math.hypot(u, v));
    out.flowX[zone] += mirror ? -u : u;
    out.flowY[zone] += v;
  }
  return out;
}
