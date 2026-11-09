import { Button } from '../../ui/Button';
import { FileButton } from '../../ui/FileButton';
import styles from './DropZone.module.css';
import { CLIP_ACCEPT } from './PreparePanel';

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  /** A file is being dragged over the window. */
  dragging: boolean;
  opening: boolean;
  onUseWebcam: () => void;
}

/** The starting point for choosing how to bring movement into Prepare. */
export function DropZone({ onFiles, dragging, opening, onUseWebcam }: DropZoneProps) {
  return (
    <div className={styles.chooser}>
      <h2 className={styles.lead}>Choose a movement source</h2>
      <div className={styles.sources}>
        <div className={`${styles.source} ${styles.upload} ${dragging ? styles.dragging : ''}`}>
          <h3>Upload a video</h3>
          {opening ? (
            <p role="status">Opening the clip…</p>
          ) : (
            <>
              <p>{dragging ? 'Drop the clip here' : 'Drop a clip here'}</p>
              <FileButton variant="primary" accept={CLIP_ACCEPT} onFiles={onFiles}>
                Choose a clip…
              </FileButton>
            </>
          )}
        </div>
        <div className={styles.source}>
          <h3>Record a video</h3>
          <p>Record a clip with your webcam, then preview and trim it.</p>
          <Button disabled={opening} onClick={onUseWebcam}>
            Use Webcam
          </Button>
        </div>
        <div className={styles.source}>
          <h3>Live motion</h3>
          <p>Move in front of the camera and see the app respond as you move.</p>
          <span className={styles.availability}>Coming soon</span>
        </div>
      </div>
    </div>
  );
}
