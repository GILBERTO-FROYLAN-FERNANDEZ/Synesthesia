import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { DEFAULT_RENDER_SETTINGS, type Composition } from '../../engine/composition';
import { createComposition } from '../../engine/compositionFactory';
import { baselineValues } from '../../materials/properties';
import {
  DEFAULT_SOUND_ID,
  SIGNATURE_VIEW_ID,
  getSoundMaterial,
  getVisualMaterial,
  listSoundMaterials,
  listVisualMaterials,
} from '../../materials/registry';
import { createLiveSampler, trackLiveVideo } from '../../signature/live';
import { FALLBACK_QUALITY } from '../../studio/quality';
import { StudioRuntime, type PictureProblem, type SoundProblem } from '../../studio/runtime';
import { Button } from '../../ui/Button';
import { MaterialPicker } from '../../ui/MaterialPicker';
import { PropertyPanel } from '../../ui/PropertyPanel';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Slider } from '../../ui/Slider';
import { floorFromSensitivity, formatSensitivity } from '../Prepare/sensitivity';
import styles from './Studio.module.css';

function initialComposition(): Composition {
  const composition = createComposition({
    id: 'live',
    now: new Date().toISOString(),
    name: 'Live Motion',
    signature: { id: 'live', contentHash: '', name: 'Webcam', preferredSpeed: 1 },
    seed: 0,
    visual: getVisualMaterial(SIGNATURE_VIEW_ID)!.meta,
    sound: getSoundMaterial(DEFAULT_SOUND_ID)!.meta,
    render: DEFAULT_RENDER_SETTINGS,
  });
  return { ...composition, mute: { ...composition.mute, sound: true } };
}

export function LiveStudioScreen() {
  const [initial] = useState(initialComposition);
  const [composition, setComposition] = useState(initial);
  const [sensitivity, setSensitivity] = useState(0.5);
  const noiseFloor = useRef(floorFromSensitivity(0.5));
  const [status, setStatus] = useState('Opening the camera…');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [picture, setPicture] = useState<PictureProblem | null>(null);
  const [sound, setSound] = useState<SoundProblem | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const runtimeRef = useRef<StudioRuntime | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const video = videoRef.current;
    if (!host || !video) return;

    const source = createLiveSampler();
    const runtime = new StudioRuntime({
      host,
      liveSampler: source.sampler,
      composition: initial,
      quality: FALLBACK_QUALITY,
      loop: false,
      events: {
        transport() {},
        timeline() {},
        picture: setPicture,
        sound: setSound,
      },
    });
    runtimeRef.current = runtime;
    runtime.play();
    let cancelled = false;
    let stream: MediaStream | undefined;
    let stopTracking: (() => void) | undefined;

    function fail(message: string) {
      if (cancelled) return;
      stopTracking?.();
      stream?.getTracks().forEach((track) => track.stop());
      runtime.pause();
      setCameraError(message);
    }

    async function startCamera(preview: HTMLVideoElement) {
      if (cancelled) return;
      try {
        const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          camera.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = camera;
        for (const track of camera.getVideoTracks()) {
          track.onended = () => fail('The camera disconnected.');
        }
        preview.srcObject = camera;
        await preview.play();
      } catch {
        fail('Could not open the camera. Check your browser permissions.');
        return;
      }
      if (cancelled) return;
      setStatus('Starting motion tracking…');
      try {
        let receivedMotion = false;
        stopTracking = trackLiveVideo(
          preview,
          () => noiseFloor.current,
          (frame, onset) => {
            source.update(frame, runtime.position, onset);
            if (!receivedMotion) {
              receivedMotion = true;
              setStatus('Live');
            }
          },
          () => fail('Motion tracking stopped. Return to Prepare to try again.'),
        );
      } catch {
        fail('This browser could not start live motion tracking.');
      }
    }

    queueMicrotask(() => void startCamera(video));
    return () => {
      cancelled = true;
      stopTracking?.();
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      runtimeRef.current = null;
      runtime.dispose();
    };
  }, [initial]);

  useEffect(() => {
    runtimeRef.current?.setComposition(composition);
  }, [composition]);

  return (
    <section className={`${styles.studio} ${styles.liveStudio}`} aria-labelledby="live-title">
      <div className={`${styles.grid} ${styles.liveGrid}`}>
        <header className={styles.header}>
          <h1 id="live-title">Live Motion</h1>
          <p role="status">{cameraError ? 'Offline' : status}</p>
          <Button onClick={() => navigate('/prepare')}>Back to Prepare</Button>
        </header>
        <div className={styles.stage}>
          <div ref={hostRef} className={styles.canvasHost} />
          <video
            ref={videoRef}
            muted
            playsInline
            className={styles.liveCamera}
            aria-label="Webcam preview"
          />
          {cameraError || picture ? (
            <p className={styles.pictureProblem} role="alert">
              {cameraError ?? 'Could not show this visual. Try choosing another material.'}
            </p>
          ) : null}
        </div>
        <aside className={styles.panel} aria-label="Live controls">
          <Slider
            label="Sensitivity"
            value={sensitivity}
            baseline={0.5}
            format={formatSensitivity}
            showValue
            description="Higher picks up smaller, slower movements."
            disabled={cameraError !== null}
            onChange={(value) => {
              noiseFloor.current = floorFromSensitivity(value);
              setSensitivity(value);
            }}
          />
          <Button
            disabled={cameraError !== null}
            onClick={() => {
              if (composition.mute.sound) runtimeRef.current?.play();
              setComposition((current) => ({
                ...current,
                mute: { ...current.mute, sound: !current.mute.sound },
              }));
            }}
          >
            {composition.mute.sound ? 'Enable sound' : 'Mute sound'}
          </Button>
          {sound && !composition.mute.sound ? <p role="status">Sound is unavailable.</p> : null}
          <section className={styles.section} aria-label="Visual mapping">
            <h2 className={styles.sectionTitle}>Mapping</h2>
            <SegmentedControl
              label="Visual mapping"
              options={['Wake', 'Displacement']}
              value={composition.visual.mapping === 'displacement' ? 1 : 0}
              onChange={(index) =>
                setComposition((current) => ({
                  ...current,
                  visual: { ...current.visual, mapping: index === 1 ? 'displacement' : 'wake' },
                }))
              }
            />
          </section>
          {(['visual', 'sound'] as const).map((kind) => {
            const entries = kind === 'visual' ? listVisualMaterials() : listSoundMaterials();
            const field = composition[kind];
            const material = entries.find(({ meta }) => meta.id === field.materialId)?.meta;
            const label = kind === 'visual' ? 'Visual' : 'Sound';
            return (
              <div className={styles.section} key={kind}>
                <MaterialPicker
                  kind={label}
                  options={entries.map(({ meta }) => meta)}
                  value={field.materialId}
                  onChange={(id) => {
                    const next = entries.find(({ meta }) => meta.id === id)?.meta;
                    if (!next) return;
                    setComposition((current) => ({
                      ...current,
                      [kind]: {
                        ...current[kind],
                        materialId: next.id,
                        materialVersion: next.version,
                        properties: baselineValues(next.properties),
                      },
                    }));
                  }}
                />
                {material ? (
                  <PropertyPanel
                    key={material.id}
                    defs={material.properties}
                    values={field.properties}
                    label={`${material.name} ${kind} properties`}
                    onChange={(id, value) =>
                      setComposition((current) => ({
                        ...current,
                        [kind]: {
                          ...current[kind],
                          properties: { ...current[kind].properties, [id]: value },
                        },
                      }))
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </aside>
      </div>
    </section>
  );
}
