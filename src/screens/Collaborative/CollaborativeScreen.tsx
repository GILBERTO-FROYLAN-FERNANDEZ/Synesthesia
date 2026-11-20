import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { listSoundMaterials, getVisualMaterial } from '../../materials/registry';
import type { PropertyValues } from '../../materials/types';
import { createSyntheticSampler } from '../../signature/synthetic';
import { Button } from '../../ui/Button';
import { MaterialPicker } from '../../ui/MaterialPicker';
import { MovementZoneOverlay } from '../../ui/MovementZoneOverlay';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Slider } from '../../ui/Slider';
import { StatusBadge } from '../../ui/StatusBadge';
import { Toggle } from '../../ui/Toggle';
import {
  WakeCanvas,
  type SignaturePlayback,
} from '../Signature/SignaturePreview';
import { PlaybackClock } from '../Signature/playbackClock';
import { useCamera } from '../Perform/useCamera';
import { LivePerformanceRuntime } from '../Perform/liveRuntime';
import type { LiveTrackingState } from '../Perform/liveMotion';
import styles from './CollaborativeScreen.module.css';
import { motionRegion } from './motionGrid';
import { useManualSound } from './useManualSound';

const PRESETS = {
  default: ['water', 'honey', 'breath', 'resonance', 'pulse', 'water', 'honey', 'breath', 'resonance'],
  water: ['breath', 'water', 'breath', 'water', 'water', 'water', 'resonance', 'water', 'resonance'],
  rhythm: ['pulse', 'honey', 'pulse', 'resonance', 'pulse', 'resonance', 'pulse', 'honey', 'pulse'],
} as const;

type PresetId = keyof typeof PRESETS | 'custom';
const PRESET_IDS: PresetId[] = ['default', 'water', 'rhythm', 'custom'];
const PRESET_LABELS = ['Default', 'Water Focus', 'Rhythm Focus', 'Custom'];
const REGION_NAMES = [
  'Top left',
  'Top center',
  'Top right',
  'Middle left',
  'Center',
  'Middle right',
  'Bottom left',
  'Bottom center',
  'Bottom right',
];

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function useAmbientPlayback(live: boolean): SignaturePlayback {
  const playback = useMemo(() => {
    const sampler = createSyntheticSampler('sweep');
    sampler.configure({ loops: 1, tailSec: 0, speed: 0.72, smoothing: 0.32 });
    const clock = new PlaybackClock(sampler.duration, { playing: false, loop: true });
    return { sampler, clock, duration: sampler.duration, onsetTimes: [] };
  }, []);

  useEffect(() => {
    playback.clock.attach();
    return () => playback.clock.detach();
  }, [playback]);

  useEffect(() => {
    if (live) playback.clock.play();
    else playback.clock.pause();
  }, [live, playback]);

  return playback;
}

export interface CollaborativeScreenProps {
  returnStudioId?: string;
}

