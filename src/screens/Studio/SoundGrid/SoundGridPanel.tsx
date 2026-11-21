import {
  GRID_SIZES,
  PLAY_MODE_LABELS,
  PLAY_MODES,
  ROOTS,
  SCALE_IDS,
  SCALE_LABELS,
  VOICE_IDS,
  VOICES,
  noteName,
} from '../../../live/soundGrid';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { Slider } from '../../../ui/Slider';
import { Toggle } from '../../../ui/Toggle';
import styles from './SoundGrid.module.css';
import type { SoundGridControls } from './useSoundGrid';

export interface SoundGridPanelProps {
  grid: SoundGridControls;
  disabled?: boolean;
}

const SIZE_LABELS = GRID_SIZES.map(({ cols, rows }) => `${cols} × ${rows}`);
const MODE_DESCRIPTIONS = {
  hold: 'Each zone sounds while you move in it.',
  strike: 'Each zone plays a note when movement starts in it.',
  both: 'Zones sound while you move and strike on sudden movement.',
} as const;

/** Controls for the sound grid: on/off, grid size, how zones play, tone, scale and key. */
export function SoundGridPanel({ grid, disabled = false }: SoundGridPanelProps) {
  const { settings, setSettings } = grid;
  return (
    <section className={styles.panel} aria-labelledby="sound-grid-title">
      <h2 id="sound-grid-title" className={styles.title}>
        Sound grid
      </h2>
      <p className={styles.hint}>
        Each part of the camera frame plays its own note. Move in a zone to play it.
      </p>
      <Toggle
        label="Show the grid"
        checked={grid.shown}
        accent="water"
        disabled={disabled}
        onChange={grid.setShown}
      />
      <Toggle
        label="Play the grid"
        checked={grid.sounding}
        accent="water"
        disabled={disabled}
        onChange={grid.setSounding}
        description="Turns sound on. Each zone you move in plays its note."
      />
      {grid.error ? (
        <p className={styles.error} role="alert">
          {grid.error}
        </p>
      ) : null}
      <SegmentedControl
        label="Zones"
        options={SIZE_LABELS}
        value={settings.size}
        disabled={disabled}
        onChange={(size) => setSettings({ size })}
      />
      <SegmentedControl
        label="Play"
        options={PLAY_MODES.map((mode) => PLAY_MODE_LABELS[mode])}
        value={PLAY_MODES.indexOf(settings.mode)}
        description={MODE_DESCRIPTIONS[settings.mode]}
        disabled={disabled}
        onChange={(i) => setSettings({ mode: PLAY_MODES[i] ?? 'both' })}
      />
      <SegmentedControl
        label="Tone"
        options={VOICE_IDS.map((id) => VOICES[id].label)}
        value={VOICE_IDS.indexOf(settings.voice)}
        description={VOICES[settings.voice].description}
        disabled={disabled}
        onChange={(i) => setSettings({ voice: VOICE_IDS[i] ?? 'glass' })}
      />
      <SegmentedControl
        label="Scale"
        options={SCALE_IDS.map((id) => SCALE_LABELS[id])}
        value={SCALE_IDS.indexOf(settings.scale)}
        disabled={disabled}
        onChange={(i) => setSettings({ scale: SCALE_IDS[i] ?? 'pentatonic' })}
      />
      <SegmentedControl
        label="Lowest note"
        options={ROOTS.map(noteName)}
        value={Math.max(0, ROOTS.indexOf(settings.root))}
        disabled={disabled}
        onChange={(i) => setSettings({ root: ROOTS[i] ?? settings.root })}
      />
      <Slider
        label="Response"
        value={settings.response}
        baseline={0.5}
        showValue
        accent="water"
        format={(v) => `${Math.round(v * 100)}%`}
        description="Higher lets smaller movements play a zone fully."
        disabled={disabled}
        onChange={(response) => setSettings({ response })}
      />
      <Slider
        label="Grid volume"
        value={settings.volume}
        baseline={0.7}
        showValue
        accent="water"
        format={(v) => `${Math.round(v * 100)}%`}
        disabled={disabled}
        onChange={(volume) => setSettings({ volume })}
      />
    </section>
  );
}
