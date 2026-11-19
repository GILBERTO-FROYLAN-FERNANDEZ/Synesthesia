import { useId, useMemo, useState } from 'react';
import {
  GLOBAL_CONTROLS,
  type CompositionStatus,
  type TimelineSettings,
} from '../../engine/composition';
import { readProperty } from '../../materials/properties';
import { SIGNATURE_VIEW_ID } from '../../materials/registry';
import type { MaterialMeta, PropertyDef } from '../../materials/types';
import { useStudioStore } from '../../state/studioStore';
import { clipForVisit } from '../../state/visitClips';
import { registryCatalog, soundMetas, visualMetas } from '../../studio/catalog';
import { defsOf, isSoloed, lockedIds, type Field } from '../../studio/edits';
import { linkedField, linkedValues, propertySections } from '../../studio/sections';
import type { SoundProblem } from '../../studio/runtime';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Slider, type SliderPhase } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { CompositionSeed } from './CompositionSeed';
import styles from './Studio.module.css';

type InspectorTab = 'visual' | 'sound' | 'movement';

const STATUS_OPTIONS: Array<{ value: CompositionStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'kept', label: 'Kept' },
  { value: 'set-aside', label: 'Set aside' },
];

const ENDPOINTS: Record<string, [string, string]> = {
  viscosity: ['Thin', 'Thick'],
  elasticity: ['Still', 'Springy'],
  persistence: ['Short', 'Long'],
  dispersion: ['Focused', 'Spread'],
  brightness: ['Dim', 'Bright'],
  intensity: ['Gentle', 'Strong'],
  rigidity: ['Soft', 'Rigid'],
  density: ['Sparse', 'Dense'],
  range: ['Compressed', 'Expanded'],
  hue: ['−180°', '+180°'],
  rise: ['Sink', 'Rise'],
  fallSpeed: ['Slow', 'Fast'],
  size: ['Small', 'Large'],
  length: ['Short', 'Long'],
  thickness: ['Fine', 'Thick'],
  surfaceLight: ['Matte', 'Glossy'],
  stutterDepth: ['Smooth', 'Stuttered'],
};

interface ParameterCardProps {
  def: PropertyDef;
  value: number;
  affected: string;
  locked?: boolean;
  accent?: 'honey' | 'water';
  onUnlock?: () => void;
  onChange: (value: number, phase: SliderPhase) => void;
}

function formatProperty(def: PropertyDef, value: number): string {
  if (def.kind === 'choice') return def.choices?.[Math.round(value)] ?? String(Math.round(value));
  if (def.id === 'hue') {
    const degrees = Math.round((value - 0.5) * 360);
    return `${degrees > 0 ? '+' : ''}${degrees}°`;
  }
  return `${Math.round(value * 100)}%`;
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M3.2 6A5 5 0 1 1 3 10.8M3.2 6V2.7M3.2 6h3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="m3.2 8.2 3 3 6.6-6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ParameterCard({
  def,
  value,
  affected,
  locked = false,
  accent = 'honey',
  onUnlock,
  onChange,
}: ParameterCardProps) {
  const endpoints = ENDPOINTS[def.id] ?? ['Low', 'High'];
  const atDefault = value === def.default;
  const reset = () => {
    if (locked) onUnlock?.();
    onChange(def.default, 'end');
  };

  return (
    <div className={`${styles.parameterCard} ${locked ? styles.parameterLocked : ''}`}>
      <div className={styles.parameterHead}>
        <span>{def.label}</span>
        <div className={styles.parameterValue}>
          {locked && onUnlock ? (
            <button type="button" onClick={onUnlock}>
              Unlock
            </button>
          ) : null}
          <strong>{formatProperty(def, value)}</strong>
        </div>
      </div>

      {def.kind === 'choice' ? (
        <div className={styles.parameterChoice}>
          <SegmentedControl
            label={def.label}
            hideLabel
            description={def.description}
            options={def.choices ?? []}
            value={Math.round(value)}
            disabled={locked}
            onChange={(index) => onChange(index, 'end')}
          />
        </div>
      ) : (
        <div className={styles.parameterRange}>
          <span>{endpoints[0]}</span>
          <div>
            <Slider
              label={def.label}
              value={value}
              min={0}
              max={1}
              step={0.01}
              baseline={def.default}
              description={def.description}
              locked={locked}
              onUnlock={onUnlock}
              accent={accent}
              hideHeader
              onChange={onChange}
            />
          </div>
          <span>{endpoints[1]}</span>
        </div>
      )}

      <p className={styles.parameterDescription}>{def.description}</p>
      <div className={styles.parameterFoot}>
        <span>
          Affects: <strong>{affected}</strong>
        </span>
        <button type="button" onClick={reset} disabled={atDefault && !locked}>
          <ResetIcon />
          Reset
        </button>
      </div>
    </div>
  );
}

