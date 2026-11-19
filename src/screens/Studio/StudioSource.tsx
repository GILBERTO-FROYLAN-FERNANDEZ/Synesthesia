import { useEffect, useRef, useState } from 'react';
import { getMediaAsset } from '../../library';
import { samplerConfigFor } from '../../render/timeline';
import { ClipView } from '../Prepare/ClipView';
import { useObjectUrl } from '../Prepare/useObjectUrl';
import { resolveSamplerConfig } from '../../signature/sampler';
import { DEFAULT_SAMPLER_CONFIG, type KineticSignature } from '../../signature/types';
import { clipForVisit } from '../../state/visitClips';
import { useStudioStore } from '../../state/studioStore';
import { clipTimeAt, planClipFollow, signatureMomentAt } from '../../studio/clipLayerMath';
import styles from './Studio.module.css';

export type StudioView = 'source' | 'result' | 'split';

export function hasVisitClip(signature: KineticSignature | null): boolean {
  return signature !== null && clipForVisit(signature.contentHash) !== null;
}

/** A source video is optional for live performances and stays separate from the signature. */
export function useStoredSourceBlob(assetId: string | undefined): Blob | null {
  const [source, setSource] = useState<{ id: string; blob: Blob } | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let active = true;
    void getMediaAsset(assetId)
      .then((asset) => {
        if (active) setSource(asset?.kind === 'source-video' ? { id: assetId, blob: asset.blob } : null);
      })
      .catch(() => { if (active) setSource(null); });
    return () => { active = false; };
  }, [assetId]);
  return source && source.id === assetId ? source.blob : null;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

function percent(value: number | undefined): string {
  return `${Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100)}%`;
}

/** The real visit-only clip, following the Studio transport and movement timeline. */
export function StudioSourceVideo({ compact = false, sourceBlob = null }: { compact?: boolean; sourceBlob?: Blob | null }) {
  const signature = useStudioStore((s) => s.signature);
  const composition = useStudioStore((s) => s.composition);
  const transport = useStudioStore((s) => s.transport);
  const visitClip = signature ? clipForVisit(signature.contentHash) : null;
  const file = visitClip ?? sourceBlob;
  const url = useObjectUrl(file);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signature || !composition) return;
    const signatureDuration =
      signature.frameRate > 0 ? signature.frameCount / signature.frameRate : 0;
    const config = resolveSamplerConfig(
      DEFAULT_SAMPLER_CONFIG,
      samplerConfigFor(composition.timeline),
    );
    const moment = signatureMomentAt(transport.position, config, signatureDuration);
    const target = clipTimeAt(
      moment.s,
      signature.source.trim,
      signature.frameRate,
      signature.source.nativeFps,
    );
    const plan = planClipFollow({
      target,
      currentTime: video.currentTime,
      ended: video.ended,
      playing: transport.playing,
      direction: moment.direction,
      speed: config.speed,
      nativeFps: signature.source.nativeFps,
    });
    if (Math.abs(video.playbackRate - plan.rate) > 0.005) video.playbackRate = plan.rate;
    if (plan.seekTo !== null && !video.seeking) video.currentTime = plan.seekTo;
    if (plan.run) {
      if (video.paused) void video.play().catch(() => undefined);
    } else if (!video.paused) {
      video.pause();
    }
  }, [composition, signature, transport]);

  if (!file || !url || !signature) return null;
  return (
    <div className={compact ? styles.sourceVideoCompact : styles.sourceVideo}>
      <ClipView
        url={url}
        clip={{ width: signature.source.width, height: signature.source.height }}
        orientation={{ rotate: signature.source.rotate, mirror: signature.source.mirror }}
        focusArea={signature.source.focusArea}
        videoRef={(video) => {
          videoRef.current = video;
        }}
        onVideoError={() => useStudioStore.getState().clipFailedToPlay()}
      />
      <span className={styles.sourceVideoLabel}>{visitClip ? 'Original clip · this visit only' : 'Saved camera reference'}</span>
    </div>
  );
}

