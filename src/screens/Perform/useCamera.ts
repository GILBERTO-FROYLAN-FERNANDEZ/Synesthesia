import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { BadgeStatus } from '../../ui/StatusBadge';

export type CameraState = 'awaiting' | 'loading' | 'connected' | 'disconnected' | 'error';

export const CAMERA_STATUS: Record<
  CameraState,
  { badge: BadgeStatus; label: string; message: string }
> = {
  awaiting: {
    badge: 'pending',
    label: 'Awaiting permission',
    message: 'Enable the camera when you are ready. Your video stays in this browser.',
  },
  loading: {
    badge: 'pending',
    label: 'Loading camera',
    message: 'Waiting for the browser and camera to respond…',
  },
  connected: {
    badge: 'pass',
    label: 'Connected',
    message: 'The camera is ready.',
  },
  disconnected: {
    badge: 'warn',
    label: 'Disconnected',
    message: 'The camera is stopped. Enable it again when you are ready.',
  },
  error: {
    badge: 'fail',
    label: 'Camera unavailable',
    message: 'The camera could not be started.',
  },
};

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access in your browser settings, then try again.';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'No camera is available. Connect a camera, then try again.';
    }
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return 'The camera is already in use or could not be read. Close other camera apps, then try again.';
    }
  }
  return 'The camera could not be started. Check that it is connected and allowed, then try again.';
}

/** Shared browser-camera lifecycle for Camera Setup and local performance workspaces. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [state, setState] = useState<CameraState>('awaiting');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'videoinput',
      );
      setCameras(devices);
      setCameraId((current) =>
        current && devices.some((device) => device.deviceId === current) ? current : '',
      );
    } catch {
      // getUserMedia supplies the useful permission or availability error on start.
    }
  }, []);

  const release = useCallback(
    (nextState?: CameraState) => {
      request.current++;
      setStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return null;
      });
      if (videoRef.current) videoRef.current.srcObject = null;
      if (nextState) setState(nextState);
    },
    [videoRef],
  );

  const start = useCallback(
    async (requestedId = cameraId) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('error');
        setError('Camera access is not available in this browser.');
        return;
      }

      release();
      const token = request.current;
      setState('loading');
      setError(null);
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: requestedId ? { deviceId: { exact: requestedId } } : true,
        });
        if (request.current !== token) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(next);
        streamRef.current = next;
        if (videoRef.current) {
          videoRef.current.srcObject = next;
          void videoRef.current.play().catch(() => undefined);
        }
        const activeId = next.getVideoTracks()[0]?.getSettings().deviceId;
        if (activeId) setCameraId(activeId);
        setState('connected');
        void refresh();
      } catch (caught) {
        if (request.current !== token) return;
        setState('error');
        setError(cameraErrorMessage(caught));
      }
    },
    [cameraId, refresh, release, videoRef],
  );

  const selectCamera = useCallback(
    (nextId: string) => {
      setCameraId(nextId);
      if (stream) void start(nextId);
    },
    [start, stream],
  );

  useEffect(() => {
    void refresh();
    const devices = navigator.mediaDevices;
    const onDeviceChange = () => void refresh();
    devices?.addEventListener?.('devicechange', onDeviceChange);
    return () => devices?.removeEventListener?.('devicechange', onDeviceChange);
  }, [refresh]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const detach = useCallback((): MediaStream | null => {
    const current = streamRef.current;
    if (!current) return null;
    request.current++;
    streamRef.current = null;
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    return current;
  }, [videoRef]);

  const selected = cameras.find((camera) => camera.deviceId === cameraId);
  return {
    cameras,
    cameraId,
    state,
    error,
    stream,
    status: CAMERA_STATUS[state],
    cameraName: selected?.label || (state === 'connected' ? 'Active camera' : ''),
    start,
    stop: () => release('disconnected'),
    selectCamera,
    detach,
  };
}
