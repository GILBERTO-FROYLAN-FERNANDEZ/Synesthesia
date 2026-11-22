import { navigate } from '../../app/router';
import { usePrepareStore } from '../../state/prepareStore';
import { Button } from '../../ui/Button';
import { FileButton } from '../../ui/FileButton';
import { GuideLink } from '../../ui/GuideLink';
import { Notice } from '../../ui/Notice';
import { CLIP_ACCEPT } from './PreparePanel';
import styles from './DropZone.module.css';

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  dragging: boolean;
  opening: boolean;
  onUseWebcam: () => void;
}

function SourceIcon({ kind }: { kind: 'upload' | 'record' | 'live' }) {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
      {kind === 'upload' ? (
        <path d="M16 21V5m0 0-6 6m6-6 6 6M6 20v6h20v-6" />
      ) : kind === 'record' ? (
        <>
          <rect x="4" y="8" width="18" height="16" rx="3" />
          <path d="m22 13 6-4v14l-6-4" />
        </>
      ) : (
        <>
          <circle cx="16" cy="5.5" r="2" />
          <path d="m16 9-3 6 4 4m-4-4-6 2m6-2 7-3 5 4m-8 3-4 8m4-8 8 8" />
        </>
      )}
    </svg>
  );
}

export function DropZone({ onFiles, dragging, opening, onUseWebcam }: DropZoneProps) {
  const notice = usePrepareStore((s) => s.notice);
  const setNotice = usePrepareStore((s) => s.setNotice);
  return (
    <div className={styles.chooser}>
      <svg
        className={styles.ambient}
        viewBox="0 0 1440 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="prepare-ribbon" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#07314e" stopOpacity="0" />
            <stop offset=".43" stopColor="#126591" stopOpacity=".6" />
            <stop offset=".78" stopColor="#54c9de" stopOpacity=".85" />
            <stop offset="1" stopColor="#0b4060" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="prepare-ribbon-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#22557d" stopOpacity="0" />
            <stop offset=".55" stopColor="#477ddd" stopOpacity=".7" />
            <stop offset=".85" stopColor="#76e4ee" stopOpacity=".9" />
            <stop offset="1" stopColor="#32718e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M480 222C675 320 816 138 1012 103c196-34 229 146 430 62"
          stroke="url(#prepare-ribbon)"
          strokeWidth="115"
          fill="none"
          opacity=".28"
        />
        <path
          d="M510 242C718 296 834 118 1019 109c180-9 238 118 431 51"
          stroke="url(#prepare-ribbon-edge)"
          strokeWidth="2"
          fill="none"
          opacity=".65"
        />
        <path
          d="M-68 716C172 640 304 842 535 736c191-87 296 24 462-28"
          stroke="url(#prepare-ribbon)"
          strokeWidth="74"
          fill="none"
          opacity=".25"
        />
        <path
          d="M-66 700C170 635 305 810 539 722c178-68 315 24 479-21"
          stroke="url(#prepare-ribbon-edge)"
          strokeWidth="2"
          fill="none"
          opacity=".5"
        />
      </svg>
      <div className={styles.content}>
        <div className={styles.topline}>
          <h1 id="prepare-title" className={styles.sectionTitle}>
            Prepare
          </h1>
          <GuideLink section="prepare" />
        </div>
        <div className={styles.intro}>
          <span className={styles.step}>Movement source</span>
          <h2 className={styles.lead}>
            Choose a <span>movement source</span>
          </h2>
          <p>Bring your movement into sound and visuals.</p>
        </div>
        <div className={styles.sources}>
          <section
            className={`${styles.source} ${styles.upload} ${dragging ? styles.dragging : ''}`}
          >
            <span className={styles.icon}>
              <SourceIcon kind="upload" />
            </span>
            <h3>Upload a video</h3>
            {opening ? (
              <p role="status">Opening the clip…</p>
            ) : (
              <>
                <p>
                  {dragging
                    ? 'Drop the clip here'
                    : 'Use a video you already have. Drop a clip here or choose a file.'}
                </p>
                <FileButton
                  className={styles.cardButton}
                  variant="primary"
                  accept={CLIP_ACCEPT}
                  onFiles={onFiles}
                >
                  Choose a clip…
                </FileButton>
              </>
            )}
          </section>
          <section className={`${styles.source} ${styles.record}`}>
            <span className={styles.icon}>
              <SourceIcon kind="record" />
            </span>
            <h3>Record a video</h3>
            <p>Record with your webcam, then preview and trim the clip.</p>
            <Button className={styles.cardButton} disabled={opening} onClick={onUseWebcam}>
              Use Webcam
            </Button>
          </section>
          <section className={`${styles.source} ${styles.live}`}>
            <span className={styles.icon}>
              <SourceIcon kind="live" />
            </span>
            <h3>Live motion</h3>
            <p>Move in front of the camera and see the response in real time.</p>
            <Button
              className={styles.cardButton}
              disabled={opening}
              onClick={() => navigate('/perform')}
            >
              Start Live Motion
            </Button>
          </section>
        </div>
        <div className={styles.bottomline}>
          Video clips: MP4, MOV or WebM · up to one minute of movement
        </div>
        {notice ? (
          <div className={styles.notice} role="status" aria-live="polite">
            <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
              {notice.message}
            </Notice>
          </div>
        ) : null}
      </div>
    </div>
  );
}
