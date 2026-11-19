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
import { LiquifySim } from './LiquifySim';
import { WarpSim } from './WarpSim';
import { BubblesMaterial } from '../bubbles/BubblesMaterial';
import { WARP_VERTEX, WARP_FRAGMENT } from './shaders';

const properties = [
  sharedProperty('viscosity', 'visual', {
    description: 'How strongly the scene resists bending and stretching.',
  }),
  sharedProperty('persistence', 'visual', {
    description: 'How slowly the scene returns to rest after movement.',
  }),
  sharedProperty('intensity', 'visual', {
    description: 'How strongly movement deforms the scene.',
  }),
  sharedProperty('density', 'visual', {
    description: 'How many patches, blades, or bubbles fill the scene.',
  }),
  sharedProperty('brightness', 'visual'),
  sharedProperty('range', 'visual'),
  {
    id: 'size',
    label: 'Scene scale',
    description: 'The scale of elements in the scene.',
    kind: 'continuous' as const,
    shared: false,
    default: 0.5,
    primary: false,
  },
  hueProperty('Shift the scene colors around the color wheel.'),
];
const scenes = [
  {
    id: 'warp-colors',
    name: 'Color field',
    description: 'Color patches bulge and compress as movement passes, then gently relax.',
  },
  {
    id: 'warp-grass',
    name: 'Grass',
    description: 'Rooted blades bend with the movement and spring back into place.',
  },
  {
    id: 'warp-bubbles',
    name: 'Falling bubbles',
    description: 'Bubbles fall freely and pop where movement touches them.',
  },
];
export const isWarpScene = (id: string): boolean => scenes.some((scene) => scene.id === id);

class WarpMaterial implements VisualMaterial {
  readonly id;
  readonly name;
  readonly description;
  readonly version = 1;
  readonly properties = properties;
  private readonly sim = new WarpSim();
  private readonly liquify = new LiquifySim();
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
  constructor(private scene: number) {
    Object.assign(this, scenes[scene]);
    this.id = scenes[scene].id;
    this.name = scenes[scene].name;
    this.description = scenes[scene].description;
  }
  init(ctx: VisualContext): Promise<void> {
    this.dispose();
    try {
      const gl = ctx.gl,
        res = new GlResources(gl);
      this.gl = gl;
      this.res = res;
      this.program = createProgram(res, WARP_VERTEX, WARP_FRAGMENT, { name: this.name });
      this.screen = createFullscreenTriangle(res);
      this.texture = createTexture(
        res,
        (this.scene === 0 ? this.liquify : this.sim).cols,
        (this.scene === 0 ? this.liquify : this.sim).rows,
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
    this.liquify.reset();
  }
  setProperties(props: PropertyValues): void {
    this.values = props;
  }
  step(frame: SignatureFrame, props: PropertyValues, dt: number): void {
    this.values = props;
    const simulation = this.scene === 0 ? this.liquify : this.sim;
    simulation.step(
      frame,
      this.width,
      this.height,
      this.value('intensity'),
      this.value('persistence'),
      this.value('viscosity'),
      this.value('range'),
      dt,
      this.scene === 1 ? 'grass' : 'normal',
    );
  }
  draw(): void {
    const gl = this.gl,
      p = this.program;
    if (!gl || !p || !this.screen || !this.texture || gl.isContextLost()) return;
    resetPassState(gl);
    p.use();
    gl.uniform1i(p.u('uField'), bindTexture(gl, 0, this.texture));
    const simulation = this.scene === 0 ? this.liquify : this.sim;
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
    gl.uniform2f(p.u('uFocus'), this.sim.focus[0], this.sim.focus[1]);
    gl.uniform1f(p.u('uScene'), this.scene);
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
export const WARP_MATERIALS: VisualMaterialEntry[] = scenes.map((scene, i) => ({
  kind: 'visual',
  meta: { ...scene, version: 1, properties },
  create: () => (i === 2 ? new FallingWarpBubbles() : new WarpMaterial(i)),
}));

class FallingWarpBubbles implements VisualMaterial {
  readonly id = 'warp-bubbles';
  readonly name = scenes[2].name;
  readonly description = scenes[2].description;
  readonly version = 1;
  readonly properties = properties;
  private readonly medium = new BubblesMaterial();
  init(ctx: VisualContext): Promise<void> {
    return this.medium.init({ ...ctx, mapping: 'warping' });
  }
  reset(seed: number): void {
    this.medium.reset(seed);
  }
  step(frame: SignatureFrame, props: PropertyValues, dt: number): void {
    this.medium.step(frame, { ...props, dispersion: 0.7 }, dt);
  }
  setProperties(props: PropertyValues): void {
    this.medium.setProperties(props);
  }
  draw(): void {
    this.medium.draw();
  }
  resize(w: number, h: number): void {
    this.medium.resize(w, h);
  }
  dispose(): void {
    this.medium.dispose();
  }
}
