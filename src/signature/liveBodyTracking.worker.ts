import { computeFeatures } from './features';
import { clamp, percentile } from '../lib/math';
import { rgbaToGray } from './frameGeometry';
import { applySoftThreshold } from './noiseFloor';
import { FarnebackFlow, loadOpenCv } from './opencv';
import { gridSize, poolFlow } from './pool';
import type { LiveBodyTrackingResponse } from './liveBodyTrackingTypes';
import type * as TasksVision from '@mediapipe/tasks-vision';
import {
  DEFAULT_FARNEBACK,
  FEATURE_NAMES,
  SIGNED_FEATURES,
  VELOCITY_FEATURES,
  type FeatureName,
  type SignatureFrame,
} from './types';
type PoseLandmarkerInstance =
  Awaited<ReturnType<typeof TasksVision.PoseLandmarker.createFromOptions>>;
type PoseLandmarkerResult =
  Awaited<ReturnType<PoseLandmarkerInstance['detectForVideo']>>;


const HISTORY_FRAMES = 16;
let tracker: FarnebackFlow | undefined;
let previousTime: number | undefined;
let history: Float32Array | undefined;
let frameCount = 0;
const NUM_POSES = 1; // Number of poses / people to detect. Impacts segmentation mask output

let modelPromise: Promise<PoseLandmarkerInstance> | null = null;

function getModel(): Promise<PoseLandmarkerInstance> {
  modelPromise ??= initializeModel();
  return modelPromise;
}

export interface LiveBodyTrackingFrameRequest {
  opencvUrl: string;
  width: number;
  height: number;
  timestamp: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
  noiseFloor: number;
}

self.onmessage = async ({ data }: MessageEvent<LiveBodyTrackingFrameRequest>) => {
  try {
    const poseLandmarker = await getModel();
    const frame = new ImageData(data.rgba, data.width, data.height);
    const res = poseLandmarker.detectForVideo(frame, data.timestamp * 1000);
    const masks = createMasksFromLandmarks(res);
    maskData(masks, data)

    await computeSignatureFrame(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Worker exception:', error);
    self.postMessage({ error: true, msg } satisfies LiveBodyTrackingResponse);
  }
};
async function initializeModel(): Promise<PoseLandmarkerInstance> {
    const { FilesetResolver, PoseLandmarker } =
      await import('@mediapipe/tasks-vision');

    const vision = await FilesetResolver.forVisionTasks(
        new URL('/vendor/mediapipe/', self.location.origin).href,
        true
    );

    const modelAssetPath = new URL(
      '/vendor/mediapipe/pose_landmarker_lite.task',
      self.location.origin,
    ).href;
    const options = {
      runningMode: 'VIDEO' as const,
      numPoses: NUM_POSES,
      outputSegmentationMasks: true,
    };
    try {
      return await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath, delegate: 'GPU' },
      });
    } catch {
      return PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath, delegate: 'CPU' },
      });
    }
}

/**
 * Creates segmentation masks from the landmarks detected by the PoseLandmarker model
 */
function createMasksFromLandmarks(res: PoseLandmarkerResult): Uint8Array<ArrayBufferLike>[] {
    const segmentation_masks = res.segmentationMasks;
    if (!segmentation_masks || segmentation_masks.length === 0) return [];
    const landmarks = res.landmarks;
    if (!landmarks || landmarks.length === 0) return [];

    const masks = []
    for (let i = 0; i < segmentation_masks.length; i++) {
      const segmentation_mask = segmentation_masks[i].getAsUint8Array();
      if (!segmentation_mask) {
          throw new Error("Segmentation mask texture not available");
      }
      masks.push(segmentation_mask);
    }
    return masks
}
/**
 * Masks the RGBA data based on the provided ML segmentation masks
 * @param masks - Array of segmentation masks
 * @param data - Live body tracking frame request
 */
function maskData(masks: Uint8Array<ArrayBufferLike>[], data: LiveBodyTrackingFrameRequest) {
  const THRESHOLD = 128; // Threshold value for masking
  if (masks.length === 0) {
    data.rgba.fill(0);
    return;
  }
  for (const mask of masks) {
    if (mask.length !== data.rgba.length / 4) {
      throw new Error(`Mask size ${mask.length} does not match ${data.rgba.length / 4} RGBA pixels`);
    }

    for (let i = 0, p=0; i < data.rgba.length; i+=4, p++) {
      if (mask[p] < THRESHOLD) {
        data.rgba[i] = 0;
        data.rgba[i+1] = 0;
        data.rgba[i+2] = 0;
        data.rgba[i+3] = 0;
      }
    }
  }
}
async function computeSignatureFrame(data: LiveBodyTrackingFrameRequest): Promise<void> {
  const { width, height, timestamp, rgba, opencvUrl, noiseFloor } = data;

  const gray = new Uint8Array(width * height);
  rgbaToGray(rgba, gray);

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
    self.postMessage({ frame: null } satisfies LiveBodyTrackingResponse);
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
  const response: LiveBodyTrackingResponse = { frame, onset: series.onsets.includes(frameCount - 1) };
  self.postMessage(response, { transfer: [field.buffer] });
}
