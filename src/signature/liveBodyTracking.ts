import { analysisSize } from './frameGeometry';
import type { LiveBodyTrackingResponse } from './liveBodyTrackingTypes';
import type { LiveBodyTrackingFrameRequest } from './liveBodyTracking.worker';
import {
  type SignatureFrame,
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
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (handle) video.cancelVideoFrameCallback(handle);
    bodyTrackingWorker.terminate();
  };
  const fail = (message?: string) => {
    if (disposed) return;
    if (message) console.warn('Body tracking unavailable:', message);
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
  bodyTrackingWorker.onmessage = ({ data }: MessageEvent<LiveBodyTrackingResponse>) => {
    busy = false;
    if ('error' in data) {
      fail(data.msg);
    } else if (data.frame) {
      onMotion(data.frame, data.onset ?? false);
    }
  };

  function capture(_: number, { mediaTime }: VideoFrameCallbackMetadata) {
    if (disposed) return;
    handle = video.requestVideoFrameCallback(capture);
    if (!ctx || busy || !video.videoWidth || mediaTime - previous < 1 / 30 - 0.001) return;
    try {
      const { width, height } = analysisSize(video.videoWidth, video.videoHeight, 160);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();
      const rgba = ctx.getImageData(0, 0, width, height).data;
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
      bodyTrackingWorker.postMessage(frame, [rgba.buffer]);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Could not read camera frame');
    }
  }
  handle = video.requestVideoFrameCallback(capture);
  return dispose;
}
