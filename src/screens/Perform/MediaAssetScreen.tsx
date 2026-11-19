import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { downloadBlob, getMediaAsset, type StoredMediaAsset } from '../../library';
import { Button } from '../../ui/Button';
import styles from './SessionReviewScreen.module.css';

export function MediaAssetScreen({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<StoredMediaAsset | null | undefined>(undefined);
  useEffect(() => { void getMediaAsset(assetId).then((value) => setAsset(value ?? null)); }, [assetId]);
  const url = useMemo(() => (asset ? URL.createObjectURL(asset.blob) : null), [asset]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <section className={styles.page}>
    <header><span>Library recording</span><h1>{asset?.kind === 'source-video' ? 'Original camera reference' : 'Generated performance'}</h1></header>
    {asset === undefined ? <p>Loading recording…</p> : asset === null ? <p>This recording is not available in browser storage.</p> : <div className={styles.preview}><video src={url ?? undefined} controls autoPlay playsInline /></div>}
    <div className={styles.actions}>{asset ? <Button onClick={() => downloadBlob(asset.blob, asset.fileName)}>Download video</Button> : null}<Button variant="primary" onClick={() => navigate('/')}>Back to Library</Button></div>
  </section>;
}
