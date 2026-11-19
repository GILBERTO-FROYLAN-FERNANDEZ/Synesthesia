import { analysisSize, rgbaToGray } from './frameGeometry';
import type { LiveFrameRequest, LiveFrameResponse } from './live.worker';
import {
  DEFAULT_SAMPLER_CONFIG,
  FEATURE_NAMES,
  type FeatureName,
  type SignatureFrame,
  type SignatureSampler,
} from './types';

/** A live source holds the latest field instead of a seekable clip. */
export function createLiveSampler() {
  const rest = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as Record<
    FeatureName,
    number
  >;
  let frame: SignatureFrame = {
    t: 0,
    cols: 1,
    rows: 1,
    field: new Float32Array(2),
    features: rest,
    normalized: rest,
    inTail: false,
  };
  let onsets: number[] = [];
  const sampler: SignatureSampler = {
    duration: Infinity,
    signatureDuration: Infinity,
    config: DEFAULT_SAMPLER_CONFIG,
    configure() {},
    sample(t) {
      frame.t = t;
      return frame;
    },
    onsetsBetween(start, end) {
      return onsets.filter((t) => t >= start && t < end);
    },
  };
  return {
    sampler,
    update(next: SignatureFrame, time: number, onset: boolean) {
      frame = next;
      onsets = onsets.filter((t) => t >= time - 2);
      // Sound scheduling looks ahead, so place a new trigger ahead of its current window.
      if (onset) onsets.push(time + 0.2);
    },
  };
}

/** Read only the newest frame while the worker is free. Never queue stale camera frames. */
export function trackLiveVideo(
  video: HTMLVideoElement,
  getNoiseFloor: () => number,
  onMotion: (frame: SignatureFrame, onset: boolean) => void,
  onError: () => void,
): () => void {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot read camera frames');
  const worker = new Worker(new URL('./live.worker.ts', import.meta.url), { type: 'module' });
  const opencvUrl = new URL('vendor/opencv/opencv.js', document.baseURI).href;
  let busy = false;
  let previous = -Infinity;
  let handle = 0;
  const dispose = () => {
    video.cancelVideoFrameCallback(handle);
    worker.terminate();
  };
  const fail = () => {
    dispose();
    onError();
  };
  worker.onerror = fail;
  worker.onmessage = ({ data }: MessageEvent<LiveFrameResponse>) => {
    busy = false;
    if ('error' in data) fail();
    else if (data.frame) onMotion(data.frame, data.onset ?? false);
  };

  function capture(_: number, { mediaTime }: VideoFrameCallbackMetadata) {
    handle = video.requestVideoFrameCallback(capture);
    if (!ctx || busy || !video.videoWidth || mediaTime - previous < 1 / 30 - 0.001) return;
    try {
      const { width, height } = analysisSize(video.videoWidth, video.videoHeight, 160);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const gray = new Uint8Array(width * height);
      rgbaToGray(ctx.getImageData(0, 0, width, height).data, gray);
      const frame: LiveFrameRequest = {
        opencvUrl,
        width,
        height,
        timestamp: mediaTime,
        gray,
        noiseFloor: getNoiseFloor(),
      };
      busy = true;
      previous = mediaTime;
      worker.postMessage(frame, [gray.buffer]);
    } catch {
      fail();
    }
  }
  handle = video.requestVideoFrameCallback(capture);
  return dispose;
}