/** Local two-person collaborative performance with camera tracking and sound mapping. */
export function CollaborativeScreen({ returnStudioId }: CollaborativeScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveCanvasHostRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const activeTimer = useRef<number | null>(null);
  const runtimeRef = useRef<LivePerformanceRuntime | null>(null);
  const stoppingRuntimeRef = useRef<Promise<void>>(Promise.resolve());
  const mappedRegionRef = useRef<number | null>(null);
  const candidateRef = useRef<{ region: number | null; since: number } | null>(null);
  const soundTokenRef = useRef(0);
  const soundReadyRef = useRef(false);
  const assignmentsRef = useRef<string[]>([...PRESETS.default]);
  const manualModeRef = useRef(false);
  const mutedRef = useRef(false);
  const volumeRef = useRef(70);
  const intensityRef = useRef(0.7);
  const startedAt = useRef(performance.now());
  const camera = useCamera(videoRef);
  const [live, setLive] = useState(true);
  const [tab, setTab] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState(4);
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<string[]>([...PRESETS.default]);
  const [preset, setPreset] = useState<PresetId>('default');
  const [basePreset, setBasePreset] = useState<Exclude<PresetId, 'custom'>>('default');
  const [manualMode, setManualMode] = useState(false);
  const [showMovementZones, setShowMovementZones] = useState(true);
  const [cameraAspect, setCameraAspect] = useState('4 / 3');
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [intensity, setIntensity] = useState(0.7);
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [trackingState, setTrackingState] = useState<LiveTrackingState | null>(null);
  const [motionEnergy, setMotionEnergy] = useState(0);
  const [visualId, setVisualId] = useState('water');
  const [visualNotice, setVisualNotice] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
  const playback = useAmbientPlayback(live);
  const sound = useManualSound(volume, muted, intensity);
  const stopManualSound = sound.stop;
  const materials = listSoundMaterials();
  const materialOptions = materials.map(({ meta }) => ({
    id: meta.id,
    name: meta.name,
    description: meta.description,
  }));
  const studioPath = returnStudioId ? `/studio/${encodeURIComponent(returnStudioId)}` : '/';
  const returnPath = returnStudioId ? studioPath : '/perform';

  assignmentsRef.current = assignments;
  manualModeRef.current = manualMode;
  mutedRef.current = muted;
  volumeRef.current = volume;
  intensityRef.current = intensity;

  const applyMappedRegion = useCallback((region: number | null) => {
    const runtime = runtimeRef.current;
    mappedRegionRef.current = region;
    setActiveRegion(region);
    const token = ++soundTokenRef.current;
    soundReadyRef.current = false;
    runtime?.setMuted(true);
    if (!runtime || region === null) return;
    const materialId = assignmentsRef.current[region] ?? 'water';
    void runtime.setSound(materialId).then(() => {
      if (token !== soundTokenRef.current || runtimeRef.current !== runtime) return;
      soundReadyRef.current = true;
      runtime.setMuted(mutedRef.current || manualModeRef.current);
    }).catch((caught: unknown) => {
      if (token !== soundTokenRef.current) return;
      setLiveError(caught instanceof Error ? caught.message : 'The mapped sound could not start.');
    });
  }, []);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(
      () => setElapsed(Math.floor((performance.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [live]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === outputRef.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => {
    if (!live || !camera.stream || !videoRef.current || !liveCanvasHostRef.current) return;
    let disposed = false;
    let runtime: LivePerformanceRuntime | null = null;
    let canvas: HTMLCanvasElement | null = null;
    setTrackingState({ kind: 'loading' });
    setRuntimeReady(false);
    setLiveError(null);
    setVisualNotice(null);
    const start = async () => {
      await stoppingRuntimeRef.current;
      if (disposed || !videoRef.current || !liveCanvasHostRef.current || !camera.stream) return;
      try {
        canvas = document.createElement('canvas');
        canvas.setAttribute('aria-label', 'Live movement-driven collaborative visual');
        liveCanvasHostRef.current.append(canvas);
        runtime = new LivePerformanceRuntime(videoRef.current, canvas, camera.stream);
        const current = runtime;
        runtimeRef.current = current;
        current.onTrackingState = (state) => {
          if (!disposed) setTrackingState(state);
        };
        current.onMotion = (frame) => {
          if (disposed) return;
          const energy = Math.min(1, Math.max(0, frame.features.energy * 5));
          setMotionEnergy(energy);
          if (manualModeRef.current) return;
          const region = motionRegion(frame);
          if (region === mappedRegionRef.current) {
            candidateRef.current = null;
            return;
          }
          const now = performance.now();
          if (candidateRef.current?.region !== region) {
            candidateRef.current = { region, since: now };
          } else if (now - candidateRef.current.since >= 140) {
            candidateRef.current = null;
            applyMappedRegion(region);
          }
        };
        const visual = await current.start({
          visualId: 'water',
          soundId: assignmentsRef.current[4] ?? 'water',
          intensity: intensityRef.current,
          volume: volumeRef.current / 100,
          muted: true,
          sensitivity: 1,
        });
        if (disposed) return;
        setVisualId(visual.id);
        setVisualNotice(visual.fallbackFrom
          ? `${getVisualMaterial(visual.fallbackFrom)?.meta.name ?? 'Water'} needs a graphics feature this device lacks. Showing ${getVisualMaterial(visual.id)?.meta.name ?? visual.id} instead.`
          : null);
        setRuntimeReady(true);
      } catch (caught) {
        if (disposed) return;
        setTrackingState(null);
        setLiveError(caught instanceof Error ? caught.message : 'Live tracking could not start.');
        if (runtime) {
          stoppingRuntimeRef.current = runtime.stop();
          runtimeRef.current = null;
        }
        canvas?.remove();
      }
    };
    void start();
    return () => {
      disposed = true;
      if (runtime) {
        runtime.onMotion = null;
        runtime.onTrackingState = null;
        stoppingRuntimeRef.current = runtime.stop();
      }
      canvas?.remove();
      runtimeRef.current = null;
    };
  }, [applyMappedRegion, camera.stream, live]);

  useEffect(() => {
    runtimeRef.current?.setVolume(volume / 100);
  }, [volume]);

  useEffect(() => {
    runtimeRef.current?.setIntensity(intensity);
  }, [intensity]);

  useEffect(() => {
    runtimeRef.current?.setMuted(muted || manualMode || !soundReadyRef.current);
  }, [muted, manualMode]);

  useEffect(() => {
    candidateRef.current = null;
    mappedRegionRef.current = null;
    soundTokenRef.current++;
    soundReadyRef.current = false;
    runtimeRef.current?.setMuted(true);
    setActiveRegion(null);
    if (!manualMode) void stopManualSound();
  }, [manualMode, stopManualSound]);

  useEffect(() => {
    const region = mappedRegionRef.current;
    if (region !== null && !manualMode) applyMappedRegion(region);
  }, [assignments, manualMode, applyMappedRegion]);

  useEffect(
    () => () => {
      if (activeTimer.current !== null) window.clearTimeout(activeTimer.current);
    },
    [],
  );

  const activateRegion = (region = selectedRegion) => {
    if (!live || !manualMode) return;
    setSelectedRegion(region);
    setActiveRegion(region);
    if (activeTimer.current !== null) window.clearTimeout(activeTimer.current);
    activeTimer.current = window.setTimeout(() => setActiveRegion(null), 1600);
    if (!muted) void sound.play(assignments[region] ?? 'water');
  };

  const assignMaterial = (materialId: string) => {
    setAssignments((current) =>
      current.map((assignment, index) => (index === selectedRegion ? materialId : assignment)),
    );
    setPreset('custom');
  };

  const choosePreset = (index: number) => {
    const next = PRESET_IDS[index] ?? 'default';
    setPreset(next);
    if (next === 'custom') return;
    setBasePreset(next);
    setAssignments([...PRESETS[next]]);
  };

  const resetPreset = () => {
    setAssignments([...PRESETS[basePreset]]);
    setPreset(basePreset);
  };

  const stopPerformance = async () => {
    setLive(false);
    setActiveRegion(null);
    if (activeTimer.current !== null) {
      window.clearTimeout(activeTimer.current);
      activeTimer.current = null;
    }
    camera.stop();
    await runtimeRef.current?.stop();
    await sound.stop();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await outputRef.current?.requestFullscreen().catch(() => undefined);
    }
  };

  const activeMaterial = materials.find(
    ({ meta }) => meta.id === (assignments[activeRegion ?? selectedRegion] ?? 'water'),
  );
  const energy = motionEnergy;
  const visualProps: PropertyValues = {
    intensity: live ? 0.5 + energy * 0.5 : 0.12,
    brightness: activeRegion === null ? 0.58 : 0.9,
    dispersion: activeRegion === null ? 0.46 : 0.72,
    persistence: 0.7,
  };

  return (
    <section className={styles.workspace} aria-labelledby="collaborative-title">
      <header className={styles.workspaceHeader}>
        <div>
          <span className={styles.eyebrow}>Local two-person prototype</span>
          <h1 id="collaborative-title">Collaborative Performance</h1>
        </div>
        <span className={styles.future}>Remote collaboration · Future feature</span>
      </header>

      <div className={styles.columns}>
        <aside className={styles.performerPanel} aria-labelledby="performer-title">
          <div className={styles.roleHeading}>
            <span className={styles.roleIndex}>A</span>
            <div>
              <span className={styles.eyebrow}>Movement controller</span>
              <h2 id="performer-title">Performer</h2>
            </div>
          </div>

          <div
            className={styles.cameraPreview}
            style={{ aspectRatio: cameraAspect }}
            data-connected={camera.state === 'connected' ? '' : undefined}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                if (videoWidth && videoHeight) setCameraAspect(`${videoWidth} / ${videoHeight}`);
              }}
            />
            {camera.state === 'connected' && showMovementZones
              ? <MovementZoneOverlay activeRegion={manualMode ? null : activeRegion} />
              : null}
            {camera.state === 'connected' ? null : (
              <div className={styles.cameraEmpty}>
                <span className={styles.cameraGlyph} aria-hidden="true" />
                <strong>{camera.status.label}</strong>
                <small>{camera.error ?? 'No camera image is being shown.'}</small>
              </div>
            )}
            <div className={styles.cameraBadge}>
              <StatusBadge status={camera.status.badge} label={camera.status.label} />
            </div>
          </div>

          <div className={styles.statusList}>
            <div>
              <span>Camera</span>
              <strong data-tone={camera.state === 'connected' ? 'water' : 'quiet'}>
                {camera.status.label}
              </strong>
            </div>
            <div>
              <span>Motion tracking</span>
              <strong data-tone={!trackingState || trackingState.kind === 'fallback' ? 'honey' : 'water'}>
                {camera.state !== 'connected' ? 'Awaiting camera' :
                  trackingState?.kind === 'body' ? 'Body tracking live' :
                    trackingState?.kind === 'fallback' ? 'Camera motion fallback' :
                      trackingState?.kind === 'loading' ? 'Loading body tracking' : 'Unavailable'}
              </strong>
            </div>
            <div>
              <span>Movement energy</span>
              <strong>{energy.toFixed(2)}</strong>
            </div>
          </div>
          <progress
            className={styles.energy}
            aria-label="Movement energy"
            max={1}
            value={energy}
          />
          <p className={styles.trackingNote}>
            {camera.state !== 'connected' ? 'Enable the camera to connect live movement tracking.' :
              manualMode ? 'Manual test mode is on. Turn it off for automatic region responses.' :
                activeRegion === null ? 'Move in front of the camera to activate a sound region.' :
                  `Movement is activating ${REGION_NAMES[activeRegion]}.`}
          </p>
          <Toggle
            label="Show camera movement zones"
            checked={showMovementZones}
            accent="water"
            onChange={setShowMovementZones}
            description="The cyan cell marks the strongest camera movement. It is not a body outline."
          />
          {camera.state === 'connected' && trackingState?.kind === 'fallback' ? (
            <p className={styles.trackingError} role="alert">
              Body tracking unavailable: {trackingState.reason} Camera motion tracking is still active.
            </p>
          ) : null}
          {liveError ? <p className={styles.trackingError} role="alert">{liveError}</p> : null}
          <div className={styles.panelActions}>
            <Button
              variant="primary"
              disabled={!live || camera.state === 'loading' || camera.state === 'connected'}
              onClick={() => void camera.start()}
            >
              Enable Camera
            </Button>
            <Button onClick={() => setCameraSettingsOpen((open) => !open)} disabled={!live}>
              Camera Settings
            </Button>
          </div>
          {cameraSettingsOpen ? (
            <label className={styles.cameraSelect}>
              Camera
              <select value={camera.cameraId} onChange={(event) => camera.selectCamera(event.target.value)}>
                <option value="">Default camera</option>
                {camera.cameras.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || 'Camera'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </aside>

        <main className={styles.outputPanel}>
          <div className={styles.outputHeading}>
            <div>
              <span className={styles.eyebrow}>Shared live output</span>
              <h2>{getVisualMaterial(visualId)?.meta.name ?? 'Water'} response</h2>
            </div>
            <Button variant="quiet" onClick={() => void toggleFullscreen()}>
              {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </Button>
          </div>
          <div ref={outputRef} className={styles.outputStage}>
            {!runtimeReady ? (
              <WakeCanvas
                playback={playback}
                materialId="water"
                materialProps={visualProps}
                quality="standard"
                label="Ambient Water material preview for the collaborative performance"
                className={styles.wake}
              />
            ) : null}
            <div
              ref={liveCanvasHostRef}
              className={styles.liveCanvas}
              data-ready={runtimeReady ? '' : undefined}
            />
            <div className={styles.outputWash} aria-hidden="true" />
            <div className={styles.outputStatus}>
              <span>{live ? runtimeReady ? 'Live camera response' : 'Ambient preview' : 'Stopped'}</span>
              <strong>
                {activeRegion === null
                  ? camera.state === 'connected' ? 'Waiting for movement' : 'Camera not connected'
                  : `${REGION_NAMES[activeRegion]} · ${activeMaterial?.meta.name ?? 'Water'}`}
              </strong>
            </div>
            {activeRegion === null ? null : (
              <div
                className={styles.regionPulse}
                data-region={activeRegion}
                aria-label={`${manualMode ? 'Manual' : 'Live movement'} response in ${REGION_NAMES[activeRegion]}`}
              />
            )}
          </div>
          <p className={styles.outputNote}>
            {visualNotice ?? 'Performer movement drives this visual and activates the sound mapped to each grid region.'}
          </p>
        </main>

        <aside className={styles.collaboratorPanel} aria-labelledby="collaborator-title">
          <div className={styles.roleHeading}>
            <span className={`${styles.roleIndex} ${styles.roleIndexHoney}`}>B</span>
            <div>
              <span className={styles.eyebrow}>Sound mapping controller</span>
              <h2 id="collaborator-title">Collaborator</h2>
            </div>
          </div>
          <SegmentedControl
            label="Collaborator controls"
            hideLabel
            options={['Mapping Grid', 'Sound Mix']}
            value={tab}
            onChange={setTab}
          />

          {tab === 0 ? (
            <div className={styles.mappingTab}>
              <div className={styles.manualMode}>
                <Toggle
                  label="Manual test mode"
                  checked={manualMode}
                  accent="water"
                  disabled={!live}
                  onChange={setManualMode}
                />
                <small>Trigger a region by hand to test its sound mapping.</small>
              </div>
              <div className={styles.mappingGrid} role="group" aria-label="3 by 3 sound mapping grid">
                {assignments.map((materialId, index) => {
                  const material = materials.find(({ meta }) => meta.id === materialId);
                  return (
                    <Button
                      key={index}
                      className={styles.regionCell}
                      aria-pressed={selectedRegion === index}
                      data-active={activeRegion === index ? '' : undefined}
                      onClick={() => setSelectedRegion(index)}
                    >
                      <span>{index + 1}</span>
                      <strong>{material?.meta.name ?? 'Water'}</strong>
                    </Button>
                  );
                })}
              </div>
              <div className={styles.mappingLegend}>
                <span><i data-tone="selected" />Selected mapping</span>
                <span><i data-tone="active" />Active region</span>
              </div>
              <MaterialPicker
                kind={REGION_NAMES[selectedRegion] ?? 'Region'}
                options={materialOptions}
                value={assignments[selectedRegion] ?? 'water'}
                onChange={assignMaterial}
                disabled={!live}
              />
              <Button
                variant="primary"
                disabled={!live || !manualMode || sound.state === 'loading'}
                onClick={() => activateRegion()}
              >
                {sound.state === 'loading' ? 'Loading response…' : 'Activate selected region'}
              </Button>

              <div className={styles.preset}>
                <SegmentedControl
                  label="Grid Preset"
                  options={PRESET_LABELS}
                  value={PRESET_IDS.indexOf(preset)}
                  onChange={choosePreset}
                  disabled={!live}
                />
                <Button variant="quiet" disabled={!live} onClick={resetPreset}>
                  Reset preset
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.mixTab}>
              <Slider
                label="Master Volume"
                value={volume}
                min={0}
                max={100}
                step={1}
                baseline={70}
                accent="water"
                showValue
                format={(value) => `${Math.round(value)}%`}
                onChange={setVolume}
                disabled={!live}
              />
              <Toggle
                label="Mute"
                checked={muted}
                accent="water"
                disabled={!live}
                onChange={setMuted}
              />
              <Slider
                label="Sound Response Intensity"
                value={intensity}
                min={0}
                max={1}
                step={0.01}
                baseline={0.7}
                showValue
                format={(value) => value.toFixed(2)}
                onChange={setIntensity}
                disabled={!live}
              />
              <Button
                disabled={!live || !manualMode || muted || sound.state === 'loading'}
                onClick={() => activateRegion()}
              >
                Test {activeMaterial?.meta.name ?? 'sound'}
              </Button>
              <p className={styles.mixNote}>
                Test Sound previews the selected region’s material in manual test mode.
              </p>
            </div>
          )}
          {sound.error ? <p className={styles.soundError} role="alert">{sound.error}</p> : null}
          {!live ? (
            <section className={styles.sessionSummary} aria-labelledby="session-summary-title">
              <span className={styles.eyebrow}>Session stopped</span>
              <h3 id="session-summary-title">Session Summary</h3>
              <p>
                This prototype did not record audiovisual output or persist mapping changes.
              </p>
              <div>
                <Button disabled title="Settings persistence is a future feature">
                  Save Settings · Future
                </Button>
                <Button variant="primary" onClick={() => navigate(returnPath)}>
                  Discard &amp; Return
                </Button>
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <footer className={styles.performanceBar}>
        <div className={styles.liveState} data-live={live ? '' : undefined}>
          <i />
          <span>{live ? 'Live' : 'Stopped'}</span>
        </div>
        <div className={styles.elapsed}>
          <span>Session</span>
          <strong>{formatElapsed(elapsed)}</strong>
        </div>
        <div className={styles.memberState}>
          <span>Performer A</span>
          <strong>{camera.state === 'connected' ? trackingState?.kind === 'body' ? 'Body tracking' :
            trackingState?.kind === 'fallback' ? 'Camera motion fallback' : 'Loading body tracking' : 'Awaiting camera'}</strong>
        </div>
        <div className={styles.memberState}>
          <span>Collaborator B</span>
          <strong>{live ? 'Local controls active' : 'Stopped'}</strong>
        </div>
        <div className={styles.barVolume}>
          <Slider
            label="Master Volume"
            value={volume}
            min={0}
            max={100}
            step={1}
            accent="water"
            showValue
            format={(value) => `${Math.round(value)}%`}
            onChange={setVolume}
            disabled={!live}
          />
        </div>
        {live ? (
          <Button className={styles.stopButton} onClick={() => void stopPerformance()}>
            Stop Performance
          </Button>
        ) : (
          <span className={styles.endedLabel}>Review Session Summary</span>
        )}
      </footer>
    </section>
  );
}
