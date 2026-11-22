/**
 * Material registry (SPEC 9.1). Materials register in visual/index.ts and
 * sound/index.ts; everything else looks them up here.
 */
import { SOUND_MATERIALS } from './sound';
import type { SoundMaterialEntry, VisualMaterialEntry, VisualMapping } from './types';
import { VISUAL_MATERIALS } from './visual';
import { withVisualMapping } from './visual/mappedMaterial';
const INSTALLED_VISUAL_MATERIALS = VISUAL_MATERIALS.map(withVisualMapping);

/** Raw motion-field view kept for diagnostics and older saved compositions. */
export const SIGNATURE_VIEW_ID = 'signature';
export const DEFAULT_VISUAL_ID = 'water';
export const DEFAULT_SOUND_ID = 'water';

export function listVisualMaterials(mapping?: VisualMapping): readonly VisualMaterialEntry[] {
  // The redesigned Studio keeps Filaments available with its original response.
  // Katie's newer mappings do not define Trail or Ripple for that material.
  return INSTALLED_VISUAL_MATERIALS.filter(
    (entry) =>
      entry.meta.id !== SIGNATURE_VIEW_ID &&
      (entry.meta.id !== 'filaments' || mapping === 'displacement') &&
      !(mapping === 'ripples' && entry.meta.id === 'grass'),
  );
}

/** The five expressive materials; Signature is a diagnostic field view. */
export function listCreativeVisualMaterials(): readonly VisualMaterialEntry[] {
  return VISUAL_MATERIALS.filter((material) => material.meta.id !== SIGNATURE_VIEW_ID);
}

export function listSoundMaterials(): readonly SoundMaterialEntry[] {
  return SOUND_MATERIALS;
}

export function getVisualMaterial(id: string): VisualMaterialEntry | undefined {
  return INSTALLED_VISUAL_MATERIALS.find((m) => m.meta.id === id);
}

export function getSoundMaterial(id: string): SoundMaterialEntry | undefined {
  return SOUND_MATERIALS.find((m) => m.meta.id === id);
}

/** Mapping changes choose a compatible scene without mixing the two picker lists. */
export function visualIdForMapping(id: string, mapping: VisualMapping): string {
  if (id === 'warp-bubbles') id = 'bubbles';
  if (mapping === 'signature') return SIGNATURE_VIEW_ID;
  if (id === 'warp-grass') id = 'grass';
  if (
    id === SIGNATURE_VIEW_ID ||
    id === 'warp-colors' ||
    (mapping === 'ripples' && ['honey', 'grass'].includes(id))
  )
    return 'water';
  return id;
}
