/**
 * Sound grid harness: play the grid with the mouse (or a finger) instead of a camera.
 * The pointer's movement is painted into a synthetic signature field, 30 times a second,
 * exactly as the live tracker would deliver it. Useful when there's no webcam (a remote
 * machine, CI), and for Playwright: `window.spSoundGrid` drives the engine directly.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/app/tokens.css';
import '../../src/app/global.css';
import type { SoundGridEngine } from '../../src/live/soundGrid';
import { SoundGridCamera } from '../../src/screens/Studio/SoundGrid/SoundGridCamera';
import { SoundGridPanel } from '../../src/screens/Studio/SoundGrid/SoundGridPanel';
import { useSoundGrid } from '../../src/screens/Studio/SoundGrid/useSoundGrid';

const COLS = 24;
const ROWS = 18;

/** A field with one moving blob at (x, y) in 0–1 camera coordinates, speed (u, v). */
function blobField(x: number, y: number, u: number, v: number): Float32Array {
  const field = new Float32Array(COLS * ROWS * 2);
  const radius = 0.09;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const dx = (c + 0.5) / COLS - x;
      const dy = (r + 0.5) / ROWS - y;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius));
      const i = (r * COLS + c) * 2;
      field[i] = u * w;
      field[i + 1] = v * w;
    }
  }
  return field;
}

declare global {
  interface Window {
    spSoundGrid: {
      engine: SoundGridEngine;
      /** Send one frame with a blob at (x, y), camera coordinates, moving at (u, v). */
      frame(x: number, y: number, u: number, v: number): void;
    };
  }
}

function Harness() {
  const grid = useSoundGrid();
  const { engine, setShown } = grid;
  const noVideo = useRef<HTMLVideoElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0.5, y: 0.5, u: 0, v: 0, t: 0 });
  const [speed, setSpeed] = useState(0);

  useEffect(() => setShown(true), [setShown]);

  useEffect(() => {
    window.spSoundGrid = {
      engine,
      frame: (x, y, u, v) =>
        engine.update({ cols: COLS, rows: ROWS, field: blobField(x, y, u, v) }),
    };
    const timer = setInterval(() => {
      const p = pointer.current;
      engine.update({ cols: COLS, rows: ROWS, field: blobField(p.x, p.y, p.u, p.v) });
      p.u *= 0.6;
      p.v *= 0.6;
      setSpeed(Math.hypot(p.u, p.v));
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [engine]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = pad.current?.getBoundingClientRect();
    if (!box) return;
    const sx = (e.clientX - box.left) / box.width;
    const sy = (e.clientY - box.top) / box.height;
    // The tracker mirrors the camera, so the field is in screen coordinates already.
    const x = sx;
    const p = pointer.current;
    const t = e.timeStamp / 1000;
    const dt = Math.max(1 / 240, t - p.t);
    if (p.t > 0 && dt < 0.2) {
      const diag = Math.hypot(box.width, box.height);
      p.u = 0.6 * p.u + 0.4 * (((x - p.x) * box.width) / diag / dt);
      p.v = 0.6 * p.v + 0.4 * (((sy - p.y) * box.height) / diag / dt);
    }
    p.x = x;
    p.y = sy;
    p.t = t;
  };

  return (
    <main
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, padding: 24 }}
    >
      <div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Sound grid</h1>
        <p style={{ color: 'var(--color-mist)', margin: '0 0 16px' }}>
          Move the pointer over the grid to play it. Turn on “Play the grid” first. Speed{' '}
          {speed.toFixed(2)}
        </p>
        <video ref={noVideo} hidden />
        <div
          ref={pad}
          data-testid="pad"
          onPointerMove={onPointerMove}
          style={{ position: 'relative', aspectRatio: '4 / 3', touchAction: 'none' }}
        >
          <SoundGridCamera
            engine={engine}
            source={noVideo}
            showCamera={false}
            className="harness-pad"
          />
        </div>
      </div>
      <SoundGridPanel grid={grid} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <style>{`.harness-pad { position: absolute; inset: 0; width: 100%; left: 0; bottom: 0; }`}</style>
    <Harness />
  </StrictMode>,
);
