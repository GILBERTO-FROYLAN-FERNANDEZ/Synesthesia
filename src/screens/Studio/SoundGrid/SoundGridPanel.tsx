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
import { Button } from '../../../ui/Button';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { Slider } from '../../../ui/Slider';
import { Toggle } from '../../../ui/Toggle';
import styles from './SoundGrid.module.css';
import type { SoundGridControls } from './useSoundGrid';

export interface SoundGridPanelProps {
  grid: SoundGridControls;
  disabled?: boolean;
  showStart?: boolean;
}

const SIZE_LABELS = GRID_SIZES.map(({ cols, rows }) => `${cols} × ${rows}`);
const MODE_DESCRIPTIONS = {
  hold: 'Each zone sounds while you move in it.',
  strike: 'Each zone plays a note when movement starts in it.',
  both: 'Zones sound while you move and strike on sudden movement.',
} as const;

/** Controls for the sound grid: on/off, grid size, how zones play, tone, scale and key. */
export function SoundGridPanel({ grid, disabled = false, showStart = true }: SoundGridPanelProps) {
  const { settings, setSettings } = grid;
  return (
    <section className={styles.panel} aria-labelledby="sound-grid-title">
      <h2 id="sound-grid-title" className={styles.title}>
        Sound grid
      </h2>
      <p className={styles.hint}>1. Enable sound. 2. Move across the camera zones. 3. Adjust the instrument below. Each moving zone plays its own note; several zones can sound together.</p>
      {showStart ? <Button variant="primary" disabled={disabled || grid.starting} onClick={() => grid.setSounding(!grid.sounding)}>
        {grid.starting ? 'Starting sound…' : grid.sounding ? 'Disable sound' : 'Enable sound'}
      </Button> : null}
      <p className={styles.status} role="status">{grid.starting ? 'Starting audio…' : grid.sounding ? 'Sound enabled · move to play' : 'Sound is off · enable sound to begin'}</p>
      {grid.error ? <p className={styles.error} role="alert">{grid.error}</p> : null}
      <h3 className={styles.sectionHeading}>Movement &amp; mapping</h3>
      <Toggle label="Show sound grid" checked={grid.shown} accent="water" disabled={disabled} onChange={grid.setShown} description="Hide the visual overlay without turning sound off." />
      <Toggle label="Show camera under grid" checked={grid.showCamera} accent="water" disabled={disabled || !grid.shown} onChange={grid.setShowCamera} />
      <p className={styles.hint}>Lit cells show movement. Low notes are at the bottom; high notes at the top.</p>
      <SegmentedControl
        label="Grid size"
        options={SIZE_LABELS}
        value={settings.size}
        disabled={disabled}
        onChange={(size) => setSettings({ size })}
      />
      <SegmentedControl
        label="Play mode"
        options={PLAY_MODES.map((mode) => PLAY_MODE_LABELS[mode])}
        value={PLAY_MODES.indexOf(settings.mode)}
        description={MODE_DESCRIPTIONS[settings.mode]}
        disabled={disabled}
        onChange={(i) => setSettings({ mode: PLAY_MODES[i] ?? 'both' })}
      />
      <p className={styles.hint}>{MODE_DESCRIPTIONS[settings.mode]}</p>
      <h3 className={styles.sectionHeading}>Sound character</h3>
      <label className={styles.select}>Tone
        <select value={settings.voice} disabled={disabled} onChange={(event) => setSettings({ voice: VOICE_IDS.find((id) => id === event.target.value) ?? 'glass' })}>
          {VOICE_IDS.map((id) => <option key={id} value={id}>{VOICES[id].label}</option>)}
        </select>
      </label>
      <p className={styles.hint}>{VOICES[settings.voice].description}</p>
      <label className={styles.select}>Scale
        <select value={settings.scale} disabled={disabled} onChange={(event) => setSettings({ scale: SCALE_IDS.find((id) => id === event.target.value) ?? 'pentatonic' })}>
          {SCALE_IDS.map((id) => <option key={id} value={id}>{SCALE_LABELS[id]}</option>)}
        </select>
      </label>
      <label className={styles.select}>Lowest note
        <select value={settings.root} disabled={disabled} onChange={(event) => setSettings({ root: Number(event.target.value) })}>
          {ROOTS.map((root) => <option key={root} value={root}>{noteName(root)}</option>)}
        </select>
      </label>
      <h3 className={styles.sectionHeading}>Response &amp; level</h3>
      <Slider
        label="Grid response"
        value={settings.response}
        baseline={0.5}
        showValue
        accent="water"
        format={(v) => `${Math.round(v * 100)}%`}
        description="Higher lets smaller movements play a zone fully."
        disabled={disabled}
        onChange={(response) => setSettings({ response })}
      />
      <p className={styles.hint}>Higher response lets smaller movements play the notes. Grid volume works together with master volume.</p>
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
