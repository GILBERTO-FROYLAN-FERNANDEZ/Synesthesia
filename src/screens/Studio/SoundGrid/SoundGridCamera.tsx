import { useEffect, useRef, useState, type RefObject } from 'react';
import { noteName, type SoundGridEngine, type SoundGridSnapshot } from '../../../live/soundGrid';
import styles from './SoundGrid.module.css';

export interface SoundGridCameraProps {
  engine: SoundGridEngine;
  /** The screen's own camera preview; its stream is shown again here, larger, under the grid. */
  source: RefObject<HTMLVideoElement | null>;
  /** Show the camera image under the grid (off: just the grid). Default true. */
  showCamera?: boolean;
  /** Show the camera as a mirror (match the engine's `mirror` setting). Default true. */
  mirror?: boolean;
  className?: string;
}

interface Shape {
  cols: number;
  rows: number;
  notes: readonly number[];
}

function sameShape(a: Shape, b: SoundGridSnapshot): boolean {
  return (
    a.cols === b.layout.cols &&
    a.rows === b.layout.rows &&
    a.notes.length === b.notes.length &&
    a.notes.every((n, i) => n === b.notes[i])
  );
}

/**
 * The camera, mirrored like the preview, with the sound grid over it: each zone glows with
 * its movement and flashes when it strikes. Updates the DOM directly from the engine (not
 * through React state) so 30 updates a second don't re-render the screen.
 */
export function SoundGridCamera({
  engine,
  source,
  showCamera = true,
  mirror = true,
  className,
}: SoundGridCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cellsRef = useRef<(HTMLDivElement | null)[]>([]);
  const strikesRef = useRef<Uint32Array>(new Uint32Array(0));
  const [shape, setShape] = useState<Shape>({ cols: 3, rows: 3, notes: [] });
  const [aspect, setAspect] = useState(4 / 3);

  // Mirror the source preview's stream once it has one.
  useEffect(() => {
    const preview = source.current;
    const own = videoRef.current;
    if (!preview || !own || !showCamera) return;
    const attach = () => {
      if (preview.videoWidth && preview.videoHeight)
        setAspect(preview.videoWidth / preview.videoHeight);
      if (preview.srcObject && own.srcObject !== preview.srcObject) {
        own.srcObject = preview.srcObject;
        void own.play().catch(() => undefined);
      }
    };
    attach();
    preview.addEventListener('loadedmetadata', attach);
    preview.addEventListener('playing', attach);
    return () => {
      preview.removeEventListener('loadedmetadata', attach);
      preview.removeEventListener('playing', attach);
      own.srcObject = null;
    };
  }, [source, showCamera]);

  useEffect(() => {
    let frame = 0;
    let latest: SoundGridSnapshot | null = null;
    const draw = () => {
      frame = 0;
      const snap = latest;
      if (!snap) return;
      const cells = cellsRef.current;
      if (strikesRef.current.length !== snap.strikes.length)
        strikesRef.current = new Uint32Array(snap.strikes);
      for (let z = 0; z < snap.level.length; z++) {
        const cell = cells[z];
        if (!cell) continue;
        cell.style.setProperty('--level', (snap.level[z] ?? 0).toFixed(3));
        cell.toggleAttribute('data-active', snap.active[z] === 1);
        if (snap.strikes[z] !== strikesRef.current[z]) {
          strikesRef.current[z] = snap.strikes[z] ?? 0;
          // Two identical animations, alternated, so each strike restarts the flash.
          cell.dataset.flash = cell.dataset.flash === 'a' ? 'b' : 'a';
        }
      }
    };
    const unsubscribe = engine.subscribe((snap) => {
      latest = snap;
      setShape((current) =>
        sameShape(current, snap)
          ? current
          : { cols: snap.layout.cols, rows: snap.layout.rows, notes: [...snap.notes] },
      );
      if (!frame) frame = requestAnimationFrame(draw);
    });
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [engine]);

  return (
    <div className={[styles.camera, className].filter(Boolean).join(' ')}>
      <div className={styles.frame} style={{ aspectRatio: String(aspect) }}>
        {showCamera ? (
          <video
            ref={videoRef}
            className={`${styles.video} ${mirror ? styles.mirrored : ''}`}
            muted
            playsInline
            aria-hidden="true"
          />
        ) : null}
        <div
          className={styles.zones}
          role="img"
          aria-label={`Sound grid, ${shape.cols} by ${shape.rows} zones`}
          style={{
            gridTemplateColumns: `repeat(${shape.cols}, 1fr)`,
            gridTemplateRows: `repeat(${shape.rows}, 1fr)`,
          }}
        >
          {shape.notes.map((note, z) => (
            <div
              key={`${shape.cols}x${shape.rows}-${z}`}
              ref={(el) => {
                cellsRef.current[z] = el;
              }}
              className={styles.zone}
              data-zone={z}
            >
              <span className={styles.note}>{noteName(note)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
