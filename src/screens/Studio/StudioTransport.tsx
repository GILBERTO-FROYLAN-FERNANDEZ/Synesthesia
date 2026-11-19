import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { takeSnapshot, type SnapshotState } from '../../engine/snapshots';
import { readProperty } from '../../materials/properties';
import type { PropertyDef } from '../../materials/types';
import { useStudioStore } from '../../state/studioStore';
import { registryCatalog, soundMetas, visualMetas } from '../../studio/catalog';
import { Button } from '../../ui/Button';
import { formatTime, ScrubBar, wantsTenths } from '../../ui/ScrubBar';
import { SLOTS, type Slot } from '../../ui/SnapshotBar';
import { ChanceButton } from './ChancePopover';
import styles from './Studio.module.css';

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      {playing ? (
        <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" fill="currentColor" />
      ) : (
        <path d="M6 4l10 6-10 6z" fill="currentColor" />
      )}
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
      <path
        d="M4 8a4 4 0 0 1 4-4h6l-2-2M16 12a4 4 0 0 1-4 4H6l2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden="true">
      <path
        d="M6 3H3v12h3M12 3h3v12h-3M9 2v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden="true">
      <path
        d="M4 6V2.8M4 6h3.2M4.2 5.8A6 6 0 1 1 3.4 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function currentMatches(snapshot: SnapshotState | undefined, composition: SnapshotState): boolean {
  return snapshot !== undefined && JSON.stringify(snapshot) === JSON.stringify(composition);
}

function materialName(kind: 'visual' | 'sound', id: string): string {
  const materials = kind === 'visual' ? visualMetas() : soundMetas();
  return materials.find((material) => material.id === id)?.name ?? id;
}

function formatProperty(def: PropertyDef | undefined, value: number): string {
  if (def?.kind === 'choice') return def.choices?.[Math.round(value)] ?? String(Math.round(value));
  return `${Math.round(value * 100)}%`;
}

interface DiffRow {
  label: string;
  current: string;
  saved: string;
}

function propertyRows(
  kind: 'visual' | 'sound',
  current: SnapshotState,
  saved: SnapshotState,
): DiffRow[] {
  const currentMaterial = registryCatalog[kind](current[kind].materialId);
  const savedMaterial = registryCatalog[kind](saved[kind].materialId);
  const defs = new Map<string, PropertyDef>();
  for (const def of [...(currentMaterial?.properties ?? []), ...(savedMaterial?.properties ?? [])]) {
    defs.set(def.id, def);
  }
  const keys = new Set([
    ...Object.keys(current[kind].properties),
    ...Object.keys(saved[kind].properties),
  ]);
  const rows: DiffRow[] = [];
  for (const id of keys) {
    const def = defs.get(id);
    const currentValue = def
      ? readProperty(current[kind].properties, def)
      : (current[kind].properties[id] ?? 0);
    const savedValue = def
      ? readProperty(saved[kind].properties, def)
      : (saved[kind].properties[id] ?? 0);
    if (currentValue === savedValue) continue;
    rows.push({
      label: `${kind === 'visual' ? 'Visual' : 'Sound'} · ${def?.label ?? id}`,
      current: formatProperty(def, currentValue),
      saved: formatProperty(def, savedValue),
    });
  }
  return rows;
}

function snapshotDiff(current: SnapshotState, saved: SnapshotState): DiffRow[] {
  const rows: DiffRow[] = [];
  const add = (label: string, currentValue: string, savedValue: string) => {
    if (currentValue !== savedValue) rows.push({ label, current: currentValue, saved: savedValue });
  };
  add(
    'Visual material',
    materialName('visual', current.visual.materialId),
    materialName('visual', saved.visual.materialId),
  );
  add(
    'Sound material',
    materialName('sound', current.sound.materialId),
    materialName('sound', saved.sound.materialId),
  );
  add('Seed', String(current.seed), String(saved.seed));
  add('Linked controls', current.linked ? 'Linked' : 'Separate', saved.linked ? 'Linked' : 'Separate');
  add('Speed', `${current.timeline.speed.toFixed(2)}×`, `${saved.timeline.speed.toFixed(2)}×`);
  add('Loops', String(current.timeline.loops), String(saved.timeline.loops));
  add(
    'Repeat',
    current.timeline.loopMode === 'pingpong' ? 'Back and forth' : 'Loop',
    saved.timeline.loopMode === 'pingpong' ? 'Back and forth' : 'Loop',
  );
  add('Tail', `${current.timeline.tailSec.toFixed(1)} s`, `${saved.timeline.tailSec.toFixed(1)} s`);
  add(
    'Smoothing',
    `${Math.round(current.timeline.smoothing * 100)}%`,
    `${Math.round(saved.timeline.smoothing * 100)}%`,
  );
  add(
    'Signature strength',
    `${current.timeline.signatureStrength.toFixed(2)}×`,
    `${saved.timeline.signatureStrength.toFixed(2)}×`,
  );
  rows.push(...propertyRows('visual', current, saved), ...propertyRows('sound', current, saved));
  return rows;
}

