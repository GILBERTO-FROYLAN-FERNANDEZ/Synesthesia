import styles from './MovementZoneOverlay.module.css';

export const MOVEMENT_ZONE_NAMES = [
  'Top left', 'Top center', 'Top right',
  'Middle left', 'Center', 'Middle right',
  'Bottom left', 'Bottom center', 'Bottom right',
] as const;

/** Diagnostic thirds of the mirrored camera image, not a body segmentation mask. */
export function MovementZoneOverlay({ activeRegion }: { activeRegion: number | null }) {
  return (
    <div className={styles.grid} aria-hidden="true" data-active-region={activeRegion ?? 'none'}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} data-active={activeRegion === index ? '' : undefined} />
      ))}
    </div>
  );
}
