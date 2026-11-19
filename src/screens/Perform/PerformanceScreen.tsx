import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import type { TimestampedSettingChange } from '../../engine/composition';
import {
  getSoundMaterial,
  getVisualMaterial,
  listSoundMaterials,
  listVisualMaterials,
} from '../../materials/registry';
import { Button } from '../../ui/Button';
import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { LivePerformanceRuntime } from './liveRuntime';
import type { LiveTrackingState } from './liveMotion';
import {
  completePerformance,
  getActivePerformance,
  takeActivePerformance,
  type PerformanceSettings,
  type RecordedPart,
} from './liveSession';
import styles from './PerformanceScreen.module.css';

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function PerformanceScreen() {
  const session = getActivePerformance();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<LivePerformanceRuntime | null>(null);
  const changesRef = useRef<TimestampedSettingChange[]>([]);
  const startedRef = useRef(0);
  const abandonTimerRef = useRef<number | null>(null);
  const [settings, setSettings] = useState<PerformanceSettings>(
    session?.settings ?? {
      visualId: 'water',
      soundId: 'water',
      intensity: 1,
      volume: 0.7,
      muted: false,
      sensitivity: 1,
      recordSource: false,
    },
  );
  const settingsRef = useRef(settings);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [soundActive, setSoundActive] = useState(false);
  const [status, setStatus] = useState(session ? 'Starting live materials…' : 'No live session');
  const [error, setError] = useState<string | null>(null);
  const [visualNotice, setVisualNotice] = useState<string | null>(null);
  const [trackingState, setTrackingState] = useState<LiveTrackingState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (abandonTimerRef.current !== null) {
      window.clearTimeout(abandonTimerRef.current);
      abandonTimerRef.current = null;
    }
    if (!session || !videoRef.current || !stageRef.current) return;
    const video = videoRef.current;
    video.srcObject = session.stream;
    void video.play();
    // StrictMode and camera changes must never reuse a canvas whose old runtime may
    // still call WEBGL_lose_context during asynchronous cleanup.
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Motion-driven generated visual');
    stageRef.current.prepend(canvas);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      canvas.style.visibility = 'hidden';
      setError('The graphics context was interrupted. Return to Camera Setup and start again.');
      setStatus('Visual interrupted');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    const cameraTrack = session.stream.getVideoTracks()[0];
    const onTrackEnded = () => {
      setStatus('Camera interrupted');
      setError(
        'The camera stream ended unexpectedly. Stop the performance to preserve the motion captured so far.',
      );
    };
    cameraTrack?.addEventListener('ended', onTrackEnded);
    let disposed = false;
    let runtime: LivePerformanceRuntime | null = null;
    try {
      runtime = new LivePerformanceRuntime(video, canvas, session.stream);
      runtimeRef.current = runtime;
      runtime.onActivity = setSoundActive;
      runtime.onTrackingState = (state) => {
        setTrackingState(state);
        setStatus(state.kind === 'body' ? 'Body tracking live' :
          state.kind === 'loading' ? 'Loading body tracking' : 'Camera motion tracking live');
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The live workspace could not start.');
      setStatus('Performance stopped');
    }
    const activeRuntime = runtime;
    startedRef.current = performance.now();
    const start = async () => {
      if (!activeRuntime) return;
      try {
        const visual = await activeRuntime.start(settingsRef.current);
        if (disposed) return;
        if (visual.fallbackFrom) {
          change({ visualId: visual.id });
          setVisualNotice(
            `${getVisualMaterial(visual.fallbackFrom)?.meta.name ?? 'The selected visual'} cannot render on this graphics card. Showing ${getVisualMaterial(visual.id)?.meta.name ?? visual.id} instead.`,
          );
        }
        activeRuntime.onMotion = (frame) => {
          setEnergy(Math.min(1, frame.features.energy * 5));
        };
      } catch (caught) {
        if (disposed) return;
        console.error(caught);
        setError(caught instanceof Error ? caught.message : 'The live workspace could not start.');
        setStatus('Performance stopped');
      }
    };
    void start();
    const timer = window.setInterval(() => {
      setElapsed((performance.now() - startedRef.current) / 1000);
      setRecordingDuration(activeRuntime?.recordingDuration ?? 0);
    }, 100);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      cameraTrack?.removeEventListener('ended', onTrackEnded);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.remove();
      if (activeRuntime) {
        void activeRuntime.stopRecording().catch(() => undefined).then(() => activeRuntime.stop());
      }
      runtimeRef.current = null;
      // StrictMode immediately remounts this effect in development. Only a genuine route
      // departure abandons the camera, after the next effect has had a chance to cancel it.
      abandonTimerRef.current = window.setTimeout(() => {
        if (getActivePerformance()?.id === session.id) {
          takeActivePerformance()?.stream.getTracks().forEach((track) => track.stop());
        }
        abandonTimerRef.current = null;
      }, 0);
    };
    // One runtime owns the route session; settings are applied through controls below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const change = (patch: Partial<PerformanceSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (patch.intensity !== undefined) runtime.setIntensity(next.intensity);
    if (patch.volume !== undefined) runtime.setVolume(next.volume);
    if (patch.muted !== undefined) runtime.setMuted(next.muted);
    if (patch.sensitivity !== undefined) runtime.setSensitivity(next.sensitivity);
    changesRef.current.push({
      atSec: (performance.now() - startedRef.current) / 1000,
      visualMaterialId: next.visualId,
      soundMaterialId: next.soundId,
      intensity: next.intensity,
      volume: next.volume,
      muted: next.muted,
      sensitivity: next.sensitivity,
    });
  };

  const selectVisual = async (visualId: string) => {
    try {
      const visual = await runtimeRef.current?.setVisual(visualId);
      if (!visual) return;
      change({ visualId: visual.id });
      setError(null);
      setVisualNotice(
        visual.fallbackFrom
          ? `${getVisualMaterial(visual.fallbackFrom)?.meta.name ?? 'The selected visual'} cannot render on this graphics card. Showing ${getVisualMaterial(visual.id)?.meta.name ?? visual.id} instead.`
          : null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The visual could not be changed.');
    }
  };
  const selectSound = async (soundId: string) => {
    try {
      await runtimeRef.current?.setSound(soundId);
      change({ soundId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The sound could not be changed.');
    }
  };

  const toggleRecording = async () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setError(null);
    try {
      if (recording) {
        await runtime.stopRecording();
        setRecording(false);
      } else {
        runtime.startRecording(settings.recordSource);
        setRecording(true);
      }
    } catch (caught) {
      setRecording(false);
      setError(caught instanceof Error ? caught.message : 'Recording could not start.');
    }
  };

  const stopPerformance = async () => {
    if (!session) return;
    if (!runtimeRef.current) {
      session.stream.getTracks().forEach((track) => track.stop());
      takeActivePerformance();
      navigate('/perform');
      return;
    }
    setBusy(true);
    setError(null);
    const runtime = runtimeRef.current;
    let recorded: { generated: RecordedPart | null; source: RecordedPart | null } = {
      generated: null,
      source: null,
    };
    let recordingError: string | null;
    try {
      recorded = await runtime.stopRecording();
      recordingError = runtime.recordingError;
    } catch (caught) {
      recordingError =
        caught instanceof Error ? caught.message : 'One or more recordings could not be finalized.';
    }
    try {
      const duration = Math.max(0.1, (performance.now() - startedRef.current) / 1000);
      const date = new Date(session.startedAt);
      const defaultName = `Live performance · ${date.toLocaleDateString()}`;
      const track = session.stream.getVideoTracks()[0];
      const trackSettings = track?.getSettings();
      const signature = await runtime.tracker.buildSignature(`${defaultName} movement`, {
        width: trackSettings?.width ?? 0,
        height: trackSettings?.height ?? 0,
      });
      let thumbnail: string | undefined;
      try {
        thumbnail = runtime.canvas.toDataURL('image/webp', 0.72);
      } catch {
        // A missing thumbnail does not invalidate captured movement.
      }
      await runtime.stop();
      session.stream.getTracks().forEach((track) => track.stop());
      takeActivePerformance();
      completePerformance({
        id: session.id,
        name: defaultName,
        recordedAt: session.startedAt,
        duration,
        settings: settingsRef.current,
        settingChanges: changesRef.current,
        signature,
        generated: recorded.generated,
        source: recorded.source,
        recordingError,
        thumbnail,
      });
      navigate('/perform/review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The performance could not be finalized.');
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <section className={styles.missing}>
        <h1>No active performance</h1>
        <p>Enable a real camera in Camera Setup before entering the live workspace.</p>
        <Button variant="primary" onClick={() => navigate('/perform')}>
          Open Camera Setup
        </Button>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Solo Performance</span>
          <h1>Live movement instrument</h1>
        </div>
        <div className={styles.liveState}>
          {recording ? <span className={styles.rec}>REC {clock(recordingDuration)}</span> : null}
          <span>{clock(elapsed)}</span>
          <span>{status}</span>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {visualNotice ? <p className={styles.notice} role="status">{visualNotice}</p> : null}
      <div className={styles.workspace}>
        <aside className={styles.side}>
          <div className={styles.camera}>
            <video ref={videoRef} autoPlay muted playsInline />
            <span>{session.cameraName || 'Active camera'}</span>
          </div>
          <div className={styles.tracking}>
            <strong>Movement energy</strong>
            <div><span style={{ width: `${energy * 100}%` }} /></div>
            <small>{trackingState.kind === 'body' ? 'Body-segmented optical flow' :
              trackingState.kind === 'loading' ? 'Loading body tracking · camera motion active' :
                'Camera-derived block optical flow'} · {Math.round(energy * 100)}%</small>
            {trackingState.kind === 'fallback' ? (
              <small className={styles.trackingWarning} role="alert">
                Body tracking unavailable: {trackingState.reason} Camera motion tracking is still active.
              </small>
            ) : null}
            <small role="status">Sound response: {settings.muted ? 'Muted' : soundActive ? 'Active' : 'Waiting for movement'}</small>
          </div>
          <label>
            Visual material
            <select value={settings.visualId} onChange={(e) => void selectVisual(e.target.value)}>
              {listVisualMaterials().map((entry) => (
                <option key={entry.meta.id} value={entry.meta.id}>{entry.meta.name}</option>
              ))}
            </select>
          </label>
          <label>
            Sound material
            <select value={settings.soundId} onChange={(e) => void selectSound(e.target.value)}>
              {listSoundMaterials().map((entry) => (
                <option key={entry.meta.id} value={entry.meta.id}>{entry.meta.name}</option>
              ))}
            </select>
          </label>
          <Slider label="Intensity" value={settings.intensity} min={0} max={3} step={0.05} baseline={1} showValue onChange={(intensity) => change({ intensity })} />
          <Slider label="Volume" value={settings.volume} min={0} max={1} step={0.01} baseline={0.7} showValue format={(v) => `${Math.round(v * 100)}%`} onChange={(volume) => change({ volume })} />
          <Slider label="Sensitivity" value={settings.sensitivity} min={0.2} max={2} step={0.05} baseline={1} showValue onChange={(sensitivity) => change({ sensitivity })} />
          <Toggle label="Mute sound" checked={settings.muted} accent="water" onChange={(muted) => change({ muted })} />
          <Toggle label="Record original camera separately" checked={settings.recordSource} accent="honey" onChange={(recordSource) => change({ recordSource })} description="Applies when the next recording starts." />
        </aside>
        <div className={styles.stage}>
          <div ref={stageRef} className={styles.canvasHost} />
          <div className={styles.stageLabel}>
            {getVisualMaterial(settings.visualId)?.meta.name} · {getSoundMaterial(settings.soundId)?.meta.name}
          </div>
        </div>
      </div>
      <footer className={styles.controls}>
        <Button
          onClick={() => void stageRef.current?.parentElement?.requestFullscreen()}
          disabled={busy || !document.fullscreenEnabled}
        >
          Fullscreen
        </Button>
        <Button onClick={() => void toggleRecording()} disabled={busy}>
          {recording ? 'Stop Recording' : 'Start Recording'}
        </Button>
        <Button variant="primary" onClick={() => void stopPerformance()} disabled={busy}>
          {busy ? 'Finalizing…' : 'Stop Performance'}
        </Button>
      </footer>
    </section>
  );
}