function VersionCard({
  slot,
  snapshot,
  selected,
  active,
  onSelect,
}: {
  slot: Slot;
  snapshot?: SnapshotState;
  selected: boolean;
  active: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const visual = snapshot ? materialName('visual', snapshot.visual.materialId) : '';
  const sound = snapshot ? materialName('sound', snapshot.sound.materialId) : '';
  return (
    <button
      type="button"
      className={[
        styles.versionCard,
        snapshot ? styles.versionStored : styles.versionEmpty,
        selected ? styles.versionSelected : '',
        active ? styles.versionActive : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={selected}
      aria-label={
        snapshot
          ? `Version ${slot}, ${active ? 'active, ' : ''}${selected ? 'selected, ' : ''}${visual} and ${sound}`
          : `Version ${slot}, empty. Store current version`
      }
      title={
        snapshot
          ? `Select Version ${slot}. Shift-click to replace it with the current composition.`
          : `Store the current composition in Version ${slot}.`
      }
      onClick={onSelect}
    >
      <span className={`${styles.versionThumb} ${styles[`version_${snapshot?.visual.materialId}`] ?? ''}`}>
        {snapshot ? <i /> : <b>+</b>}
      </span>
      <span className={styles.versionName}>Version {slot}</span>
      <small>{snapshot ? `${visual} · ${sound}` : 'Empty'}</small>
      {active ? <em>Active</em> : null}
    </button>
  );
}

function ComparisonPanel({
  slot,
  current,
  snapshot,
  onClose,
  onRestore,
}: {
  slot: Slot;
  current: SnapshotState;
  snapshot: SnapshotState;
  onClose: () => void;
  onRestore: () => void;
}) {
  const rows = snapshotDiff(current, snapshot);
  return (
    <div className={styles.versionCompare} role="dialog" aria-label={`Compare Version ${slot}`}>
      <div className={styles.compareHead}>
        <div>
          <span>Version comparison</span>
          <strong>Current / Version {slot}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close comparison">
          ×
        </button>
      </div>
      <div className={styles.compareColumns} aria-hidden="true">
        <span>Parameter</span>
        <span>Current</span>
        <span>Version {slot}</span>
      </div>
      <div className={styles.compareRows}>
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <b>{row.current}</b>
              <b>{row.saved}</b>
            </div>
          ))
        ) : (
          <p>Current parameters match Version {slot}.</p>
        )}
      </div>
      <div className={styles.compareActions}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={onRestore}>
          Restore Version {slot}
        </Button>
      </div>
    </div>
  );
}

