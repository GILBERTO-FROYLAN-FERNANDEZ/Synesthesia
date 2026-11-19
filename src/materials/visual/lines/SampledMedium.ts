import { readProperty } from '../../properties';
import type {
  PropertyValues,
  VisualContext,
  VisualMaterial,
  VisualMaterialEntry,
} from '../../types';
import type { SignatureFrame } from '../../../signature/types';
import { LineSim } from './LineSim';
import { PathField } from './PathField';
import { visualMappingProperties } from './properties';

/** Paths select where forces act. The medium's own simulation produces the result. */
export class SampledMedium implements VisualMaterial {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly properties;
  private readonly source = new LineSim();
  private readonly field = new PathField();
  private readonly medium: VisualMaterial;

  constructor(entry: VisualMaterialEntry) {
    this.id = entry.meta.id;
    this.name = entry.meta.name;
    this.version = entry.meta.version;
    this.description = entry.meta.description;
    this.properties = visualMappingProperties(entry.meta.properties, 'lines');
    this.medium = entry.create();
  }
  async init(ctx: VisualContext): Promise<void> {
    this.source.setCanvas(ctx.width, ctx.height);
    this.field.resize(this.source.worldWidth, this.source.worldHeight);
    await this.medium.init(ctx);
    this.reset(ctx.seed);
  }
  reset(seed: number): void {
    this.source.reset(seed);
    this.medium.reset(seed);
    this.field.field.fill(0);
  }
  private value(props: PropertyValues, id: string, fallback = 0.5): number {
    const def = this.properties.find((item) => item.id === id);
    return def ? readProperty(props, def) : fallback;
  }
  step(frame: SignatureFrame, props: PropertyValues, dt: number): void {
    this.source.step(
      frame,
      {
        count: 12 + 84 * this.value(props, 'density'),
        range: this.value(props, 'range'),
        gain: 0.9,
        lag: 0.012 + 0.12 * this.value(props, 'viscosity') ** 2,
        scatter: 0.35 * this.value(props, 'dispersion'),
        lifetime: 0.3,
      },
      dt,
    );
    const sparse = this.field.build(this.source, 0.008 + 0.04 * this.value(props, 'size') ** 2, dt);
    // The sparse field already lies in canvas coordinates; don't project it a second time.
    this.medium.step(
      { ...frame, field: sparse.field, cols: sparse.cols, rows: sparse.rows },
      { ...props, range: 0.5 },
      dt,
    );
  }
  setProperties(props: PropertyValues): void {
    this.medium.setProperties?.({ ...props, range: 0.5 });
  }
  draw(): void {
    this.medium.draw();
  }
  resize(width: number, height: number): void {
    this.source.setCanvas(width, height);
    this.field.resize(this.source.worldWidth, this.source.worldHeight);
    this.medium.resize(width, height);
  }
  dispose(): void {
    this.medium.dispose();
  }
}
