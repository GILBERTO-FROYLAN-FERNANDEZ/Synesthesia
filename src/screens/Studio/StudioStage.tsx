import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { overlayAllowed } from '../../app/firstRun';
import { href } from '../../app/router';
import type { Composition } from '../../engine/composition';
import { getVisualMaterial } from '../../materials/registry';
import { useStudioStore, type TransportController } from '../../state/studioStore';
import { clipForVisit } from '../../state/visitClips';
import { ClipLayer, type ClipLayerView } from '../../studio/clipLayer';
import { projectionRange } from '../../studio/clipLayerMath';
import { measureThisComputer } from '../../studio/measure';
import { FALLBACK_QUALITY } from '../../studio/quality';
import { StudioRuntime, type PictureProblem } from '../../studio/runtime';
import { CloseIcon } from '../../ui/icons';
import { soundMetas, visualMetas } from '../../studio/catalog';
import styles from './Studio.module.css';
import { StudioSourceVideo, type StudioView } from './StudioSource';

/** Hide the pointer after this long without movement in presentation mode. */
const CURSOR_IDLE_MS = 2000;

function pictureMessage(problem: PictureProblem, materialId: string) {
  switch (problem) {
    case 'no-webgl':
      return (
        <>
          This browser can’t draw the wake here: graphics acceleration may be turned off. The{' '}
          <a href={href('/diagnostics')}>Diagnostics</a> page can tell you more.
        </>
      );
    case 'material-missing':
      return (
        <>
          The visual material “{materialId}” isn’t part of this version of the instrument. Choose
          another visual material.
        </>
      );
    case 'material-failed':
      return (
        <>
          This visual material couldn’t start on this computer. Try another one, or reload the page.
        </>
      );
    case 'context-lost':
      return <>The graphics card was reset. The wake will come back in a moment.</>;
  }
}

/** How the clip layer should look for this composition and opacity. */
function clipView(composition: Composition, opacity: number): ClipLayerView {
  const { materialId, properties } = composition.visual;
  return {
    opacity,
    timeline: composition.timeline,
    range: projectionRange(properties, getVisualMaterial(materialId)?.meta),
  };
}

/**
 * The wake. The canvas (made by the preview runtime) keeps the composition's render aspect,
 * letterboxed in true black. On the very first Studio visit the stage first measures this
 * computer for "Automatic" preview quality. While the Clip slider is up, the clip lies over
 * the canvas (SPEC 6.3 "Clip layer"); at 0 there is no clip here at all.
 */