export function MovementSourcePanel({
  collapsed,
  onCollapse,
  sourceBlob = null,
}: {
  collapsed: boolean;
  onCollapse: () => void;
  sourceBlob?: Blob | null;
}) {
  const signature = useStudioStore((s) => s.signature);
  const playing = useStudioStore((s) => s.transport.playing);
  const visitClip = hasVisitClip(signature);
  const clipAvailable = visitClip || sourceBlob !== null;
  if (!signature) return null;

  const duration = signature.frameRate > 0 ? signature.frameCount / signature.frameRate : 0;
  const stats = signature.stats;
  if (collapsed) {
    return (
      <aside className={`${styles.sourcePanel} ${styles.sourcePanelCollapsed}`}>
        <button
          type="button"
          className={styles.expandSource}
          onClick={onCollapse}
          aria-label="Expand Movement Source"
          title="Expand Movement Source"
        >
          <span aria-hidden="true">›</span>
          <span>Movement Source</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.sourcePanel} aria-label="Movement Source">
      <div className={styles.sourcePanelHead}>
        <div>
          <span className={styles.eyebrow}>1 movement source</span>
          <h2>Movement Source</h2>
        </div>
        <button
          type="button"
          className={styles.collapseSource}
          onClick={onCollapse}
          aria-label="Collapse Movement Source"
          title="Collapse Movement Source"
        >
          ‹
        </button>
      </div>

      <div className={styles.sourceArtworkCard}>
        {clipAvailable ? (
          <>
            <StudioSourceVideo compact sourceBlob={sourceBlob} />
            <span className={styles.sourceArtworkLabel}>{visitClip ? 'Original clip · this visit only' : 'Saved camera reference'}</span>
          </>
        ) : (
          <div className={styles.diagnosticPreview}>
            <div className={styles.diagnosticGrid} />
            <svg viewBox="0 0 220 160" aria-hidden="true">
              <g className={styles.diagnosticMotion}>
                <path d="M14 55C50 20 107 18 172 45s62 65 13 75-118-1-170 26" />
                <path d="M22 78c49-31 91-31 137-9s48 56 8 67" />
              </g>
              <g className={styles.diagnosticFigure}>
                <circle cx="111" cy="31" r="13" />
                <path d="M111 47c-16 2-24 14-28 33l-10 38m39-71c17 3 25 14 29 33l12 35M94 67l-4 48-14 39m49-87 3 49 18 37M90 102c14 8 26 8 39 0" />
                <circle cx="83" cy="80" r="3" />
                <circle cx="141" cy="80" r="3" />
                <circle cx="90" cy="115" r="3" />
                <circle cx="128" cy="116" r="3" />
              </g>
            </svg>
            <span className={styles.sourceArtworkLabel}>Diagnostic artwork · movement analysis</span>
          </div>
        )}
      </div>

      <div className={styles.selectedSource} aria-label={`Selected signature: ${signature.name}`}>
        <span className={styles.sourceIndex}>1</span>
        <div>
          <strong>{signature.name}</strong>
          <span>Recorded signature · {formatDuration(duration)}</span>
        </div>
        <span className={styles.selectedCheck}>Selected</span>
      </div>

      <button
        type="button"
        className={styles.playSource}
        onClick={() => useStudioStore.getState().togglePlay()}
      >
        <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
        {playing ? 'Pause selected source' : 'Play selected source'}
      </button>

      <div className={styles.sourceConceptActions}>
        <button type="button" disabled title="Multi-source editing is coming later">
          Add source <small>Later</small>
        </button>
        <button type="button" disabled title="Trimming is not available in the Studio">
          Trim <small>Later</small>
        </button>
      </div>

      <div className={styles.featureSummary} aria-label="Kinetic feature summary">
        <div>
          <span>Energy</span>
          <strong>{(stats.energy?.p95 ?? 0).toFixed(2)}</strong>
        </div>
        <div>
          <span>Continuity</span>
          <strong>{percent(stats.continuity?.mean)}</strong>
        </div>
        <div>
          <span>Density</span>
          <strong>{percent(stats.density?.mean)}</strong>
        </div>
      </div>

      <div className={styles.sourcePrivacy}>
        {visitClip ? (
          <>The original video is visit-only and never included in a render.</>
        ) : sourceBlob ? (
          <>The camera reference was saved with this performance. Studio renders from its movement signature.</>
        ) : (
          <>
            <strong>No source video is stored.</strong> The card above is diagnostic artwork made
            from movement data.
          </>
        )}
      </div>
    </aside>
  );
}
