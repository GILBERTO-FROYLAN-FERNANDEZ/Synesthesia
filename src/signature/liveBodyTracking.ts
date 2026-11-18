import { analysisSize, rgbaToGray } from './frameGeometry';
import type { LiveFrameResponse } from './live.worker';
import type { LiveBodyTrackingFrameRequest } from './liveBodyTracking.worker';
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
  console.log("Starting live body tracking video...");
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
  const fail = (message?: string) => {
    console.log(
      'Error occurred in live body tracking worker. ' +
        (message ? `Message: ${message}` : 'NO MESSAGE'),
    );
    dispose();
    onError();
  };
  bodyTrackingWorker.onerror =(event: ErrorEvent) => {
      console.error('worker', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
    fail(event.message);
  };
  bodyTrackingWorker.onmessage = ({ data }: MessageEvent<LiveFrameResponse>) => {
    busy = false;
    if ('error' in data) {
      console.error('Worker reported:', data.msg);
      fail(data.msg);
    } else if (data.frame) {
      onMotion(data.frame, data.onset ?? false);
    }
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
      let rgba = ctx.getImageData(0, 0, width, height).data;
      const frame: LiveBodyTrackingFrameRequest = {
        opencvUrl,
        width,
        height,
        timestamp: mediaTime,
        rgba,
        noiseFloor: getNoiseFloor(),
      };
      busy = true;
      previous = mediaTime;
      console.log("Posting frame to body tracking worker...");
      bodyTrackingWorker.postMessage(frame, [rgba.buffer]);
    } catch {
      fail("failed");
    }
  }
  handle = video.requestVideoFrameCallback(capture);
  return dispose;
}