import type { VisualMapping } from '../materials/types';
import styles from './MotionResponsePicker.module.css';

export type MotionResponse = 'push' | 'trail' | 'ripple';

const RESPONSES: readonly { id: MotionResponse; label: string; description: string }[] = [
  { id: 'push', label: 'Push', description: "Move what's there" },
  { id: 'trail', label: 'Trail', description: 'Leave a path' },
  { id: 'ripple', label: 'Ripple', description: 'Make waves' },
];

export function responseForMapping(mapping?: VisualMapping): MotionResponse {
  if (mapping === 'ripples') return 'ripple';
  if (mapping === 'lines' || mapping === 'wake') return 'trail';
  return 'push';
}

export function mappingForResponse(response: MotionResponse): VisualMapping {
  return response === 'trail' ? 'lines' : response === 'ripple' ? 'ripples' : 'displacement';
}

export function responseAvailable(response: MotionResponse, materialId: string): boolean {
  if (response === 'ripple') return ['water', 'smoke', 'bubbles'].includes(materialId);
  if (response === 'trail') return ['water', 'honey', 'smoke', 'bubbles'].includes(materialId);
  return true;
}

export function MotionResponsePicker({
  value,
  materialId,
  onChange,
}: {
  value?: VisualMapping;
  materialId: string;
  onChange: (response: MotionResponse) => void;
}) {
  const selected = responseForMapping(value);
  return (
    <section className={styles.group} aria-label="Motion response">
      <div className={styles.heading}>
        <strong>Motion response</strong>
        <span>Choose how the visual reacts</span>
      </div>
      <div className={styles.options}>
        {RESPONSES.map(({ id, label, description }) => {
          const available = responseAvailable(id, materialId);
          return (
            <button
              key={id}
              type="button"
              className={`${styles.option} ${selected === id ? styles.selected : ''} ${styles[id]}`}
              aria-pressed={selected === id}
              disabled={!available}
              title={available ? description : `${label} is unavailable for this visual material.`}
              onClick={() => onChange(id)}
            >
              <span className={styles.preview} aria-hidden="true"><i /><i /><i /></span>
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
