import type { PropertyDef, VisualMapping } from '../../types';

const DESCRIPTIONS: Record<string, string> = {
  viscosity: 'How much the medium resists and smooths the sampled movement.',
  persistence: 'How long the sampled trails remain before fading.',
  dispersion: 'How widely the strokes sample and scatter within the movement.',
  intensity: 'How strongly the sampled movement acts on the medium.',
  density: 'How many moving points leave trails at once.',
  brightness: 'How bright the sampled trails appear.',
  size: 'How thick the lines or bubble trails are.',
  palette: 'The colors of the sampled trails.',
  surfaceLight: 'Light catching the body of each stroke.',
  fallSpeed: 'How quickly bubble trails drift downward as they fade.',
};

/** Mapping controls keep the same property IDs for linking, saving, and chance. */
export function visualMappingProperties(
  defs: readonly PropertyDef[],
  mapping?: VisualMapping,
): PropertyDef[] {
  if (
    (mapping !== 'lines' && mapping !== 'ripples') ||
    defs.length === 0 ||
    defs.some((def) => def.id === 'showReadout')
  )
    return [...defs];
  const descriptions =
    mapping === 'ripples'
      ? {
          ...DESCRIPTIONS,
          density: 'How frequently movement generates ripples.',
          intensity: 'How strong each ripple appears.',
          persistence: 'How long each ripple expands before fading.',
          viscosity: 'How slowly the ripples spread.',
          size: 'The scale of the expanding ripples.',
          dispersion: 'How varied and irregular the expanding effects are.',
          fallSpeed: 'How quickly emitted bubble clusters fall.',
        }
      : DESCRIPTIONS;
  const sizeLabel = mapping === 'ripples' ? 'Ripple size' : 'Line width';
  const supported = new Set([
    'viscosity',
    'persistence',
    'dispersion',
    'intensity',
    'density',
    'brightness',
    'hue',
    'palette',
    'size',
    'surfaceLight',
    'fallSpeed',
  ]);
  if (mapping === 'ripples') {
    supported.add('range');
    supported.delete('fallSpeed');
  }
  const result = defs
    .filter((def) => supported.has(def.id))
    .map((def) => ({
      ...def,
      description: descriptions[def.id] ?? def.description,
      ...(def.id === 'size' ? { label: sizeLabel } : {}),
    }));
  if (!result.some((def) => def.id === 'size')) {
    const hueIndex = result.findIndex((def) => def.id === 'hue');
    result.splice(hueIndex < 0 ? result.length : hueIndex, 0, {
      id: 'size',
      label: sizeLabel,
      description: descriptions.size,
      kind: 'continuous',
      shared: false,
      default: 0.5,
      primary: false,
    });
  }
  return result;
}
