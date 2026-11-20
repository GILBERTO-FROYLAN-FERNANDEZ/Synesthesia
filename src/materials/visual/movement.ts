import type { VisualMapping } from '../types';

/** Keep the original serialized presets so saved compositions retain their settings. */
export function movementSettings(mapping?: VisualMapping): { sampled: boolean; existing: boolean } {
  return {
    sampled: mapping === 'lines' || mapping === 'sampled-displacement',
    existing: mapping === 'displacement' || mapping === 'sampled-displacement',
  };
}

export function movementMapping(sampled: boolean, existing: boolean): VisualMapping {
  return existing
    ? sampled
      ? 'sampled-displacement'
      : 'displacement'
    : sampled
      ? 'lines'
      : 'wake';
}

/** Rooted grass supports existing material, with full or sampled movement. */
export function mappingForVisual(id: string, mapping?: VisualMapping): VisualMapping {
  if (id === 'grass')
    return mapping === 'lines' || mapping === 'sampled-displacement'
      ? 'sampled-displacement'
      : 'displacement';
  return mapping ?? 'wake';
}
