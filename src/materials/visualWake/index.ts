// Original full-field wake renderers from the sound-grid branch. Kept separate
// from the redesigned Push, sampled Lines and Ripple renderers.
import { waterEntry } from './water';
import { honeyEntry } from './honey';
import { smokeEntry } from './smoke';
import { bubblesEntry } from './bubbles';
import type { VisualMaterialEntry } from '../types';
const entries: readonly VisualMaterialEntry[] = [waterEntry, honeyEntry, smokeEntry, bubblesEntry];
export function getWakeMaterial(id: string): VisualMaterialEntry | undefined {
  return entries.find((entry) => entry.meta.id === id);
}
