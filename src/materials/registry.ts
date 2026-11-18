/**
 * Material registry (SPEC 9.1). Materials register in visual/index.ts and
 * sound/index.ts; everything else looks them up here.
 */
import { SOUND_MATERIALS } from './sound';
import type { SoundMaterialEntry, VisualMaterialEntry, VisualMapping } from './types';
import { VISUAL_MATERIALS } from './visual';
import { isWarpScene } from './visual/warping';
import { withVisualMapping } from './visual/mappedMaterial';
const INSTALLED_VISUAL_MATERIALS = VISUAL_MATERIALS.map(withVisualMapping);

/** The diagnostic "bare wake" view; selectable separately from the mediums. */
export const SIGNATURE_VIEW_ID = 'signature';
export const DEFAULT_VISUAL_ID = 'water';
export const DEFAULT_SOUND_ID = 'water';

export function listVisualMaterials(mapping?: VisualMapping): readonly VisualMaterialEntry[] {
  // Retain lookup support for saved Filaments compositions, but don't offer it
  // in medium pickers or pools used to create new compositions.
  return INSTALLED_VISUAL_MATERIALS.filter((entry) =>
    mapping === 'warping'
      ? isWarpScene(entry.meta.id)
      : entry.meta.id !== 'filaments' && !isWarpScene(entry.meta.id),
  );
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
  if (mapping === 'warping') return isWarpScene(id) ? id : 'warp-colors';
  if (isWarpScene(id) || (mapping === 'ripples' && id === 'honey')) return 'water';
  return id;
}