function MaterialCard({
  material,
  selected,
  kind,
  onSelect,
}: {
  material: MaterialMeta;
  selected: boolean;
  kind: Field;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.materialCard} ${selected ? styles.materialCardSelected : ''}`}
      aria-pressed={selected}
      title={material.description}
      onClick={onSelect}
    >
      <span
        className={`${styles.materialPreview} ${styles[`material_${material.id}`] ?? ''}`}
        aria-hidden="true"
      >
        <i />
        <i />
        {kind === 'sound' ? <i className={styles.soundGlyph} /> : null}
      </span>
      <span className={styles.materialName}>
        {material.name}
        {selected ? <CheckIcon /> : null}
      </span>
    </button>
  );
}

function soundMessage(problem: SoundProblem, materialId: string): string {
  switch (problem) {
    case 'no-audio':
      return 'Sound isn’t available in this browser, so the composition plays silently.';
    case 'material-missing':
      return `The sound material “${materialId}” isn’t part of this version, so the composition plays silently. Choose another sound material.`;
    case 'material-failed':
      return 'This sound material couldn’t start on this computer. Try another one, or reload the page.';
    case 'play-failed':
      return 'The sound couldn’t start. Check that this computer’s sound is on, then press Play again.';
  }
}

/** The dense, card-based Inspector from the October 20 Studio, backed by the current store. */
export function StudioPanel() {
  const [tab, setTab] = useState<InspectorTab>('visual');
  const [advancedOpen, setAdvancedOpen] = useState<Record<InspectorTab, boolean>>({
    visual: false,
    sound: false,
    movement: false,
  });
  const composition = useStudioStore((s) => s.composition);
  const sound = useStudioStore((s) => s.sound);
  const defs = useMemo(
    () => (composition ? defsOf(composition, registryCatalog) : { visual: [], sound: [] }),
    [composition],
  );
  const sections = useMemo(
    () => propertySections(defs, composition?.linked ?? true),
    [defs, composition?.linked],
  );
  const locked = useMemo(() => lockedIds(composition?.chance ?? null), [composition?.chance]);
  if (!composition) return null;

  const store = useStudioStore.getState;
  const materials =
    tab === 'visual'
      ? visualMetas().filter((material) => material.id !== SIGNATURE_VIEW_ID)
      : tab === 'sound'
        ? soundMetas()
        : [];
  const selectedMaterial =
    tab === 'visual'
      ? materials.find((item) => item.id === composition.visual.materialId)
      : tab === 'sound'
        ? materials.find((item) => item.id === composition.sound.materialId)
        : null;

  const field = tab === 'sound' ? 'sound' : 'visual';
  const fieldValues = composition[field].properties;
  const ownDefs = tab === 'visual' ? sections.visual : sections.sound;
  const sharedDefs = composition.linked ? (sections.both ?? []) : [];
  const sharedValues = composition.linked
    ? linkedValues(sharedDefs, defs, {
        visual: composition.visual.properties,
        sound: composition.sound.properties,
      })
    : {};
  const displayedDefs = tab === 'movement' ? [] : [...sharedDefs, ...ownDefs];
  const basicDefs = displayedDefs.filter((def) => def.primary);
  const advancedDefs = displayedDefs.filter((def) => !def.primary);

  const valueFor = (def: PropertyDef): number =>
    readProperty(def.shared && composition.linked ? sharedValues : fieldValues, def);
  const changeProperty = (def: PropertyDef, value: number, phase: SliderPhase) => {
    const target = def.shared && composition.linked ? linkedField(def.id, defs) : field;
    store().setProperty(target, def.id, value, {
      key: `${def.shared && composition.linked ? 'both' : target}:${def.id}`,
      phase,
    });
  };

  return (
    <aside className={styles.panel} aria-label="Composition controls">
      <div className={styles.inspectorHead}>
        <div>
          <span className={styles.eyebrow}>Selected visual layer</span>
          <h2>Inspector</h2>
        </div>
        <span className={styles.activeMaterial}>
          <i aria-hidden="true" />
          {selectedMaterial?.name ?? (tab === 'movement' ? 'Signature' : 'Material')}
        </span>
      </div>

      <div className={styles.inspectorTabs} role="tablist" aria-label="Inspector">
        {(['visual', 'sound', 'movement'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
          >
            {item[0]?.toUpperCase()}
            {item.slice(1)}
          </button>
        ))}
      </div>

      <div className={styles.inspectorScroll}>
        <div className={styles.controlGroupLabel}>Basic Controls</div>

        {tab === 'visual' || tab === 'sound' ? (
          <>
            <section className={styles.materialSection} aria-label={`${field} material`}>
              <div className={styles.materialLabel}>
                <span>{tab === 'visual' ? 'Visual Material' : 'Sound Material'}</span>
                <strong>{selectedMaterial?.name}</strong>
              </div>
              <div className={styles.materialGrid}>
                {materials.map((material) => (
                  <MaterialCard
                    key={material.id}
                    material={material}
                    kind={field}
                    selected={material.id === composition[field].materialId}
                    onSelect={() => store().setMaterial(field, material.id)}
                  />
                ))}
              </div>
              <div className={styles.materialActions}>
                <Toggle
                  label="Linked"
                  accent="water"
                  checked={composition.linked}
                  onChange={(linked) => store().setLinked(linked)}
                  description="One slider moves each shared property in both the visual and sound."
                />
                <button
                  type="button"
                  aria-pressed={composition.mute[field]}
                  onClick={() => store().toggleMute(field)}
                >
                  Mute
                </button>
                <button
                  type="button"
                  aria-pressed={isSoloed(composition.mute, field)}
                  onClick={() => store().toggleSolo(field)}
                >
                  Solo
                </button>
              </div>
            </section>

            {tab === 'sound' && sound ? (
              <p className={styles.fieldNote} role="status">
                {soundMessage(sound, composition.sound.materialId)}
              </p>
            ) : null}

            <div className={styles.parameterList}>
              {basicDefs.map((def) => (
                <ParameterCard
                  key={def.id}
                  def={def}
                  value={valueFor(def)}
                  affected={
                    def.shared && composition.linked
                      ? 'Visual + Sound'
                      : `${selectedMaterial?.name ?? field} ${field}`
                  }
                  locked={locked.has(def.id)}
                  accent={def.shared && composition.linked ? 'water' : 'honey'}
                  onUnlock={() => store().unlock(def.id)}
                  onChange={(value, phase) => changeProperty(def, value, phase)}
                />
              ))}
            </div>

            <AdvancedControls
              open={advancedOpen[tab]}
              count={advancedDefs.length}
              onToggle={() =>
                setAdvancedOpen((current) => ({ ...current, [tab]: !current[tab] }))
              }
            >
              {advancedDefs.map((def) => (
                <ParameterCard
                  key={def.id}
                  def={def}
                  value={valueFor(def)}
                  affected={
                    def.shared && composition.linked
                      ? 'Visual + Sound'
                      : `${selectedMaterial?.name ?? field} ${field}`
                  }
                  locked={locked.has(def.id)}
                  accent={def.shared && composition.linked ? 'water' : 'honey'}
                  onUnlock={() => store().unlock(def.id)}
                  onChange={(value, phase) => changeProperty(def, value, phase)}
                />
              ))}
            </AdvancedControls>
          </>
        ) : (
          <MovementInspector
            advancedOpen={advancedOpen.movement}
            onToggleAdvanced={() =>
              setAdvancedOpen((current) => ({ ...current, movement: !current.movement }))
            }
          />
        )}
      </div>
    </aside>
  );
}

function AdvancedControls({
  open,
  count,
  onToggle,
  children,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className={styles.advancedGroup}>
      <button type="button" className={styles.advancedTrigger} aria-expanded={open} onClick={onToggle}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <strong>Advanced Controls</strong>
        <small>{count} parameters</small>
      </button>
      {open ? <div className={styles.advancedContent}>{children}</div> : null}
    </section>
  );
}

interface MovementSpec {
  key: 'signatureStrength' | 'smoothing' | 'speed' | 'loops' | 'tailSec';
  label: string;
  description: string;
  endpoints: [string, string];
  format: (value: number) => string;
}

const MOVEMENT_SPECS: MovementSpec[] = [
  {
    key: 'signatureStrength',
    label: 'Signature strength',
    description:
      'How strongly the recorded movement acts on both materials: below 1 gentler, above 1 stronger.',
    endpoints: ['Gentle', 'Strong'],
    format: (value) => `${value.toFixed(2)}×`,
  },
  {
    key: 'smoothing',
    label: 'Smoothing',
    description: 'Softens quick changes in the recorded movement.',
    endpoints: ['Direct', 'Smooth'],
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'speed',
    label: 'Playback speed',
    description: 'How fast the movement plays.',
    endpoints: ['Slow', 'Fast'],
    format: (value) => `${value.toFixed(2)}×`,
  },
  {
    key: 'loops',
    label: 'Loops',
    description: 'How many times the movement plays.',
    endpoints: ['1', '8'],
    format: (value) => String(Math.round(value)),
  },
  {
    key: 'tailSec',
    label: 'Tail',
    description: 'How long the wake settles after the movement ends.',
    endpoints: ['0 s', '10 s'],
    format: (value) => `${value.toFixed(1)} s`,
  },
];

function MovementCard({
  spec,
  value,
  baseline,
  onChange,
}: {
  spec: MovementSpec;
  value: number;
  baseline: number;
  onChange: (value: number, phase: SliderPhase) => void;
}) {
  const range = GLOBAL_CONTROLS[spec.key];
  return (
    <div className={styles.parameterCard}>
      <div className={styles.parameterHead}>
        <span>{spec.label}</span>
        <strong>{spec.format(value)}</strong>
      </div>
      <div className={styles.parameterRange}>
        <span>{spec.endpoints[0]}</span>
        <div>
          <Slider
            label={spec.label}
            value={value}
            min={range.min}
            max={range.max}
            step={range.step}
            baseline={baseline}
            description={spec.description}
            hideHeader
            onChange={onChange}
          />
        </div>
        <span>{spec.endpoints[1]}</span>
      </div>
      <p className={styles.parameterDescription}>{spec.description}</p>
      <div className={styles.parameterFoot}>
        <span>
          Affects: <strong>Movement sequence</strong>
        </span>
        <button type="button" onClick={() => onChange(baseline, 'end')} disabled={value === baseline}>
          <ResetIcon />
          Reset
        </button>
      </div>
    </div>
  );
}

function MovementInspector({
  advancedOpen,
  onToggleAdvanced,
}: {
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
}) {
  const composition = useStudioStore((s) => s.composition);
  const signature = useStudioStore((s) => s.signature);
  const clipOpacity = useStudioStore((s) => s.clipOpacity);
  const clipFailed = useStudioStore((s) => s.clipFailed);
  if (!composition) return null;
  const store = useStudioStore.getState;
  const speedRange = GLOBAL_CONTROLS.speed;
  const preferredSpeed = Math.min(
    speedRange.max,
    Math.max(speedRange.min, signature?.preferredSpeed ?? 1),
  );
  const baseline = (key: MovementSpec['key']) =>
    key === 'speed' ? preferredSpeed : GLOBAL_CONTROLS[key].default;
  const set = (key: MovementSpec['key'], value: number, phase: SliderPhase) => {
    const patch: Partial<TimelineSettings> = { [key]: key === 'loops' ? Math.round(value) : value };
    store().setTimeline(patch, { key: `timeline:${key}`, phase });
  };
  const clipHere =
    signature !== null && clipForVisit(signature.contentHash) !== null && !clipFailed;
  const basic = MOVEMENT_SPECS.filter((spec) => spec.key !== 'tailSec');
  const tail = MOVEMENT_SPECS.find((spec) => spec.key === 'tailSec');

  return (
    <>
      <div className={styles.parameterList}>
        {clipHere ? (
          <div className={styles.parameterCard}>
            <div className={styles.parameterHead}>
              <span>Clip overlay</span>
              <strong>{Math.round(clipOpacity * 100)}%</strong>
            </div>
            <div className={styles.parameterRange}>
              <span>Hidden</span>
              <div>
                <Slider
                  label="Clip overlay"
                  value={clipOpacity}
                  min={0}
                  max={1}
                  step={0.01}
                  baseline={0}
                  description="Shows the visit-only source clip over the wake."
                  hideHeader
                  onChange={(value) => store().setClipOpacity(value)}
                />
              </div>
              <span>Visible</span>
            </div>
            <p className={styles.parameterDescription}>
              Shows the visit-only source clip over the wake. It is never included in a render.
            </p>
            <div className={styles.parameterFoot}>
              <span>
                Affects: <strong>Preview only</strong>
              </span>
              <button
                type="button"
                onClick={() => store().setClipOpacity(0)}
                disabled={clipOpacity === 0}
              >
                <ResetIcon />
                Reset
              </button>
            </div>
          </div>
        ) : null}
        {basic.map((spec) => (
          <MovementCard
            key={spec.key}
            spec={spec}
            value={composition.timeline[spec.key]}
            baseline={baseline(spec.key)}
            onChange={(value, phase) => set(spec.key, value, phase)}
          />
        ))}
      </div>

      <AdvancedControls open={advancedOpen} count={2} onToggle={onToggleAdvanced}>
        <div className={styles.parameterCard}>
          <div className={styles.parameterHead}>
            <span>Repeat direction</span>
            <strong>{composition.timeline.loopMode === 'pingpong' ? 'Back and forth' : 'Loop'}</strong>
          </div>
          <div className={styles.parameterChoice}>
            <SegmentedControl
              label="Repeat direction"
              hideLabel
              options={['Loop', 'Back and forth']}
              value={composition.timeline.loopMode === 'pingpong' ? 1 : 0}
              disabled={composition.timeline.loops < 2}
              description="Each repeat starts again or reverses direction."
              onChange={(index) =>
                store().setTimeline({ loopMode: index === 1 ? 'pingpong' : 'loop' })
              }
            />
          </div>
          <p className={styles.parameterDescription}>
            Each repeat starts again or reverses direction. Two or more loops are required.
          </p>
          <div className={styles.parameterFoot}>
            <span>
              Affects: <strong>Movement sequence</strong>
            </span>
            <button
              type="button"
              disabled={composition.timeline.loopMode === 'loop'}
              onClick={() => store().setTimeline({ loopMode: 'loop' })}
            >
              <ResetIcon />
              Reset
            </button>
          </div>
        </div>
        {tail ? (
          <MovementCard
            spec={tail}
            value={composition.timeline.tailSec}
            baseline={baseline('tailSec')}
            onChange={(value, phase) => set('tailSec', value, phase)}
          />
        ) : null}
        <section className={styles.seedCard} aria-label="Repeatable variation">
          <div>
            <span>Repeatable variation</span>
            <strong>Composition seed</strong>
          </div>
          <CompositionSeed description="The seed fixes every chance choice, so the composition always plays the same way." />
        </section>
        <NotesSection />
      </AdvancedControls>
    </>
  );
}

function NotesSection() {
  const notes = useStudioStore((s) => s.composition?.notes ?? '');
  const status = useStudioStore((s) => s.composition?.status ?? 'draft');
  const notesId = useId();
  const store = useStudioStore.getState;
  return (
    <section className={styles.notesCard} aria-labelledby={`${notesId}-title`}>
      <h2 id={`${notesId}-title`}>Notes</h2>
      <label className="visually-hidden" htmlFor={notesId}>
        Notes
      </label>
      <textarea
        id={notesId}
        className={styles.notes}
        value={notes}
        rows={4}
        placeholder="Discoveries, rough places, revisions."
        onChange={(event) => store().setNotes(event.target.value)}
      />
      <SegmentedControl
        label="Status"
        options={STATUS_OPTIONS.map((option) => option.label)}
        value={Math.max(
          0,
          STATUS_OPTIONS.findIndex((option) => option.value === status),
        )}
        onChange={(index) => store().setStatus(STATUS_OPTIONS[index]?.value ?? 'draft')}
      />
    </section>
  );
}
