import { assembleSignature } from '../../signature/assemble';
import { computeFeatures, spatialFeatures } from '../../signature/features';
import { finalizeSignature } from '../../library/signatures';
import { DEFAULT_FARNEBACK, FEATURE_NAMES, type SignatureFrame } from '../../signature/types';
import { trackLiveBodyTrackingVideo } from '../../signature/liveBodyTracking';

const WIDTH = 160;
const HEIGHT = 90;
const COLS = 16;
const ROWS = 9;
const FPS = 15;
const CELL_W = WIDTH / COLS;
const CELL_H = HEIGHT / ROWS;
const SEARCH = 2;

export type LiveTrackingState =
  | { kind: 'loading' }
  | { kind: 'body' }
  | { kind: 'camera' }
  | { kind: 'fallback'; reason: string };

function emptyFeatureRecord(): SignatureFrame['features'] {
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as SignatureFrame['features'];
}

function normalized(features: SignatureFrame['features']): SignatureFrame['normalized'] {
  const out = {} as SignatureFrame['normalized'];
  for (const name of FEATURE_NAMES) {
    const value = features[name];
    out[name] =
      name === 'flowX' || name === 'flowY' || name === 'divergence' || name === 'curl'
        ? Math.max(-1, Math.min(1, value * 3))
        : name === 'direction'
          ? value / Math.PI
          : name === 'centroidX' || name === 'centroidY' || name === 'coherence'
            ? Math.max(0, Math.min(1, value))
            : Math.max(0, Math.min(1, value * 4));
  }
  return out;
}

/**
 * Low-latency live input adapter. It estimates optical flow by finding the best matching
 * luminance block in the previous camera frame for every field cell.
 */
export class LiveMotionTracker {
  readonly frameRate = FPS;
  readonly grid = { cols: COLS, rows: ROWS };

