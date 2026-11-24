import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../../engine/audio/AudioEngine';
import { navigate } from '../../app/router';
import { baselineValues } from '../../materials/properties';
import {
  DEFAULT_SOUND_ID,
  DEFAULT_VISUAL_ID,
  getSoundMaterial,
  listCreativeVisualMaterials,
  listSoundMaterials,
} from '../../materials/registry';
import { createSyntheticSampler } from '../../signature/synthetic';
import { Button } from '../../ui/Button';
import { Slider } from '../../ui/Slider';
import { StatusBadge } from '../../ui/StatusBadge';
import { Toggle } from '../../ui/Toggle';
import styles from './CameraSetupScreen.module.css';
import { useCamera } from './useCamera';
import { beginPerformance } from './liveSession';

type SoundState = 'idle' | 'loading' | 'playing' | 'error';

interface SoundPreviewSession {
  context: AudioContext;
  engine: AudioEngine;
  volume: GainNode;
}

async function disposeSoundPreview(session: SoundPreviewSession): Promise<void> {
  session.engine.onEnded = null;
  session.engine.pause();
  await session.engine.dispose().catch(() => undefined);
  session.volume.disconnect();
  await session.context.close().catch(() => undefined);
}

function RibbonPlaceholder() {
  return (
    <svg className={styles.ribbonArt} viewBox="0 0 900 506" aria-hidden="true">
      <path
        className={styles.waterRibbon}
        d="M-80 334C92 143 208 164 338 265s241 116 354-14 213-140 318-56"
      />
      <path
        className={styles.waterRibbonSoft}
        d="M-52 380C116 218 232 219 351 299s231 89 337-17 190-116 279-75"
      />
      <path
        className={styles.honeyRibbon}
        d="M-30 214c154-92 280-74 389 15s215 99 322 3 195-121 291-90"
      />
    </svg>
  );
}

