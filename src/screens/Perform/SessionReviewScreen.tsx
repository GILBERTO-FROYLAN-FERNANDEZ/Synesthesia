import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { createComposition } from '../../engine/compositionFactory';
import { DEFAULT_RENDER_SETTINGS, type Composition } from '../../engine/composition';
import {
  downloadBlob,
  deleteMediaAssetIfUnreferenced,
  getComposition,
  getSignature,
  saveComposition,
  saveMediaAsset,
  saveSignature,
} from '../../library';
import { getSoundMaterial, getVisualMaterial } from '../../materials/registry';
import { Button } from '../../ui/Button';
import { newId } from '../../library/util';
import {
  discardCompletedPerformance,
  getCompletedPerformance,
  type CompletedPerformanceSession,
} from './liveSession';
import styles from './SessionReviewScreen.module.css';

function RecordingPreview({ part, label }: { part: NonNullable<CompletedPerformanceSession['generated']>; label: string }) {
  const url = useMemo(() => URL.createObjectURL(part.blob), [part.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <div className={styles.preview}><h3>{label}</h3><video src={url} controls playsInline /></div>;
}

export function SessionReviewScreen() {
  const session = getCompletedPerformance();
  const [name, setName] = useState(session?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(session?.recordingError ?? null);
  const [savedCompositionId, setSavedCompositionId] = useState<string | null>(null);

  if (!session) {
    return <section className={styles.page}><h1>No session to review</h1><p>Finish a live performance before opening Session Review.</p><Button variant="primary" onClick={() => navigate('/perform')}>Camera Setup</Button></section>;
  }

  const save = async () => {
    setBusy(true);
    setMessage(null);
    let generatedId: string | undefined;
    let sourceId: string | undefined;
    let mediaWarning: string | null = null;
    try {
      await saveSignature(session.signature, { thumbnail: session.thumbnail });
      const persist = async (
        part: CompletedPerformanceSession['generated'],
        kind: 'generated-video' | 'source-video',
      ) => {
        if (!part) return undefined;
        const id = newId();
        const extension = part.mimeType.includes('mp4') ? 'mp4' : 'webm';
        await saveMediaAsset({
          id,
          kind,
          blob: part.blob,
          mimeType: part.mimeType,
          createdAt: new Date().toISOString(),
          duration: session.duration,
          fileName: `${name || session.name}-${kind}.${extension}`,
        });
        return id;
      };
      try {
        generatedId = await persist(session.generated, 'generated-video');
        sourceId = await persist(session.source, 'source-video');
      } catch (caught) {
        console.warn('Performance media could not be persisted:', caught);
        mediaWarning =
          'The editable movement and composition were saved, but browser storage could not keep one or more videos. Download them from this review before leaving.';
      }
      const visual = getVisualMaterial(session.settings.visualId);
      const sound = getSoundMaterial(session.settings.soundId);
      if (!visual || !sound) throw new Error('The selected materials are no longer installed.');
      const now = new Date().toISOString();
      const base = createComposition({
        id: newId(),
        now,
        name: name.trim() || session.name,
        signature: session.signature,
        seed: Math.floor(Math.random() * 1_000_000),
        visual: visual.meta,
        sound: sound.meta,
        render: DEFAULT_RENDER_SETTINGS,
      });
      const composition: Composition = {
        ...base,
        linked: false,
        visual: { ...base.visual, mapping: session.settings.visualMapping, properties: { ...session.settings.visualProperties } },
        sound: { ...base.sound, properties: { ...session.settings.soundProperties } },
        thumbnail: session.thumbnail,
        timeline: { ...base.timeline, signatureStrength: session.settings.intensity },
        mute: { ...base.mute, sound: session.settings.muted },
        performance: {
          origin: 'performance',
          sourceType: 'liveCamera',
          sessionId: session.id,
          motionSignatureId: session.signature.id,
          generatedVideoAssetId: generatedId,
          sourceVideoAssetId: sourceId,
          mappingSettings: {
            intensity: session.settings.intensity,
            volume: session.settings.volume,
            muted: session.settings.muted,
            sensitivity: session.settings.sensitivity,
            bodyTrackingEnabled: session.settings.bodyTrackingEnabled,
          },
          timestampedSettingChanges: session.settingChanges,
          duration: session.duration,
          recordedAt: session.recordedAt,
          recordingStatus:
            generatedId && sourceId
              ? 'generated-and-source'
              : generatedId
                ? 'generated-only'
                : session.generated
                  ? 'partial'
                  : 'not-recorded',
        },
      };
      const saved = await saveComposition(composition);
      const [verifiedComposition, verifiedSignature] = await Promise.all([
        getComposition(saved.id),
        getSignature(session.signature.id),
      ]);
      if (!verifiedComposition || !verifiedSignature) {
        throw new Error('Persistence verification failed. The session remains available here.');
      }
      setSavedCompositionId(saved.id);
      setMessage(
        mediaWarning ??
          'Saved and verified in the Library. Opening it in Studio will reuse this movement signature.',
      );
      if (mediaWarning) {
        setBusy(false);
      } else {
        window.setTimeout(() => navigate('/'), 900);
      }
    } catch (caught) {
      for (const assetId of [generatedId, sourceId]) {
        if (assetId) await deleteMediaAssetIfUnreferenced(assetId).catch(() => undefined);
      }
      setMessage(caught instanceof Error ? caught.message : 'This session could not be saved.');
      setBusy(false);
    }
  };

  const discard = () => {
    discardCompletedPerformance();
    navigate('/');
  };
  const download = (part: CompletedPerformanceSession['generated'], suffix: string) => {
    if (!part) return;
    const extension = part.mimeType.includes('mp4') ? 'mp4' : 'webm';
    downloadBlob(part.blob, `${name || session.name}-${suffix}.${extension}`);
  };

  return (
    <section className={styles.page}>
      <header><span>Session Review</span><h1>{session.name}</h1><p>{new Date(session.recordedAt).toLocaleString()} · {session.duration.toFixed(1)} seconds</p></header>
      {message ? <p className={styles.notice} role="status">{message}</p> : null}
      <div className={styles.summary}>
        <label>Performance name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={500} /></label>
        <dl>
          <div><dt>Visual</dt><dd>{getVisualMaterial(session.settings.visualId)?.meta.name ?? session.settings.visualId}</dd></div>
          <div><dt>Sound</dt><dd>{getSoundMaterial(session.settings.soundId)?.meta.name ?? session.settings.soundId}</dd></div>
          <div><dt>Tracking</dt><dd>{session.signature.frameCount} real camera-derived frames</dd></div>
          <div><dt>Recording</dt><dd>{session.generated ? 'Generated audiovisual captured' : 'No generated video captured'}</dd></div>
        </dl>
      </div>
      <div className={styles.previews}>
        {session.generated ? <RecordingPreview part={session.generated} label="Generated audiovisual output" /> : <p className={styles.empty}>No generated recording exists. You can still save the genuinely captured motion signature and settings.</p>}
        {session.source ? <RecordingPreview part={session.source} label="Original camera reference" /> : null}
      </div>
      <div className={styles.actions}>
        {session.generated ? <Button onClick={() => download(session.generated, 'generated')}>Download generated video</Button> : null}
        {session.source ? <Button onClick={() => download(session.source, 'camera')}>Download original camera video</Button> : null}
        <Button onClick={discard} disabled={busy}>Discard</Button>
        <Button onClick={() => navigate('/')} disabled={busy}>Back to Library</Button>
        <Button
          variant="primary"
          onClick={() =>
            savedCompositionId
              ? navigate(`/studio/${encodeURIComponent(savedCompositionId)}`)
              : void save()
          }
          disabled={busy}
        >
          {busy
            ? 'Saving and verifying…'
            : savedCompositionId
              ? 'Open saved Composition in Studio'
              : 'Save as Composition'}
        </Button>
      </div>
    </section>
  );
}
