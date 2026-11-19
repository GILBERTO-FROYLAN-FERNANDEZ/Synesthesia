import type { VisualMaterialEntry } from '../types';
import { bubblesEntry } from './bubbles';
import { filamentsEntry } from './filaments';
import { honeyEntry } from './honey';
import { signatureViewEntry } from './signature-view';
import { smokeEntry } from './smoke';
import { WARP_MATERIALS } from './warping';
import { waterEntry } from './water';

/**
 * Installed visual materials, including retired ones needed by saved compositions.
 * The registry determines which are offered in pickers.
 */
export const VISUAL_MATERIALS: VisualMaterialEntry[] = [
  waterEntry,
  honeyEntry,
  smokeEntry,
  bubblesEntry,
  filamentsEntry,
  signatureViewEntry,
  ...WARP_MATERIALS,
];