/** Camera and basic sound preparation for the live Performance workspace. */
export function CameraSetupScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const soundSessionRef = useRef<SoundPreviewSession | null>(null);
  const soundRun = useRef(0);

  const camera = useCamera(videoRef);
  const [soundId, setSoundId] = useState(DEFAULT_SOUND_ID);
  const [visualId, setVisualId] = useState(DEFAULT_VISUAL_ID);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(70);
  const [soundState, setSoundState] = useState<SoundState>('idle');
  const [soundError, setSoundError] = useState<string | null>(null);

  const stopSound = useCallback(async () => {
    soundRun.current++;
    const session = soundSessionRef.current;
    soundSessionRef.current = null;
    setSoundState('idle');
    if (session) await disposeSoundPreview(session);
  }, []);

  const testSound = async () => {
    if (soundState === 'playing') {
      await stopSound();
      return;
    }
    const entry = getSoundMaterial(soundId);
    if (!entry) {
      setSoundState('error');
      setSoundError('That sound material is not available.');
      return;
    }

    await stopSound();
    const run = soundRun.current;
    setSoundState('loading');
    setSoundError(null);
    let session: SoundPreviewSession | null = null;
    try {
      const context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      const output = context.createGain();
      output.gain.value = volume / 100;
      output.connect(context.destination);
      const engine = new AudioEngine({ context, destination: output, masterGain: 1 });
      session = { context, engine, volume: output };
      const activeSession = session;
      soundSessionRef.current = activeSession;

      const sampler = createSyntheticSampler('wink');
      sampler.configure({ loops: 1, tailSec: 0.75, speed: 1.25 });
      await engine.load({
        entry,
        sampler,
        props: baselineValues(entry.meta.properties),
        seed: 1,
      });
      if (run !== soundRun.current) {
        if (soundSessionRef.current === activeSession) soundSessionRef.current = null;
        await disposeSoundPreview(activeSession);
        return;
      }
      engine.setMuted(muted);
      engine.onEnded = () => {
        if (run !== soundRun.current || soundSessionRef.current !== activeSession) return;
        soundRun.current++;
        soundSessionRef.current = null;
        setSoundState('idle');
        void disposeSoundPreview(activeSession);
      };
      await engine.play(0);
      setSoundState('playing');
    } catch (error) {
      if (run !== soundRun.current) return;
      console.warn('Sound preview could not start:', error);
      if (soundSessionRef.current === session) soundSessionRef.current = null;
      if (session) await disposeSoundPreview(session);
      setSoundState('error');
      setSoundError(
        'Sound preview could not start on this device. Check your audio output and try again.',
      );
    }
  };

  useEffect(
    () => () => {
      const session = soundSessionRef.current;
      soundSessionRef.current = null;
      if (session) void disposeSoundPreview(session);
    },
    [],
  );

  useEffect(() => {
    const session = soundSessionRef.current;
    if (!session) return;
    session.volume.gain.setTargetAtTime(volume / 100, session.context.currentTime, 0.015);
  }, [volume]);

  useEffect(() => {
    soundSessionRef.current?.engine.setMuted(muted);
  }, [muted]);

  const { status } = camera;
  const soundMaterials = listSoundMaterials();
  const visualMaterials = listCreativeVisualMaterials();

  const startPerformance = async () => {
    const stream = camera.detach();
    if (!stream) return;
    await stopSound();
    beginPerformance(stream, camera.cameraName, {
      visualId,
      visualMapping: 'displacement',
      soundId,
      visualProperties: baselineValues(visualMaterials.find(({ meta }) => meta.id === visualId)?.meta.properties ?? []),
      soundProperties: baselineValues(getSoundMaterial(soundId)?.meta.properties ?? []),
      bodyTrackingEnabled: false,
      intensity: 1,
      volume: volume / 100,
      muted,
      sensitivity: 1,
      recordSource: false,
    });
    navigate('/perform/live');
  };

  return (
    <section className={styles.page} aria-labelledby="camera-setup-title">
      <header className={styles.intro}>
        <span className={styles.eyebrow}>Perform</span>
        <h1 id="camera-setup-title">Camera Setup</h1>
        <p>Prepare your camera before entering a performance workspace. Sound Grid is the default live instrument; enable it in the workspace. The sound material preview below is for the optional Material mode.</p>
      </header>

      <section className={styles.cameraPanel} aria-labelledby="camera-preview-title">
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Live input</span>
            <h2 id="camera-preview-title">Camera Preview</h2>
          </div>
          <StatusBadge status={status.badge} label={status.label} />
        </div>

        <div
          className={styles.preview}
          data-connected={camera.state === 'connected' ? '' : undefined}
        >
          <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
          {camera.state === 'connected' ? null : (
            <div className={styles.previewPlaceholder}>
              <RibbonPlaceholder />
              <div className={styles.previewCopy}>
                <span className={styles.cameraGlyph} aria-hidden="true" />
                <strong>{status.label}</strong>
                <span>{camera.error ?? status.message}</span>
              </div>
            </div>
          )}
          <div className={styles.previewStatus}>
            <StatusBadge status={status.badge} label={status.label} />
          </div>
          {camera.cameraName ? <span className={styles.cameraName}>{camera.cameraName}</span> : null}
        </div>

        {camera.error ? (
          <p className={styles.error} role="alert">
            {camera.error}
          </p>
        ) : (
          <p className={styles.cameraMessage} role="status">
            {status.message}
          </p>
        )}

        <div className={styles.cameraSettings}>
          <label className={styles.field}>
            <span>Camera</span>
            <select
              value={camera.cameraId}
              disabled={camera.state === 'loading'}
              onChange={(event) => camera.selectCamera(event.target.value)}
            >
              <option value="">Default camera</option>
              {camera.cameras.map((device, index) => (
                <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.cameraActions}>
            <Button
              variant="primary"
              disabled={camera.state === 'loading' || camera.state === 'connected'}
              onClick={() => void camera.start()}
            >
              Enable Camera
            </Button>
            <Button
              disabled={camera.state !== 'loading' && camera.state !== 'connected'}
              onClick={camera.stop}
            >
              Stop Camera
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.soundPanel} aria-labelledby="sound-setup-title">
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Audio preview</span>
            <h2 id="sound-setup-title">Sound Setup</h2>
          </div>
          <span className={styles.soundReady}>
            {muted ? 'Muted' : soundState === 'playing' ? 'Previewing' : 'Ready'}
          </span>
        </div>
        <p className={styles.sectionIntro}>
          Choose materials and a comfortable listening level. Fine-tune their properties during Perform.
        </p>

        <div className={styles.soundGrid}>
          <label className={styles.field}>
            <span>Visual Material</span>
            <select value={visualId} onChange={(event) => setVisualId(event.target.value)}>
              {visualMaterials.map((material) => (
                <option key={material.meta.id} value={material.meta.id}>
                  {material.meta.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Sound Material</span>
            <select
              value={soundId}
              onChange={(event) => {
                void stopSound();
                setSoundId(event.target.value);
                setSoundError(null);
              }}
            >
              {soundMaterials.map((material) => (
                <option key={material.meta.id} value={material.meta.id}>
                  {material.meta.name}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.testControl}>
            <span>Test Sound</span>
            <Button
              onClick={() => void testSound()}
              disabled={soundState === 'loading' || (muted && soundState !== 'playing')}
            >
              {soundState === 'loading'
                ? 'Loading sound…'
                : soundState === 'playing'
                  ? 'Stop test'
                  : 'Test sound'}
            </Button>
          </div>

          <div className={styles.muteControl}>
            <Toggle
              label="Mute"
              checked={muted}
              accent="water"
              onChange={setMuted}
              description="Turn the sound preview on or off."
            />
          </div>

          <div className={styles.volumeControl}>
            <Slider
              label="Volume"
              value={volume}
              min={0}
              max={100}
              step={1}
              baseline={70}
              accent="water"
              showValue
              format={(value) => `${Math.round(value)}%`}
              onChange={(value) => setVolume(value)}
              description="The listening level for sound previews."
            />
          </div>
        </div>

        {soundError ? (
          <p className={styles.error} role="alert">
            {soundError}
          </p>
        ) : (
          <p className={styles.soundHint}>
            {muted
              ? 'Sound previews are muted.'
              : `Test sound plays a short ${getSoundMaterial(soundId)?.meta.name ?? 'material'} response through your current audio output.`}
          </p>
        )}
        <div className={styles.trackingSetup}>
          <div>
            <strong>Motion Tracking</strong>
            <small>Tracks movement across the entire camera image, including people, objects, and materials. No human pose is required.</small>
          </div>
          <span className={styles.trackingMode}>Full frame</span>
        </div>
      </section>

      <footer className={styles.startPanel}>
        <div>
          <span className={styles.eyebrow}>Next step</span>
          <h2>Ready to perform?</h2>
          <p>Your active camera stream continues into the workspace without another permission prompt.</p>
        </div>
        <Button
          variant="primary"
          className={styles.startButton}
          disabled={camera.state !== 'connected'}
          onClick={() => void startPerformance()}
        >
          Start Performance
          <span>Live</span>
        </Button>
      </footer>
    </section>
  );
}