export function StudioStage({
  ref,
  view,
  onViewChange,
  clipAvailable,
  sourceBlob,
}: {
  ref?: Ref<HTMLDivElement>;
  view: StudioView;
  onViewChange: (view: StudioView) => void;
  clipAvailable: boolean;
  sourceBlob: Blob | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<StudioRuntime | null>(null);
  const clipLayerRef = useRef<ClipLayer | null>(null);
  const session = useStudioStore((s) => s.session);
  const quality = useStudioStore((s) => s.quality);
  const composition = useStudioStore((s) => s.composition);
  const picture = useStudioStore((s) => s.picture);
  const presentation = useStudioStore((s) => s.presentation);
  const playing = useStudioStore((s) => s.transport.playing);
  const position = useStudioStore((s) => s.transport.position);
  const clipShown = useStudioStore((s) => s.clipOpacity > 0) && view === 'result';
  const clipOpacity = useStudioStore((s) => s.clipOpacity);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [hasShownLiveFrame, setHasShownLiveFrame] = useState(false);
  const measuring = quality === null;

  useEffect(() => setHasShownLiveFrame(false), [session]);
  useEffect(() => {
    if (playing || position > 0) setHasShownLiveFrame(true);
  }, [playing, position]);

  // First visit: measure this computer, then remember the tier (SPEC 14.2).
  useEffect(() => {
    if (!measuring) return;
    const host = hostRef.current;
    const c = useStudioStore.getState().composition;
    if (!host || !c) return;
    const abort = new AbortController();
    measureThisComputer(host, c.render.width / c.render.height, abort.signal)
      .then((tier) => {
        if (!abort.signal.aborted) useStudioStore.getState().setQuality(tier);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        console.warn('Measuring this computer failed; using Standard for now.', error);
        useStudioStore.getState().setQuality(FALLBACK_QUALITY);
      });
    return () => abort.abort();
  }, [measuring, session]);

  // One preview runtime per open composition (StrictMode-safe: disposed on unmount).
  useEffect(() => {
    if (measuring) return;
    const host = hostRef.current;
    const state = useStudioStore.getState();
    if (!host || !state.signature || !state.composition || !state.quality) return;
    const runtime = new StudioRuntime({
      host,
      signature: state.signature,
      composition: state.composition,
      quality: state.quality,
      loop: state.loop,
      events: state.runtimeEvents,
    });
    runtimeRef.current = runtime;
    const controller: TransportController = {
      play: () => runtime.play(),
      pause: () => runtime.pause(),
      togglePlay: () => runtime.togglePlay(),
      seek: (t) => runtime.seek(t),
      scrub: (t, phase) => runtime.scrub(t, phase),
      setLoop: (loop) => runtime.setLoop(loop),
      renderStill: (options) => runtime.renderStill(options),
    };
    state.attachController(controller);
    return () => {
      useStudioStore.getState().detachController(controller);
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, [measuring, session]);

  useEffect(() => {
    if (quality) runtimeRef.current?.setQuality(quality);
  }, [quality]);

  // The very first visit, once this computer has been measured: a tip to press Play (the
  // stage is dark until then). Like the introduction, it stays out of automated browsers
  // unless asked for with `?studiotip=1`.
  useEffect(() => {
    if (measuring || !overlayAllowed('studiotip')) return;
    void useStudioStore.getState().showFirstVisitTip();
  }, [measuring, session]);

  useEffect(() => {
    if (composition) runtimeRef.current?.setComposition(composition);
  }, [composition]);

  // The clip layer exists only while the Clip slider is up (after the runtime, which it
  // follows, has been made above).
  useEffect(() => {
    if (measuring || !clipShown) return;
    const host = hostRef.current;
    const runtime = runtimeRef.current;
    const state = useStudioStore.getState();
    const file = state.signature ? clipForVisit(state.signature.contentHash) : null;
    if (!host || !runtime || !state.signature || !state.composition || !file) return;
    const layer = new ClipLayer({
      host,
      file,
      signature: state.signature,
      ...clipView(state.composition, state.clipOpacity),
      onProblem: () => useStudioStore.getState().clipFailedToPlay(),
    });
    clipLayerRef.current = layer;
    runtime.setOverlay(layer);
    return () => {
      runtime.setOverlay(null);
      layer.dispose();
      clipLayerRef.current = null;
    };
  }, [measuring, session, clipShown, view]);

  useEffect(() => {
    if (composition) clipLayerRef.current?.update(clipView(composition, clipOpacity));
  }, [composition, clipOpacity]);

  // Presentation mode: the pointer (and, on touch screens, the Close button) fades away
  // when it rests; a touch brings the button back.
  useEffect(() => {
    if (!presentation) {
      setCursorHidden(false);
      return;
    }
    let timer = window.setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
    const onMove = () => {
      setCursorHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    };
  }, [presentation]);

  const store = useStudioStore.getState;
  const selectedVisualName = visualMetas().find(
    (material) => material.id === composition?.visual.materialId,
  )?.name;
  const selectedSoundName = soundMetas().find(
    (material) => material.id === composition?.sound.materialId,
  )?.name;
  const visualName = selectedVisualName ?? 'Visual';
  const soundName = selectedSoundName ?? 'Sound';
  const pausedArtworkLabel =
    selectedVisualName && selectedSoundName
      ? `${selectedVisualName} visual · ${selectedSoundName} sound`
      : 'Composition preview';
  const classes = [styles.stage, cursorHidden ? styles.cursorHidden : ''].filter(Boolean).join(' ');
  // On phones the stage takes the composition's shape (Studio.module.css).
  const aspect = composition
    ? ({
        '--stage-aspect': `${composition.render.width} / ${composition.render.height}`,
      } as CSSProperties)
    : undefined;
  return (
    <div ref={ref} className={classes} style={aspect} data-view={view}>
      {presentation ? null : (
        <div className={styles.stageHeader}>
          <div>
            <span className={styles.eyebrow}>Composition preview</span>
            <strong>{visualName} and {soundName}</strong>
            <small>{composition?.name}</small>
          </div>
          <div className={styles.viewToolbar} role="group" aria-label="Preview view">
            <button
              type="button"
              onClick={() => onViewChange('source')}
              disabled={!clipAvailable}
              aria-pressed={view === 'source'}
              title={
                clipAvailable
                  ? 'Show the original recorded clip'
                  : 'Source video is unavailable for this composition'
              }
            >
              Source
            </button>
            <button
              type="button"
              onClick={() => onViewChange('result')}
              aria-pressed={view === 'result'}
            >
              Result
            </button>
            <button
              type="button"
              onClick={() => onViewChange('split')}
              disabled={!clipAvailable}
              aria-pressed={view === 'split'}
              title={
                clipAvailable
                  ? 'Compare the source movement and generated wake'
                  : 'Split View needs a source video'
              }
            >
              Split View
            </button>
          </div>
        </div>
      )}
      <div className={styles.stagePanes}>
        <div className={styles.resultPane}>
          {view === 'split' ? <span className={styles.paneLabel}>Generated result</span> : null}
          <div ref={hostRef} className={styles.canvasHost} />
          {!playing && !presentation && !hasShownLiveFrame ? (
            <div className={styles.pausedArtwork} aria-hidden="true">
              <svg viewBox="0 0 800 510" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <filter id="studio-soft-glow">
                    <feGaussianBlur stdDeviation="12" />
                  </filter>
                  <linearGradient id="studio-water" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#b9f1f6" />
                    <stop offset=".55" stopColor="#55c7df" />
                    <stop offset="1" stopColor="#247f9c" />
                  </linearGradient>
                  <linearGradient id="studio-honey" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#8a5314" />
                    <stop offset=".58" stopColor="#f2b33d" />
                    <stop offset="1" stopColor="#ffe39a" />
                  </linearGradient>
                </defs>
                <g className={styles.artGlow} filter="url(#studio-soft-glow)">
                  <path d="M-55 424C86 203 251 405 370 240S626 152 855-32" />
                  <path d="M-38 496C120 283 274 471 420 302S677 247 844 112" />
                </g>
                <g className={styles.artWater}>
                  <path d="M-55 424C86 203 251 405 370 240S626 152 855-32" />
                  <path d="M-38 496C120 283 274 471 420 302S677 247 844 112" />
                  <path d="M36 542c106-178 202-83 314-199s260-31 438-221" />
                </g>
                <g className={styles.artHoney}>
                  <path d="M7 470c160-8 174-138 278-149s117 62 212 2 106-173 294-181" />
                  <path d="M-2 501c177 5 190-88 293-101s127 55 232-17 120-141 272-149" />
                </g>
                <g className={styles.artParticles}>
                  {Array.from({ length: 24 }, (_, index) => (
                    <circle
                      key={index}
                      cx={64 + ((index * 137) % 686)}
                      cy={54 + ((index * 89) % 382)}
                      r={index % 4 === 0 ? 4 : 2}
                    />
                  ))}
                </g>
              </svg>
              <span className={styles.artLabel}>{pausedArtworkLabel}</span>
            </div>
          ) : null}
        </div>
        {clipAvailable && view !== 'result' ? (
          <div className={styles.sourcePane}>
            {view === 'split' ? <span className={styles.paneLabel}>Original movement</span> : null}
            <StudioSourceVideo sourceBlob={sourceBlob} />
          </div>
        ) : null}
      </div>
      {!playing && !presentation && !hasShownLiveFrame && !measuring && !picture ? (
        <div className={styles.pausedMessage}>
          <span className={styles.pausedPlay}>
            <svg viewBox="0 0 20 20" width="18" height="18">
              <path d="M6 4l10 6-10 6z" fill="currentColor" />
            </svg>
          </span>
          <span>
            <strong>Press Play</strong>
            <small>Preview the composition and hear its response.</small>
          </span>
        </div>
      ) : null}
      {presentation ? (
        <button
          type="button"
          className={styles.leave}
          onClick={() => store().setPresentation(false)}
        >
          <CloseIcon />
          Close
        </button>
      ) : (
        <>
          {measuring ? (
            <p className={styles.measuring} role="status">
              Getting to know this computer…
            </p>
          ) : null}
          {picture && composition ? (
            <p className={styles.pictureProblem} role="status">
              {pictureMessage(picture, composition.visual.materialId)}
            </p>
          ) : null}
          {composition?.mute.visual ? <p className={styles.mutedLabel}>Visual muted</p> : null}
        </>
      )}
    </div>
  );
}