/** Dense timeline, real tracks and A–D composition snapshots. */
export function StudioTransport() {
  const transport = useStudioStore((s) => s.transport);
  const timeline = useStudioStore((s) => s.timeline);
  const loop = useStudioStore((s) => s.loop);
  const snapshots = useStudioStore((s) => s.snapshots);
  const activeSlot = useStudioStore((s) => s.activeSlot);
  const composition = useStudioStore((s) => s.composition);
  const signature = useStudioStore((s) => s.signature);
  const controllerReady = useStudioStore((s) => s.controller !== null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(activeSlot);
  const [compareOpen, setCompareOpen] = useState(false);
  const store = useStudioStore.getState;

  useEffect(() => {
    if (selectedSlot && !snapshots[selectedSlot]) {
      setSelectedSlot(null);
      setCompareOpen(false);
    }
  }, [selectedSlot, snapshots]);

  const duration = timeline.duration > 0 ? timeline.duration : transport.duration;
  const movementDuration = Math.max(0, timeline.tailStart || duration);
  const current = useMemo(() => (composition ? takeSnapshot(composition) : null), [composition]);
  const active = useMemo(() => {
    if (!activeSlot || !current) return null;
    return currentMatches(snapshots[activeSlot], current) ? activeSlot : null;
  }, [activeSlot, snapshots, current]);
  const selectedSnapshot = selectedSlot ? snapshots[selectedSlot] : undefined;
  const visualName =
    visualMetas().find((material) => material.id === composition?.visual.materialId)?.name ??
    'Visual';
  const soundName =
    soundMetas().find((material) => material.id === composition?.sound.materialId)?.name ?? 'Sound';
  const progress = duration > 0 ? Math.min(100, Math.max(0, (transport.position / duration) * 100)) : 0;
  const movementWidth = duration > 0 ? Math.min(100, (movementDuration / duration) * 100) : 100;
  const timeHasTenths = wantsTenths(duration);

  const selectVersion = (slot: Slot, event: MouseEvent<HTMLButtonElement>) => {
    if (!snapshots[slot] || event.shiftKey) store().storeSnapshot(slot);
    setSelectedSlot(slot);
    setCompareOpen(false);
  };
  const restoreSelected = () => {
    if (!selectedSlot || !snapshots[selectedSlot]) return;
    store().recallSnapshot(selectedSlot);
    setCompareOpen(false);
  };

  if (!composition || !current) return null;

  return (
    <section className={styles.transport} aria-label="Composition timeline">
      <div className={styles.transportControls}>
        <button
          type="button"
          className={styles.timelinePlay}
          onClick={() => store().togglePlay()}
            disabled={!controllerReady}
          aria-label={transport.playing ? 'Pause' : 'Play'}
          title={transport.playing ? 'Pause (Space)' : 'Play (Space)'}
        >
          <PlayIcon playing={transport.playing} />
        </button>
        <button
          type="button"
          className={`${styles.timelineLoop} ${loop ? styles.timelineLoopOn : ''}`}
          onClick={() => store().setLoop(!loop)}
          aria-label="Loop"
          aria-pressed={loop}
          title="Loop (L)"
        >
          <LoopIcon />
        </button>
        <div className={styles.timelineTime}>
          <strong>{formatTime(transport.position, timeHasTenths)}</strong>
          <span>/ {formatTime(duration, timeHasTenths)}</span>
        </div>
        <div className={styles.timelineScrub}>
          <ScrubBar
            position={Math.min(transport.position, duration)}
            duration={duration}
            onSeek={(time, phase) => store().seek(time, phase)}
            markers={timeline.markers}
            tailStart={timeline.tailStart}
          />
        </div>
        {transport.catchingUp ? <span className={styles.timelineCatching}>Catching up…</span> : null}
      </div>

      <div className={styles.timelineTracks}>
        <div className={styles.timelineHeading}>
          <div>
            <strong>Clip layers</strong>
            <span>Composition timeline · 3 real tracks</span>
          </div>
          <button type="button" disabled title="Multi-clip editing is not available in this Studio">
            + Add clip
          </button>
        </div>
        <div className={styles.trackStack}>
          <i className={styles.timelinePlayhead} style={{ left: `${progress}%` }} />
          <TimelineLane
            label="Movement"
            name={signature?.name ?? 'Signature'}
            detail={`${formatTime(movementDuration, true)} movement`}
            blockClass={styles.movementBlock}
            width={movementWidth}
            duration={duration}
            markers={timeline.markers}
          />
          <TimelineLane
            label="Visual"
            name={visualName}
            detail={`${formatTime(duration, true)} material`}
            blockClass={styles.visualBlock}
            width={100}
            duration={duration}
            markers={timeline.markers}
          />
          <TimelineLane
            label="Sound"
            name={soundName}
            detail={`${formatTime(duration, true)} material`}
            blockClass={styles.soundBlock}
            width={100}
            duration={duration}
            markers={timeline.markers}
          />
        </div>
      </div>

      <div className={styles.versions} role="group" aria-label="Versions">
        {SLOTS.map((slot) => (
          <VersionCard
            key={slot}
            slot={slot}
            snapshot={snapshots[slot]}
            selected={selectedSlot === slot}
            active={active === slot}
            onSelect={(event) => selectVersion(slot, event)}
          />
        ))}
      </div>

      <div className={styles.versionActions}>
        <Button
          onClick={() => setCompareOpen(true)}
          disabled={!selectedSnapshot}
          title={selectedSnapshot ? `Compare current parameters with Version ${selectedSlot}` : 'Select a stored version'}
        >
          <CompareIcon />
          Compare Versions
        </Button>
        <Button
          variant="quiet"
          onClick={restoreSelected}
          disabled={!selectedSnapshot}
          title={selectedSnapshot ? `Restore Version ${selectedSlot}` : 'Select a stored version'}
        >
          <RestoreIcon />
          Restore Version
        </Button>
        <ChanceButton />
      </div>

      {compareOpen && selectedSlot && selectedSnapshot ? (
        <ComparisonPanel
          slot={selectedSlot}
          current={current}
          snapshot={selectedSnapshot}
          onClose={() => setCompareOpen(false)}
          onRestore={restoreSelected}
        />
      ) : null}
    </section>
  );
}

function TimelineLane({
  label,
  name,
  detail,
  blockClass,
  width,
  duration,
  markers,
}: {
  label: string;
  name: string;
  detail: string;
  blockClass: string;
  width: number;
  duration: number;
  markers: readonly number[];
}) {
  return (
    <div className={styles.timelineLane}>
      <span>{label}</span>
      <b className={blockClass} style={{ width: `calc((100% - 66px) * ${width / 100})` }}>
        <span>{name}</span>
        <small>{detail}</small>
      </b>
      <span className={styles.motionMarkers} aria-label={`${markers.length} motion events`}>
        {markers.map((marker, index) => (
          <i
            key={`${marker}-${index}`}
            style={{ left: `${duration > 0 ? Math.min(100, (marker / duration) * 100) : 0}%` }}
          />
        ))}
      </span>
    </div>
  );
}
