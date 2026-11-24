import type { PropertyValues, VisualContext, VisualMaterial, VisualMaterialEntry } from '../types';
import type { SignatureFrame } from '../../signature/types';
import { RipplesMaterial } from './ripples/RipplesMaterial';
import { SampledMedium } from './lines/SampledMedium';
import { LinesMaterial } from './lines/LinesMaterial';
import { getWakeMaterial } from '../visualWake';

/** Resolve the mapping at init, so preview, stills, and exports use the same renderer. */
export function withVisualMapping(entry: VisualMaterialEntry): VisualMaterialEntry {
  return {
    ...entry,
    create: () => {
      let renderer: VisualMaterial | null = null;
      return {
        ...entry.meta,
        get properties() {
          return renderer?.properties ?? entry.meta.properties;
        },
        async init(ctx: VisualContext) {
          renderer?.dispose();
          const wake = ctx.mapping === 'wake' ? getWakeMaterial(entry.meta.id) : undefined;
          renderer =
            wake
              ? wake.create()
              : ctx.mapping === 'sampled-displacement' && entry.meta.id !== 'signature'
              ? new SampledMedium(entry, true)
              : ctx.mapping === 'ripples' &&
                  entry.meta.id !== 'signature' &&
                  entry.meta.id !== 'grass'
                ? new RipplesMaterial(entry.meta)
                : ctx.mapping === 'lines' &&
                    entry.meta.id !== 'signature' &&
                    entry.meta.id !== 'grass'
                  ? ['water', 'honey'].includes(entry.meta.id)
                    ? new SampledMedium(entry)
                    : entry.meta.id === 'bubbles'
                      ? entry.create()
                      : new LinesMaterial(entry.meta)
                  : entry.create();
          await renderer.init(ctx);
        },
        reset(seed: number) {
          renderer?.reset(seed);
        },
        step(frame: SignatureFrame, props: PropertyValues, dt: number) {
          renderer?.step(frame, props, dt);
        },
        setProperties(props: PropertyValues) {
          renderer?.setProperties?.(props);
        },
        draw() {
          renderer?.draw();
        },
        resize(width: number, height: number) {
          renderer?.resize(width, height);
        },
        dispose() {
          renderer?.dispose();
          renderer = null;
        },
      };
    },
  };
}