  private readonly video: HTMLVideoElement;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private previous: Uint8Array | null = null;
  private raf = 0;
  private lastCapture = 0;
  private captureStarted = 0;
  private fields: Float32Array[] = [];
  private sensitivity = 1;
  private previousEnergy = 0;
  private previousAcceleration = 0;
  private lastOnset = -1;
  private current: SignatureFrame;
  private stopBodyTracking: (() => void) | null = null;
  private bodyTimeout = 0;
  private mode: 'body' | 'block' = 'block';
  private running = false;
  private bodyTrackingEnabled = true;
  private bodyFrames = 0;
  onFrame: ((frame: SignatureFrame) => void) | null = null;
  onTrackingState: ((state: LiveTrackingState) => void) | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Camera frame processing is unavailable in this browser.');
    this.ctx = ctx;
    const features = emptyFeatureRecord();
    this.current = {
      t: 0,
      cols: COLS,
      rows: ROWS,
      field: new Float32Array(COLS * ROWS * 2),
      features,
      normalized: normalized(features),
      inTail: false,
    };
  }

  get latest(): SignatureFrame {
    return this.current;
  }

  setSensitivity(value: number): void {
    this.sensitivity = Math.max(0.1, Math.min(2, value));
  }

  start(bodyTrackingEnabled = true): void {
    this.running = true;
    this.bodyTrackingEnabled = bodyTrackingEnabled;
    this.captureStarted = performance.now();
    this.lastCapture = 0;
    this.mode = 'block';
    this.raf = requestAnimationFrame(this.tick);
    if (bodyTrackingEnabled) this.startBodyTracking();
    else this.onTrackingState?.({ kind: 'camera' });
  }

  setBodyTrackingEnabled(enabled: boolean): void {
    if (enabled === this.bodyTrackingEnabled) return;
    this.bodyTrackingEnabled = enabled;
    if (!this.running) return;
    if (enabled) {
      this.startBodyTracking();
      return;
    }
    window.clearTimeout(this.bodyTimeout);
    this.stopBodyTracking?.();
    this.stopBodyTracking = null;
    this.activateBlockTracker();
    this.onTrackingState?.({ kind: 'camera' });
  }

  private startBodyTracking(): void {
    this.onTrackingState?.({ kind: 'loading' });
    try {
      this.stopBodyTracking = trackLiveBodyTrackingVideo(
        this.video,
        () => 0.002 / this.sensitivity,
        (frame) => {
          if (!this.running || !this.bodyTrackingEnabled) return;
          window.clearTimeout(this.bodyTimeout);
          this.bodyTimeout = window.setTimeout(
            () => this.useBlockTracker('Body tracking stopped returning camera frames.'),
            5_000,
          );
          if (this.mode !== 'body') {
            cancelAnimationFrame(this.raf);
            this.mode = 'body';
            this.onTrackingState?.({ kind: 'body' });
          }
          this.bodyFrames++;
          this.current = { ...frame, t: (performance.now() - this.captureStarted) / 1000 };
          this.captureField(this.resampleField(frame), this.current.t);
          this.onFrame?.(this.current);
        },
        (reason) => this.useBlockTracker(reason),
      );
      this.bodyTimeout = window.setTimeout(
        () => this.useBlockTracker('The body tracking model did not return a frame within 12 seconds.'),
        12_000,
      );
    } catch (caught) {
      console.warn('Body tracking could not start; using camera optical flow.', caught);
      this.useBlockTracker(caught instanceof Error ? caught.message : 'Body tracking could not start.');
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.bodyTimeout);
    this.stopBodyTracking?.();
    this.stopBodyTracking = null;
  }

  async buildSignature(name: string, source: { width: number; height: number }) {
    if (this.fields.length < 2) throw new Error('Not enough camera movement was captured to save.');
    const field = new Float32Array(this.fields.length * COLS * ROWS * 2);
    this.fields.forEach((frame, index) => field.set(frame, index * frame.length));
    const features = computeFeatures({
      field,
      frameCount: this.fields.length,
      cols: COLS,
      rows: ROWS,
      fps: FPS,
      floor: 0.002,
    });
    const duration = this.fields.length / FPS;
    const body = await assembleSignature({
      source: {
        fileName: 'Live camera',
        nativeFps: FPS,
        width: source.width || WIDTH,
        height: source.height || HEIGHT,
        trim: { startSec: 0, endSec: duration },
        rotate: 0,
        mirror: true,
        focusArea: null,
      },
      preferredSpeed: 1,
      options: { noiseFloorMode: 'manual', farneback: DEFAULT_FARNEBACK },
      method: this.bodyFrames > 0 ? 'farneback' : 'block-matching',
      analysisWidth: WIDTH,
      temporalSmoothingFrames: 1,
      noiseFloor: 0.002,
      frameRate: FPS,
      grid: this.grid,
      field,
      features,
    });
    return finalizeSignature(body, name);
  }

  private useBlockTracker(reason: string): void {
    if (!this.running || !this.bodyTrackingEnabled) return;
    window.clearTimeout(this.bodyTimeout);
    this.stopBodyTracking?.();
    this.stopBodyTracking = null;
    this.onTrackingState?.({ kind: 'fallback', reason });
    this.activateBlockTracker();
  }

  private activateBlockTracker(): void {
    if (this.mode === 'block') return;
    this.mode = 'block';
    this.previous = null;
    this.lastCapture = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private resampleField(frame: SignatureFrame): Float32Array {
    const field = new Float32Array(COLS * ROWS * 2);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const sourceCol = Math.min(frame.cols - 1, Math.floor(((col + 0.5) / COLS) * frame.cols));
        const sourceRow = Math.min(frame.rows - 1, Math.floor(((row + 0.5) / ROWS) * frame.rows));
        const source = (sourceRow * frame.cols + sourceCol) * 2;
        const target = (row * COLS + col) * 2;
        field[target] = frame.field[source];
        field[target + 1] = frame.field[source + 1];
      }
    }
    return field;
  }

  private captureField(field: Float32Array, elapsed: number): void {
    const target = Math.min(Math.floor(elapsed * FPS) + 1, FPS * 60 * 60);
    while (this.fields.length < target) this.fields.push(field.slice());
  }

  private readonly tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (now - this.lastCapture < 1000 / FPS) return;
    const dt = this.lastCapture ? Math.max(1 / 30, (now - this.lastCapture) / 1000) : 1 / FPS;
    this.lastCapture = now;
    this.ctx.save();
    this.ctx.translate(WIDTH, 0);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.video, 0, 0, WIDTH, HEIGHT);
    this.ctx.restore();
    const rgba = this.ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const gray = new Uint8Array(WIDTH * HEIGHT);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (rgba[p] * 3 + rgba[p + 1] * 6 + rgba[p + 2]) / 10;
    }
    if (!this.previous) {
      this.previous = gray;
      return;
    }

    const field = new Float32Array(COLS * ROWS * 2);
    const diagonal = Math.hypot(WIDTH, HEIGHT);
    const threshold = 1.5 / this.sensitivity;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cx = Math.round((col + 0.5) * CELL_W);
        const cy = Math.round((row + 0.5) * CELL_H);
        let best = Number.POSITIVE_INFINITY;
        let zero = Number.POSITIVE_INFINITY;
        let bestDx = 0;
        let bestDy = 0;
        for (let dy = -SEARCH; dy <= SEARCH; dy++) {
          for (let dx = -SEARCH; dx <= SEARCH; dx++) {
            let error = 0;
            let samples = 0;
            for (let py = -3; py <= 3; py += 2) {
              for (let px = -4; px <= 4; px += 2) {
                const x = cx + px;
                const y = cy + py;
                const oldX = x - dx;
                const oldY = y - dy;
                if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
                if (oldX < 0 || oldX >= WIDTH || oldY < 0 || oldY >= HEIGHT) continue;
                error += Math.abs(gray[y * WIDTH + x] - this.previous[oldY * WIDTH + oldX]);
                samples++;
              }
            }
            error /= Math.max(1, samples);
            if (dx === 0 && dy === 0) zero = error;
            if (error < best) {
              best = error;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
        if (zero - best < threshold) {
          bestDx = 0;
          bestDy = 0;
        }
        const index = (row * COLS + col) * 2;
        field[index] = (bestDx / diagonal) / dt;
        field[index + 1] = (bestDy / diagonal) / dt;
      }
    }
    this.previous = gray;
    const spatial = spatialFeatures(field, 0, COLS, ROWS, 0.002);
    const acceleration = Math.abs(spatial.energy - this.previousEnergy) / dt;
    const surge = (spatial.energy - this.previousEnergy) / dt;
    const jerk = Math.abs(acceleration - this.previousAcceleration) / dt;
    const isOnset =
      surge > 0.12 && spatial.peak > 0.01 && now / 1000 - this.lastOnset > 0.1;
    if (isOnset) this.lastOnset = now / 1000;
    this.previousEnergy = spatial.energy;
    this.previousAcceleration = acceleration;
    const features = {
      ...spatial,
      acceleration,
      surge,
      jerk,
      continuity: 1 / (1 + jerk),
    } as SignatureFrame['features'];
    this.current = {
      t: (now - this.captureStarted) / 1000,
      cols: COLS,
      rows: ROWS,
      field,
      features,
      normalized: normalized(features),
      inTail: false,
    };
    this.captureField(field, this.current.t);
    this.onFrame?.(this.current);
  };
}
