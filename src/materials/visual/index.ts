import type { VisualMaterialEntry } from '../types';
import { bubblesEntry } from './bubbles';
import { filamentsEntry } from './filaments';
import { honeyEntry } from './honey';
import { signatureViewEntry } from './signature-view';
import { smokeEntry } from './smoke';
import { waterEntry } from './water';

/**
 * Every visual material, in picker order. V0 "Signature" (the diagnostic view) is
 * listed separately from the expressive materials.
 */
export const VISUAL_MATERIALS: VisualMaterialEntry[] = [
  waterEntry,
  honeyEntry,
  smokeEntry,
  bubblesEntry,
  filamentsEntry,
  signatureViewEntry,
];
