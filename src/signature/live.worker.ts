import { computeFeatures } from './features';
import { clamp, percentile } from '../lib/math';
import { applySoftThreshold } from './noiseFloor';
import { FarnebackFlow, loadOpenCv } from './opencv';
import { gridSize, poolFlow } from './pool';
import {
  DEFAULT_FARNEBACK,
  FEATURE_NAMES,
  SIGNED_FEATURES,
  VELOCITY_FEATURES,
  type FeatureName,
  type SignatureFrame,
} from './types';

export interface LiveFrameRequest {
  opencvUrl: string;
  width: number;
  height: number;
  timestamp: number;
  gray: Uint8Array;
  noiseFloor: number;
}

export type LiveFrameResponse = { frame: SignatureFrame | null; onset?: boolean } | { error: true };

const HISTORY_FRAMES = 16;
let tracker: FarnebackFlow | undefined;
let previousTime: number | undefined;
let history: Float32Array | undefined;
let frameCount = 0;

self.onmessage = async ({ data }: MessageEvent<LiveFrameRequest>) => {
  try {
    const { width, height, timestamp, gray, opencvUrl, noiseFloor } = data;
    const { cols, rows } = gridSize(24, width, height);
    const stride = cols * rows * 2;
    const dt = previousTime === undefined ? 0 : timestamp - previousTime;
    if (!tracker || tracker.width !== width || tracker.height !== height) {
      const { cv } = await loadOpenCv(opencvUrl);
      tracker?.dispose();
      tracker = new FarnebackFlow(cv, width, height, DEFAULT_FARNEBACK);
      history = new Float32Array(HISTORY_FRAMES * stride);
      frameCount = 0;
    } else if (dt <= 0 || dt > 0.25) {
      tracker.reset();
      frameCount = 0;
    }
    previousTime = timestamp;
    const flow = tracker.push(gray);
    if (!flow || !history) {
      self.postMessage({ frame: null } satisfies LiveFrameResponse);
      return;
    }

    const fps = 1 / dt;
    const raw = poolFlow(flow, width, height, cols, rows, fps, new Float32Array(stride));
    if (frameCount === HISTORY_FRAMES) history.copyWithin(0, stride);
    else frameCount++;
    history.set(raw, (frameCount - 1) * stride);

    // Apply the current threshold to the whole recent window so changing the
    // slider does not turn a threshold change into a motion onset.
    const filtered = applySoftThreshold(history.subarray(0, frameCount * stride), noiseFloor);
    const field = filtered.slice((frameCount - 1) * stride);

    const series = computeFeatures({
      field: filtered,
      frameCount,
      cols,
      rows,
      fps,
      floor: noiseFloor,
    });
    const features = {} as Record<FeatureName, number>;
    const normalized = {} as Record<FeatureName, number>;
    for (const name of FEATURE_NAMES) {
      const values = series[name];
      const value = values[frameCount - 1];
      const signed = SIGNED_FEATURES.has(name);
      features[name] = value;
      if (VELOCITY_FEATURES.has(name)) {
        const scale = Math.max(noiseFloor, percentile(signed ? values.map(Math.abs) : values, 95));
        normalized[name] = clamp(value / scale, signed ? -1 : 0, 1);
      } else {
        normalized[name] =
          name === 'direction' ? (value + Math.PI) / (2 * Math.PI) : clamp(value, 0, 1);
      }
    }
    const frame: SignatureFrame = { t: 0, cols, rows, field, features, normalized, inTail: false };
    const response: LiveFrameResponse = { frame, onset: series.onsets.includes(frameCount - 1) };
    self.postMessage(response, { transfer: [field.buffer] });
  } catch {
    self.postMessage({ error: true } satisfies LiveFrameResponse);
  }
};
