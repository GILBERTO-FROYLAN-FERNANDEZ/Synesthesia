import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SOUND_GRID,
  SoundGridEngine,
  type SoundGridSettings,
} from '../../../live/soundGrid';

export interface SoundGridControls {
  engine: SoundGridEngine;
  settings: SoundGridSettings;
  setSettings: (next: Partial<SoundGridSettings>) => void;
  /** Grid shown over the camera (zones measured). */
  shown: boolean;
  setShown: (shown: boolean) => void;
  /** Camera image under the grid. */
  showCamera: boolean;
  setShowCamera: (show: boolean) => void;
  /** Grid sound on. Turning it on must come from a click (autoplay policy). */
  sounding: boolean;
  setSounding: (sounding: boolean) => void;
  error: string | null;
  starting: boolean;
  activeCount: number;
}

/**
 * One sound grid for a live screen. Pass every tracker frame to `engine.update(frame)`; the
 * engine is stable for the life of the screen.
 */
export function useSoundGrid(initial: Partial<SoundGridSettings> = {}): SoundGridControls {
  const [engine] = useState(() => new SoundGridEngine(initial));
  const [settings, setState] = useState<SoundGridSettings>(() => ({
    ...DEFAULT_SOUND_GRID,
    ...initial,
  }));
  const [shown, setShownState] = useState(true);
  const [showCamera, setShowCamera] = useState(true);
  const [sounding, setSoundingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeCount, setActiveCount] = useState(0);
  useEffect(() => engine.subscribe((snapshot) => setActiveCount(snapshot.active.reduce((sum, value) => sum + value, 0))), [engine]);
  const request = useRef(0);
  const [starting, setStarting] = useState(false);
  useEffect(() => () => { request.current++; engine.dispose(); }, [engine]);

  const setSettings = useCallback(
    (next: Partial<SoundGridSettings>) => {
      engine.configure(next);
      setState(engine.current);
    },
    [engine],
  );

  const setSounding = useCallback(
    (on: boolean) => {
      const token = ++request.current;
      setError(null);
      setSoundingState(false);
      setStarting(on);
      if (on) {
        setShownState(true);
        void engine.start().then(() => {
          if (token !== request.current) return;
          setStarting(false);
          setSoundingState(engine.isSounding);
        }).catch(() => {
          if (token !== request.current) return;
          setStarting(false);
          setError('Sound could not start. Click Enable sound again and check browser audio permissions.');
        });
      } else {
        void engine.stop().catch(() => undefined);
      }
    },
    [engine],
  );

  const setShown = useCallback(
    (on: boolean) => {
      setShownState(on);
    },
    [],
  );

  return {
    engine,
    settings,
    setSettings,
    shown,
    setShown,
    showCamera,
    setShowCamera,
    sounding,
    setSounding,
    error,
    starting,
    activeCount,
  };
}
