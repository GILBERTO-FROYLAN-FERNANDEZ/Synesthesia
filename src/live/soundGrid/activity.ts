/**
 * Zone activity: turns raw zone speed into what the voices play.
 *
 * For each zone, every update:
 * 1. `amount` = speed scaled so `fullScale` (field diagonals per second) reads 1. The worker
 *    already soft-thresholds the field at the noise floor, so stillness arrives near 0.
 * 2. `level` follows `amount` with a fast attack and a slower release (one-pole), so a hold
 *    voice swells as you move and rings down when you stop instead of cutting off.
 * 3. A gate with hysteresis: it opens above `onThreshold`, closes below `offThreshold`.
 * 4. A strike (onset) when the gate opens, or when movement surges inside an open gate (a
 *    sudden accent), no sooner than `refractorySec` after the zone's last strike.
 *
 * Time comes in as `dt` from the caller (the audio clock), never from a wall clock.
 */
import { zoneCount, type GridLayout } from './layout';

export interface ActivityParams {
  /** Speed (field diagonals per second) that plays a zone at full. */
  fullScale: number;
  attackSec: number;
  releaseSec: number;
  onThreshold: number;
  offThreshold: number;
  /** Rise of `amount` above `level` within one update that counts as an accent. */
  surge: number;
  refractorySec: number;
}

export const DEFAULT_ACTIVITY: ActivityParams = {
  fullScale: 0.3,
  attackSec: 0.04,
  releaseSec: 0.35,
  onThreshold: 0.15,
  offThreshold: 0.06,
  surge: 0.35,
  refractorySec: 0.18,
};

/** Response (0–1, the panel slider) → full-scale speed: 0.8 at 0 down to 0.08 at 1. */
export function fullScaleFromResponse(response: number): number {
  const r = Math.min(1, Math.max(0, Number.isFinite(response) ? response : 0.5));
  return 10 ** (Math.log10(0.8) + (Math.log10(0.08) - Math.log10(0.8)) * r);
}

export interface ZoneState {
  /** Smoothed 0–1. */
  level: Float32Array;
  /** Gate open. */
  active: Uint8Array;
  /** Struck on this update. */
  onset: Uint8Array;
  /** Strike strength 0–1 for zones struck on this update. */
  velocity: Float32Array;
}

function smoothing(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

export class ZoneActivity {
  readonly count: number;
  readonly state: ZoneState;
  private readonly sinceStrike: Float32Array;

  constructor(layout: GridLayout) {
    this.count = zoneCount(layout);
    this.state = {
      level: new Float32Array(this.count),
      active: new Uint8Array(this.count),
      onset: new Uint8Array(this.count),
      velocity: new Float32Array(this.count),
    };
    this.sinceStrike = new Float32Array(this.count).fill(Number.POSITIVE_INFINITY);
  }

  /** Back to silence (e.g. when tracking stops). */
  reset(): void {
    this.state.level.fill(0);
    this.state.active.fill(0);
    this.state.onset.fill(0);
    this.state.velocity.fill(0);
    this.sinceStrike.fill(Number.POSITIVE_INFINITY);
  }

  update(
    speeds: ArrayLike<number>,
    dt: number,
    params: ActivityParams = DEFAULT_ACTIVITY,
  ): ZoneState {
    const step = Math.min(0.5, Math.max(0, Number.isFinite(dt) ? dt : 0));
    const attack = smoothing(step, params.attackSec);
    const release = smoothing(step, params.releaseSec);
    const full = Math.max(1e-6, params.fullScale);
    const { level, active, onset, velocity } = this.state;
    for (let z = 0; z < this.count; z++) {
      const amount = Math.min(1, Math.max(0, (speeds[z] ?? 0) / full));
      const before = level[z] ?? 0;
      const wasActive = active[z] === 1;
      this.sinceStrike[z] += step;
      onset[z] = 0;
      velocity[z] = 0;

      let open = wasActive;
      if (!wasActive && amount >= params.onThreshold) open = true;
      else if (wasActive && amount < params.offThreshold && before < params.offThreshold)
        open = false;

      const accent = wasActive && amount - before >= params.surge;
      if (((open && !wasActive) || accent) && this.sinceStrike[z] >= params.refractorySec) {
        onset[z] = 1;
        velocity[z] = Math.min(1, Math.max(0.25, amount));
        this.sinceStrike[z] = 0;
      }
      active[z] = open ? 1 : 0;
      level[z] = before + (amount - before) * (amount > before ? attack : release);
    }
    return this.state;
  }
}
