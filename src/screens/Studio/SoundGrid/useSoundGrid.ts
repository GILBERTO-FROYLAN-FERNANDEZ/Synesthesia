import { useCallback, useEffect, useState } from 'react';
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
  /** Grid sound on. Turning it on must come from a click (autoplay policy). */
  sounding: boolean;
  setSounding: (sounding: boolean) => void;
  error: string | null;
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
  const [shown, setShownState] = useState(false);
  const [sounding, setSoundingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => engine.dispose(), [engine]);

  const setSettings = useCallback(
    (next: Partial<SoundGridSettings>) => {
      engine.configure(next);
      setState(engine.current);
    },
    [engine],
  );

  const setSounding = useCallback(
    (on: boolean) => {
      setError(null);
      setSoundingState(on);
      if (on) {
        setShownState(true);
        engine.start().catch(() => {
          setSoundingState(false);
          setError('The sound grid could not start on this device.');
        });
      } else {
        void engine.stop();
      }
    },
    [engine],
  );

  const setShown = useCallback(
    (on: boolean) => {
      setShownState(on);
      if (!on) setSounding(false);
    },
    [setSounding],
  );

  return { engine, settings, setSettings, shown, setShown, sounding, setSounding, error };
}
