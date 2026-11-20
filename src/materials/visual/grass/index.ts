import type { SignatureFrame } from '../../../signature/types';
import { baselineValues, readProperty, sharedProperty, hueProperty } from '../../properties';
import type {
  VisualMaterial,
  VisualMaterialEntry,
  VisualContext,
  PropertyValues,
} from '../../types';
import {
  GlResources,
  createProgram,
  createTexture,
  bindTexture,
  createFullscreenTriangle,
  resetPassState,
  type ShaderProgram,
  type FullscreenTriangle,
} from '../shared/gl';
import { HueTurn, hueTurns } from '../shared/hue';
import { GrassSim } from './GrassSim';
import { GRASS_VERTEX, GRASS_FRAGMENT } from './shaders';

const properties = [
  sharedProperty('viscosity', 'visual', {
    description: 'How strongly the grass resists bending and stretching.',
  }),
  sharedProperty('persistence', 'visual', {
    description: 'How slowly the grass returns to rest after movement.',
  }),
  sharedProperty('intensity', 'visual', {
    description: 'How strongly movement deforms the grass.',
  }),
  sharedProperty('density', 'visual', {
    description: 'How densely blades fill the field.',
  }),
  sharedProperty('brightness', 'visual'),
  sharedProperty('range', 'visual'),
  {
    id: 'size',
    label: 'Blade size',
    description: 'The length of each grass blade.',
    kind: 'continuous' as const,
    shared: false,
    default: 0.5,
    primary: false,
  },
  hueProperty('Shift the grass colors around the color wheel.'),
];
export const GRASS_META = {
  id: 'grass',
  name: 'Grass',
  version: 5,
  description:
    'Rooted grass bends with full movement or sampled paths and springs back into place.',
  properties,
};
class GrassMaterial implements VisualMaterial {
  readonly id = GRASS_META.id;
  readonly name = GRASS_META.name;
  readonly description = GRASS_META.description;
  readonly version = GRASS_META.version;
  readonly properties = properties;
  private readonly sim = new GrassSim();
  private readonly hue = new HueTurn();
  private values = baselineValues(properties);
  private width = 1600;
  private height = 900;
  private seed = 0;
  private gl: WebGL2RenderingContext | null = null;
  private res: GlResources | null = null;
  private program: ShaderProgram | null = null;
  private screen: FullscreenTriangle | null = null;
  private texture: WebGLTexture | null = null;
  init(ctx: VisualContext): Promise<void> {
    this.dispose();
    try {
      const gl = ctx.gl,
        res = new GlResources(gl);
      this.gl = gl;
      this.res = res;
      this.program = createProgram(res, GRASS_VERTEX, GRASS_FRAGMENT, { name: this.name });
      this.screen = createFullscreenTriangle(res);
      this.texture = createTexture(
        res,
        this.sim.cols,
        this.sim.rows,
        { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, channels: 4 },
        { filter: gl.NEAREST },
      );
      this.resize(ctx.width, ctx.height);
      this.reset(ctx.seed);
      return Promise.resolve();
    } catch (error) {
      this.dispose();
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  private value(id: string): number {
    return readProperty(
      this.values,
      properties.find((p) => p.id === id)!,
    );
  }
  reset(seed: number): void {
    this.seed = seed;
    this.sim.reset();
  }
  setProperties(props: PropertyValues): void {
    this.values = props;
  }
  step(frame: SignatureFrame, props: PropertyValues, dt: number): void {
    this.values = props;
    const simulation = this.sim;
    simulation.step(
      frame,
      this.width,
      this.height,
      this.value('intensity'),
      this.value('persistence'),
      this.value('viscosity'),
      this.value('range'),
      dt,
      'grass',
    );
  }
  draw(): void {
    const gl = this.gl,
      p = this.program;
    if (!gl || !p || !this.screen || !this.texture || gl.isContextLost()) return;
    resetPassState(gl);
    p.use();
    gl.uniform1i(p.u('uField'), bindTexture(gl, 0, this.texture));
    const simulation = this.sim;
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      simulation.cols,
      simulation.rows,
      gl.RGBA,
      gl.FLOAT,
      simulation.data,
    );
    const short = Math.min(this.width, this.height);
    gl.uniform2f(p.u('uWorld'), this.width / short, this.height / short);
    gl.uniform2f(p.u('uResolution'), this.width, this.height);
    gl.uniform1f(p.u('uSeed'), this.seed % 10000);
    gl.uniform1f(p.u('uDensity'), this.value('density'));
    gl.uniform1f(p.u('uSize'), this.value('size'));
    gl.uniform1f(p.u('uBrightness'), this.value('brightness'));
    this.hue.apply(gl, p.u('uHueTurn'), hueTurns(this.value('hue')));
    this.screen.blit(null);
    gl.bindVertexArray(null);
  }
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }
  dispose(): void {
    this.res?.dispose();
    this.res = null;
    this.gl = null;
    this.program = null;
    this.screen = null;
    this.texture = null;
  }
}
export const grassEntry: VisualMaterialEntry = {
  kind: 'visual',
  meta: GRASS_META,
  create: () => new GrassMaterial(),
};
