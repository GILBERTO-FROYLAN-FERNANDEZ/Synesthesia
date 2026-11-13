import { analysisSize, rgbaToGray } from './frameGeometry';
import type { LiveFrameRequest, LiveFrameResponse } from './live.worker';
import {
  DEFAULT_SAMPLER_CONFIG,
  FEATURE_NAMES,
  type FeatureName,
  type SignatureFrame,
  type SignatureSampler,
} from './types';

export function trackLiveBodyTrackingVideo(
    video: HTMLVideoElement,
    getNoiseFloor: () => number,
    onMotion: (frame: SignatureFrame, onset: boolean) => void,
    onError: () => void,
): () => void {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot read camera frames');
  const bodyTrackingWorker = new Worker(new URL('./liveBodyTracking.worker.ts', import.meta.url), { type: 'module' });
  const opencvUrl = new URL('vendor/opencv/opencv.js', document.baseURI).href;
  let busy = false;
  let previous = -Infinity;
  let handle = 0;
  const dispose = () => {
    video.cancelVideoFrameCallback(handle);
    bodyTrackingWorker.terminate();
  };
  const fail = () => {
    dispose();
    onError();
  };
  bodyTrackingWorker.onerror = fail;
  bodyTrackingWorker.onmessage = ({ data }: MessageEvent<LiveFrameResponse>) => {
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
      bodyTrackingWorker.postMessage(frame, [gray.buffer]);
    } catch {
      fail();
    }
  }
  handle = video.requestVideoFrameCallback(capture);
  return dispose;
}