import { useSoundGrid } from '../Studio/SoundGrid/useSoundGrid';
import { SoundGridPanel } from '../Studio/SoundGrid/SoundGridPanel';
import { SoundGridCamera } from '../Studio/SoundGrid/SoundGridCamera';
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import type { TimestampedSettingChange } from '../../engine/composition';
import { completeValues } from '../../engine/propertyModel';
import { baselineValues } from '../../materials/properties';
import { visualMappingProperties } from '../../materials/visual/lines/properties';
import {
  SIGNATURE_VIEW_ID,
  getSoundMaterial,
  getVisualMaterial,
  listCreativeVisualMaterials,
  listSoundMaterials,
} from '../../materials/registry';
import { Button } from '../../ui/Button';
import { MaterialPicker } from '../../ui/MaterialPicker';
import { MotionResponsePicker, mappingForResponse, responseAvailable, responseForMapping, type MotionResponse } from '../../ui/MotionResponsePicker';
import { MOVEMENT_ZONE_NAMES, MovementZoneOverlay } from '../../ui/MovementZoneOverlay';
import { PropertyPanel } from '../../ui/PropertyPanel';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { useManualSound } from '../Collaborative/useManualSound';
import { LivePerformanceRuntime } from './liveRuntime';
import type { LiveTrackingState } from './liveMotion';
import { motionRegion } from '../Collaborative/motionGrid';
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
  const stagePanelRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<LivePerformanceRuntime | null>(null);
  const changesRef = useRef<TimestampedSettingChange[]>([]);
  const startedRef = useRef(0);
  const abandonTimerRef = useRef<number | null>(null);
  const [settings, setSettings] = useState<PerformanceSettings>(() => {
    const initial = session?.settings;
    const visualId = initial?.visualId ?? 'water';
    const soundId = initial?.soundId ?? 'water';
    return {
      visualId,
      visualMapping: initial?.visualMapping ?? 'displacement',
      soundId,
      visualProperties: initial?.visualProperties ?? baselineValues(getVisualMaterial(visualId)?.meta.properties ?? []),
      soundProperties: initial?.soundProperties ?? baselineValues(getSoundMaterial(soundId)?.meta.properties ?? []),
      bodyTrackingEnabled: false,
      intensity: initial?.intensity ?? 1,
      volume: initial?.volume ?? 0.7,
      muted: initial?.muted ?? false,
      sensitivity: initial?.sensitivity ?? 1,
      recordSource: initial?.recordSource ?? false,
    };
  });
  const settingsRef = useRef(settings);
  const grid = useSoundGrid();
  const [gridMode, setGridMode] = useState(true);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const gridModeRef = useRef(true);
  const usedGridRef = useRef(false);
  useEffect(() => { if (grid.sounding) usedGridRef.current = true; }, [grid.sounding]);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [soundActive, setSoundActive] = useState(false);
  const [status, setStatus] = useState(session ? 'Starting live materials…' : 'No live session');
  const [error, setError] = useState<string | null>(null);
  const [visualNotice, setVisualNotice] = useState<string | null>(null);
  const [trackingState, setTrackingState] = useState<LiveTrackingState>({ kind: 'loading' });
  const [inspectorTab, setInspectorTab] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showMovementZones, setShowMovementZones] = useState(true);
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  const [cameraAspect, setCameraAspect] = useState('16 / 9');
  const [cameraDocked, setCameraDocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const soundPreview = useManualSound(settings.volume * 100, settings.muted, 1, settings.soundProperties);

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
      runtime = new LivePerformanceRuntime(video, canvas, session.stream, grid.engine);
      runtime.setGridMode(gridModeRef.current);
      runtimeRef.current = runtime;
      runtime.onActivity = setSoundActive;
      runtime.onTrackingState = (state) => {
        setTrackingState(state);
        setStatus(state.kind === 'loading' ? 'Starting motion tracking…' : 'Motion tracking live');
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
          change({
            visualId: visual.id,
            visualMapping: visual.mapping,
            visualProperties: baselineValues(visualMappingProperties(getVisualMaterial(visual.id)?.meta.properties ?? [], visual.mapping)),
          });
          setVisualNotice(
            `${getVisualMaterial(visual.fallbackFrom)?.meta.name ?? 'The selected visual'} cannot render on this graphics card. Showing ${getVisualMaterial(visual.id)?.meta.name ?? visual.id} instead.`,
          );
        }
        setRuntimeReady(true);
        activeRuntime.onMotion = (frame) => {
          setEnergy(Math.min(1, frame.features.energy * 5));
          setActiveRegion(frame.features.energy >= 0.01 ? motionRegion(frame) : null);
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
      grid.engine.dispose();
      if (activeRuntime) { activeRuntime.onMotion = null; activeRuntime.tracker.onFrame = null; }
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

  const chooseSoundMode = (index: number) => {
    const enabled = index === 0;
    gridModeRef.current = enabled;
    setGridMode(enabled);
    if (!enabled) grid.setSounding(false);
    else void soundPreview.stop();
    runtimeRef.current?.setGridMode(enabled);
  };

  const change = (patch: Partial<PerformanceSettings>, record = true) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (patch.intensity !== undefined) runtime.setIntensity(next.intensity);
    if (patch.volume !== undefined) runtime.setVolume(next.volume);
    if (patch.muted !== undefined) runtime.setMuted(next.muted);
    if (patch.sensitivity !== undefined) runtime.setSensitivity(next.sensitivity);
    if (patch.visualProperties !== undefined) runtime.setVisualProperties(next.visualProperties);
    if (patch.soundProperties !== undefined) runtime.setSoundProperties(next.soundProperties);
    if (!record) return;
    changesRef.current.push({
      atSec: (performance.now() - startedRef.current) / 1000,
      visualMaterialId: next.visualId,
      visualMapping: next.visualMapping,
      soundMaterialId: next.soundId,
      intensity: next.intensity,
      volume: next.volume,
      muted: next.muted,
      sensitivity: next.sensitivity,
      visualProperties: { ...next.visualProperties },
      soundProperties: { ...next.soundProperties },
      bodyTrackingEnabled: next.bodyTrackingEnabled,
    });
  };

  const selectVisual = async (visualId: string) => {
    try {
      const current = settingsRef.current;
      const mapping = responseAvailable(responseForMapping(current.visualMapping), visualId)
        ? current.visualMapping : 'displacement';
      const props = baselineValues(visualMappingProperties(getVisualMaterial(visualId)?.meta.properties ?? [], mapping));
      const visual = await runtimeRef.current?.setVisual(visualId, props, mapping);
      if (!visual) return;
      change({
        visualId: visual.id,
        visualMapping: visual.mapping,
        visualProperties: visual.fallbackFrom
          ? baselineValues(visualMappingProperties(getVisualMaterial(visual.id)?.meta.properties ?? [], visual.mapping))
          : props,
      });
      setError(null);
      setVisualNotice(
        visual.fallbackFrom
          ? `${getVisualMaterial(visual.fallbackFrom)?.meta.name ?? 'The selected visual'} cannot render on this graphics card. Showing ${getVisualMaterial(visual.id)?.meta.name ?? visual.id} instead.`
          : mapping !== current.visualMapping
            ? `${getVisualMaterial(visual.id)?.meta.name ?? 'This material'} does not support ${responseForMapping(current.visualMapping)}. Switched to Push.`
          : null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The visual could not be changed.');
    }
  };
  const selectResponse = async (response: MotionResponse) => {
    const current = settingsRef.current;
    if (!responseAvailable(response, current.visualId)) return;
    const mapping = mappingForResponse(response);
    const props = completeValues(
      current.visualProperties,
      visualMappingProperties(getVisualMaterial(current.visualId)?.meta.properties ?? [], mapping),
    );
    try {
      const visual = await runtimeRef.current?.setVisual(current.visualId, props, mapping);
      if (!visual) return;
      change({
        visualId: visual.id,
        visualMapping: visual.mapping,
        visualProperties: visual.fallbackFrom
          ? baselineValues(visualMappingProperties(getVisualMaterial(visual.id)?.meta.properties ?? [], visual.mapping))
          : props,
      });
      setError(null);
      setVisualNotice(visual.fallbackFrom
        ? `${getVisualMaterial(current.visualId)?.meta.name ?? 'This visual'} cannot render here. Showing ${getVisualMaterial(visual.id)?.meta.name ?? visual.id} instead.`
        : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The motion response could not be changed.');
    }
  };
  const selectSound = async (soundId: string) => {
    try {
      await runtimeRef.current?.setSound(soundId);
      change({
        soundId,
        soundProperties: baselineValues(getSoundMaterial(soundId)?.meta.properties ?? []),
      });
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
      grid.setSounding(false);
      grid.engine.dispose();
      await runtime.stop();
      session.stream.getTracks().forEach((track) => track.stop());
      takeActivePerformance();
      completePerformance({
        id: session.id,
        name: defaultName,
        recordedAt: session.startedAt,
        duration,
        settings: { ...settingsRef.current, liveSoundSource: gridMode ? 'grid' : 'material', soundGrid: gridMode ? { ...grid.settings } : undefined, usedSoundGrid: usedGridRef.current },
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

  const soundEnabled = !settings.muted && (!gridMode || grid.sounding);
  const toggleSound = () => {
    if (soundEnabled) {
      change({ muted: true });
      if (gridMode) grid.setSounding(false);
      else void soundPreview.stop();
    } else {
      change({ muted: false });
      if (gridMode) grid.setSounding(true);
    }
  };
  const editingVisual = inspectorTab === 0;
  const selectedMaterial = editingVisual
    ? getVisualMaterial(settings.visualId)
    : getSoundMaterial(settings.soundId);
  const diagnosticVisual = editingVisual && settings.visualId === SIGNATURE_VIEW_ID;
  const visualDefs = visualMappingProperties(
    getVisualMaterial(settings.visualId)?.meta.properties ?? [],
    settings.visualMapping,
  );

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
      <div className={`${styles.workspace} ${inspectorOpen ? '' : styles.inspectorClosed}`}>
        <aside className={styles.side}>
          <div className={styles.sourceHeading}>
            <span className={styles.eyebrow}>Movement &amp; sound</span>
            <h2>Performance setup</h2>
          </div>
          <div className={styles.tracking}>
            <strong>Movement</strong>
            <div><span style={{ width: `${energy * 100}%` }} /></div>
            <small className={styles.trackingLine} title="Movement across the full camera image drives the visual and sound.">
              <span>{trackingState.kind === 'loading' ? 'Starting motion tracking…' : 'Motion Tracking'}</span>
              <span>{Math.round(energy * 100)}%</span>
            </small>
            {!gridMode && showMovementZones ? <small className={styles.trackingLine} role="status"><span>{activeRegion === null
              ? 'Active zone: —'
              : `Active zone: ${MOVEMENT_ZONE_NAMES[activeRegion]}`}</span></small> : null}
            {trackingState.kind === 'fallback' ? (
              <small className={styles.trackingWarning} role="alert">
                {trackingState.reason}
              </small>
            ) : null}
            <small className={styles.trackingLine} role="status"><span>Sound: {settings.muted ? 'Muted' : gridMode ? grid.starting ? 'Starting' : !grid.sounding ? 'Off' : grid.activeCount ? `${grid.activeCount} active zones` : 'Ready · move to play' : soundActive ? 'Active' : 'Waiting'}</span></small>
          </div>
          <div className={styles.gridStart}>
            <strong>Play with movement</strong>
            <p>{gridMode ? 'Enable sound, then move through the camera grid. Each zone plays a different note.' : 'Enable sound to hear the selected material respond to movement.'}</p>
            <Button variant="primary" disabled={!runtimeReady || (gridMode && grid.starting) || busy} onClick={toggleSound}>
              {gridMode && grid.starting ? 'Starting sound…' : soundEnabled ? 'Mute sound' : 'Enable sound'}
            </Button>
            {gridMode && grid.error ? <small role="alert">{grid.error}</small> : null}
          </div>
          <div className={styles.controlGroupHeading} title="These controls affect the whole performance. The Inspector changes only the selected material.">
            <strong>Performance controls</strong><span aria-hidden="true">ⓘ</span>
          </div>
          <Slider label="Movement strength" description="Scales the tracked movement sent to both visual and sound materials. The stillness gate uses the original camera motion." value={settings.intensity} min={0} max={3} step={0.05} baseline={1} showValue onChange={(intensity) => change({ intensity })} />
          <Slider label="Volume" description="Overall output loudness for this performance; it does not change a material's character." value={settings.volume} min={0} max={1} step={0.01} baseline={0.7} showValue format={(v) => `${Math.round(v * 100)}%`} onChange={(volume) => change({ volume })} />
          <Slider label="Sensitivity" description="How strongly the camera tracker detects motion before material controls are applied." value={settings.sensitivity} min={0.2} max={2} step={0.05} baseline={1} showValue onChange={(sensitivity) => change({ sensitivity })} />
          <Toggle label="Record original camera separately" checked={settings.recordSource} accent="honey" onChange={(recordSource) => change({ recordSource })} description="Applies when the next recording starts." />
        </aside>
        <div className={styles.stage} ref={stagePanelRef}>
          <div className={styles.stageHeader}>
            <div>
              <span className={styles.eyebrow}>Live output</span>
              <strong>{getVisualMaterial(settings.visualId)?.meta.name ?? 'Visual'} response</strong>
              <small>{getVisualMaterial(settings.visualId)?.meta.name} visual · {gridMode ? 'Sound Grid' : getSoundMaterial(settings.soundId)?.meta.name + ' sound'}</small>
            </div>
            <div className={styles.stageActions}>
              <button type="button" className={styles.layoutButton} aria-pressed={cameraDocked} onClick={() => setCameraDocked((docked) => !docked)} title="Switch between an overlaid camera and a separate side-by-side preview">{cameraDocked ? 'Overlay camera' : 'Side by side'}</button>
              <button
                type="button"
                className={`${styles.openInspector} ${inspectorOpen ? styles.openInspectorHidden : ''}`}
                onClick={() => setInspectorOpen(true)}
                aria-controls="perform-material-inspector"
                aria-expanded={inspectorOpen}
                inert={inspectorOpen}
              >
                Show controls
              </button>
              <span className={styles.stageLive}><i aria-hidden="true" />{recording ? 'Recording' : 'Live'}</span>
            </div>
          </div>
          <div className={styles.stageViewport}>
            <div className={`${styles.previewGroup} ${cameraDocked ? styles.previewDocked : ''}`}>
              <div ref={stageRef} className={styles.canvasHost}>
                <div className={styles.stageLabel}>
                  {getVisualMaterial(settings.visualId)?.meta.name} · {gridMode ? 'Sound Grid' : getSoundMaterial(settings.soundId)?.meta.name}
                </div>
              </div>
              <div className={styles.camera} style={{ aspectRatio: cameraAspect }}>
                <video
                  ref={videoRef}
                  style={{ opacity: gridMode && grid.shown && !grid.showCamera ? 0 : 1 }}
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={(event) => {
                    const { videoWidth, videoHeight } = event.currentTarget;
                    if (videoWidth && videoHeight) setCameraAspect(`${videoWidth} / ${videoHeight}`);
                  }}
                />
                {gridMode ? (grid.shown ? <SoundGridCamera engine={grid.engine} source={videoRef} showCamera={grid.showCamera} overlayOnly className="integrated-sound-grid" /> : null) : showMovementZones ? <MovementZoneOverlay activeRegion={activeRegion} /> : null}
                <span className={styles.cameraName} title={session.cameraName || 'Active camera'}>Live camera</span>
              </div>
            </div>
          </div>
        </div>
        <aside
          id="perform-material-inspector"
          className={styles.inspector}
          aria-label="Live material controls"
          aria-hidden={!inspectorOpen}
          inert={!inspectorOpen}
        >
          <div className={styles.inspectorHeading}>
            <div><span className={styles.eyebrow}>Selected {editingVisual ? 'visual' : 'sound'} layer</span><h2>{editingVisual ? 'Visual material' : 'Sound controls'}</h2></div>
            <button type="button" className={styles.collapseInspector} onClick={() => setInspectorOpen(false)} aria-label="Hide material controls" title="Hide material controls">Hide panel ‹</button>
          </div>
          <div className={styles.trackingControls}>
            <div className={styles.motionTrackingInfo}>
              <strong>Motion Tracking</strong>
              <small>Movement anywhere in the camera frame drives the response.</small>
            </div>
            {!gridMode ? <Toggle
              label="Show movement zones"
              checked={showMovementZones}
              accent="water"
              onChange={setShowMovementZones}
              description="Highlight the region with the strongest motion in the camera image."
            /> : null}
          </div>
          <SegmentedControl
            label="Material properties"
            hideLabel
            options={['Visual', 'Sound']}
            value={inspectorTab}
            onChange={setInspectorTab}
          />
          {!editingVisual ? <SegmentedControl label="Sound source" options={['Sound Grid', 'Material']} value={gridMode ? 0 : 1} onChange={chooseSoundMode} /> : null}
          {!editingVisual && gridMode ? <SoundGridPanel grid={grid} showStart={false} disabled={!runtimeReady || busy} /> : <>
          <p className={styles.inspectorHint} title="The left sliders affect the whole performance. These sliders shape only the selected visual or sound material.">
            {diagnosticVisual ? 'Showing the motion field for diagnostics.' : editingVisual ? 'Shape the current visual. Move to see the effect.' : 'Shape the current sound. Move or test it to hear the effect.'}
          </p>
          <div className={styles.materialSelect}>
            <span>{editingVisual ? 'Visual material' : 'Sound material'}</span>
            <MaterialPicker
              kind={editingVisual ? 'Visual' : 'Sound'}
              options={[
                ...(diagnosticVisual ? [{ id: SIGNATURE_VIEW_ID, name: 'Tracking diagnostic', description: 'Shows the raw motion field when other visuals cannot render.' }] : []),
                ...(editingVisual ? listCreativeVisualMaterials() : listSoundMaterials()).map((entry) => entry.meta),
              ]}
              value={editingVisual ? settings.visualId : settings.soundId}
              onChange={(id) => void (editingVisual ? selectVisual(id) : selectSound(id))}
            />
          </div>
          {editingVisual && !diagnosticVisual ? (
            <MotionResponsePicker
              value={settings.visualMapping}
              materialId={settings.visualId}
              onChange={(response) => void selectResponse(response)}
            />
          ) : null}
          {diagnosticVisual ? <p className={styles.diagnosticNotice}>The graphics card could not render a visual material. This view shows tracked movement directly; choose another visual material above to try it.</p> : <PropertyPanel
            key={`${editingVisual ? 'visual' : 'sound'}:${selectedMaterial?.meta.id ?? ''}`}
            label={`${selectedMaterial?.meta.name ?? 'Material'} ${editingVisual ? 'visual' : 'sound'} properties`}
            defs={editingVisual ? visualDefs : selectedMaterial?.meta.properties ?? []}
            values={editingVisual ? settings.visualProperties : settings.soundProperties}
            compact
            onChange={(id, value, phase) => change(
              editingVisual
                ? { visualProperties: { ...settingsRef.current.visualProperties, [id]: value } }
                : { soundProperties: { ...settingsRef.current.soundProperties, [id]: value } },
              phase === 'end',
            )}
          />}
          {!editingVisual ? <div className={styles.soundTest}>
            <Button onClick={() => void (soundPreview.state === 'playing' ? soundPreview.stop() : soundPreview.play(settings.soundId))} disabled={soundPreview.state === 'loading' || settings.muted}>
              {soundPreview.state === 'playing' ? 'Stop test' : soundPreview.state === 'loading' ? 'Loading sound…' : 'Test sound'}
            </Button>
            {soundPreview.error ? <small role="alert">{soundPreview.error}</small> : null}
          </div> : null}
          </>}
        </aside>
      </div>
      <footer className={styles.controls}>
        <Button
          onClick={() => void stagePanelRef.current?.requestFullscreen()}
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
