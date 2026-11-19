import { useEffect, useMemo, useState } from 'react';
import { navigate, matchPath } from '../../app/router';
import {
  forgetStudioPath,
  readRememberedStudioPath,
} from '../../app/studioEntry';
import { userMessage } from '../../library';
import { useLibraryStore } from '../../state/libraryStore';
import { Button } from '../../ui/Button';
import { FileButton } from '../../ui/FileButton';
import { Notice } from '../../ui/Notice';
import { formatChanged } from '../Library/format';
import { compositionName, signatureName } from '../Library/importSummary';
import styles from './StudioLandingScreen.module.css';

const IMPORT_ACCEPT = '.json,application/json';

interface ResumeTarget {
  path: string;
  name: string;
  detail: string;
}

/** Studio's explicit entry point: resume a valid target or choose existing/new work. */
export function StudioLandingScreen() {
  const status = useLibraryStore((state) => state.status);
  const error = useLibraryStore((state) => state.error);
  const compositions = useLibraryStore((state) => state.compositions);
  const signatures = useLibraryStore((state) => state.signatures);
  const refresh = useLibraryStore((state) => state.refresh);
  const store = useLibraryStore.getState;
  const [remembered, setRemembered] = useState(() => readRememberedStudioPath());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void refresh().finally(() => {
      if (active) setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const resume = useMemo<ResumeTarget | null>(() => {
    if (!checked || !remembered || status !== 'ready') return null;
    const newTarget = matchPath('/studio/new/:signatureId', remembered);
    if (newTarget) {
      const signature = signatures.find((entry) => entry.id === newTarget.signatureId);
      return signature
        ? {
            path: remembered,
            name: `Unsaved ${signatureName(signature.name)} composition`,
            detail: 'Restores the changes kept when you last left Studio.',
          }
        : null;
    }
    const savedTarget = matchPath('/studio/:compositionId', remembered);
    if (!savedTarget) return null;
    const entry = compositions.find(
      ({ composition }) => composition.id === savedTarget.compositionId,
    );
    return entry?.signatureAvailable
      ? {
          path: remembered,
          name: compositionName(entry.composition.name),
          detail: `Changed ${formatChanged(entry.composition.updatedAt)}`,
        }
      : null;
  }, [checked, compositions, remembered, signatures, status]);

  useEffect(() => {
    if (!checked || status !== 'ready' || !remembered || resume) return;
    forgetStudioPath();
    setRemembered(null);
    setMessage('The previously opened composition is no longer available. Choose another below.');
  }, [checked, remembered, resume, status]);

  const openSampleComposition = async () => {
    setBusy('Adding sample…');
    setMessage(null);
    try {
      const result = await store().addSampleWink();
      navigate(`/studio/new/${encodeURIComponent(result.meta.id)}`);
    } catch (caught) {
      setMessage(userMessage(caught));
      setBusy(null);
    }
  };

  const importFiles = async (files: File[]) => {
    setBusy('Importing…');
    setMessage(null);
    const outcomes = await store().importFiles(files);
    const failures = outcomes.filter((outcome) => !outcome.ok);
    const composition = outcomes.find(
      (outcome) =>
        outcome.ok &&
        outcome.result.kind === 'composition' &&
        !outcome.result.missingSignature,
    );
    const signature = outcomes.find(
      (outcome) => outcome.ok && outcome.result.kind === 'signature',
    );
    if (composition?.ok && composition.result.kind === 'composition') {
      navigate(`/studio/${encodeURIComponent(composition.result.composition.id)}`);
      return;
    }
    if (signature?.ok && signature.result.kind === 'signature') {
      navigate(`/studio/new/${encodeURIComponent(signature.result.meta.id)}`);
      return;
    }
    setMessage(
      failures.length > 0
        ? failures.map((outcome) => `${outcome.fileName}: ${outcome.message}`).join(' ')
        : 'The file was added to the Library, but it cannot open directly in Studio.',
    );
    setBusy(null);
  };

  const ready = checked && status === 'ready';

  return (
    <section className={styles.page} aria-labelledby="studio-entry-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Composition workspace</span>
          <h1 id="studio-entry-title">Studio</h1>
          <p>Resume a composition or choose what you want to work on.</p>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => navigate('/prepare')} disabled={!ready || !!busy}>
            New Composition
          </Button>
          <Button onClick={() => void openSampleComposition()} disabled={!ready || !!busy}>
            Use Sample
          </Button>
          <FileButton
            accept={IMPORT_ACCEPT}
            multiple
            onFiles={(files) => void importFiles(files)}
            disabled={!ready || !!busy}
          >
            Import File
          </FileButton>
        </div>
      </header>

      {busy ? (
        <p className={styles.loading} role="status">
          {busy}
        </p>
      ) : null}
      {message ? <Notice tone="info">{message}</Notice> : null}
      {!checked || status === 'idle' || status === 'loading' ? (
        <div className={styles.loadingPanel} role="status">
          <span />
          <div>
            <strong>Opening Studio…</strong>
            <p>Reading compositions from this browser.</p>
          </div>
        </div>
      ) : null}
      {status === 'error' ? (
        <Notice tone="error" actions={<Button onClick={() => void refresh()}>Try again</Button>}>
          {error}
        </Notice>
      ) : null}

      {ready && resume ? (
        <section className={styles.resume} aria-labelledby="resume-title">
          <div>
            <span className={styles.eyebrow}>Continue working</span>
            <h2 id="resume-title">{resume.name}</h2>
            <p>{resume.detail}</p>
          </div>
          <Button variant="primary" onClick={() => navigate(resume.path)}>
            Resume
          </Button>
        </section>
      ) : null}

      {ready ? (
        <section className={styles.section} aria-labelledby="compositions-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>Saved work</span>
              <h2 id="compositions-title">Compositions</h2>
            </div>
            <span>{compositions.length}</span>
          </div>
          {compositions.length === 0 ? (
            <div className={styles.empty}>
              <strong>No compositions yet</strong>
              <p>
                Start with a new clip, use the sample, import a file, or choose an existing
                signature below.
              </p>
            </div>
          ) : (
            <ul className={styles.compositionList}>
              {compositions.map(({ composition, signatureAvailable }) => (
                <li key={composition.id}>
                  <div className={styles.thumbnail}>
                    {composition.thumbnail ? <img src={composition.thumbnail} alt="" /> : <i />}
                  </div>
                  <div className={styles.itemCopy}>
                    <strong>{compositionName(composition.name)}</strong>
                    <span>
                      From “{signatureName(composition.signature.name)}” · Changed{' '}
                      {formatChanged(composition.updatedAt)}
                    </span>
                    {!signatureAvailable ? <small>Its signature is missing.</small> : null}
                  </div>
                  <Button
                    disabled={!signatureAvailable}
                    onClick={() => navigate(`/studio/${encodeURIComponent(composition.id)}`)}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {ready && signatures.length > 0 ? (
        <section className={styles.section} aria-labelledby="signatures-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>Start from movement</span>
              <h2 id="signatures-title">Signatures</h2>
            </div>
            <span>{signatures.length}</span>
          </div>
          <ul className={styles.signatureList}>
            {signatures.map((signature) => (
              <li key={signature.id}>
                <span>{signatureName(signature.name)}</span>
                <Button
                  variant="quiet"
                  onClick={() => navigate(`/studio/new/${encodeURIComponent(signature.id)}`)}
                >
                  Start composition
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
