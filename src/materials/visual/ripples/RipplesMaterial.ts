import type { SignatureFrame } from '../../../signature/types';
import { baselineValues, readProperty } from '../../properties';
import type { MaterialMeta, PropertyValues, VisualContext, VisualMaterial } from '../../types';
import { GlResources, createProgram, resetPassState, type ShaderProgram } from '../shared/gl';
import {
  createRenderTarget,
  detectRenderTargets,
  deleteRenderTarget,
  bindTexture,
  createFullscreenTriangle,
  type RenderTarget,
  type FullscreenTriangle,
} from '../shared/gl';
import { HueTurn, hueTurns } from '../shared/hue';
import { WATER_PALETTE_BYTES } from '../water/palettes';
import { HONEY_PALETTE_BYTES } from '../honey/palettes';
import { RippleSim } from './RippleSim';
import { visualMappingProperties } from '../lines/properties';
import {
  RIPPLE_FRAGMENT,
  RIPPLE_VERTEX,
  HONEY_SURFACE_FRAGMENT,
  HONEY_SURFACE_VERTEX,
} from './shaders';

/** One event source shared by live preview, playback, stills, and export. */
export class RipplesMaterial implements VisualMaterial {
  readonly id;
  readonly name;
  readonly version;
  readonly description;
  readonly properties;
  private readonly sim = new RippleSim();
  private readonly instances = new Float32Array(this.sim.capacity * 8);
  private readonly hue = new HueTurn();
  private readonly style: number;
  private values: PropertyValues;
  private gl: WebGL2RenderingContext | null = null;
  private resources: GlResources | null = null;
  private program: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private honeyTarget: RenderTarget | null = null;
  private honeySurface: ShaderProgram | null = null;
  private screen: FullscreenTriangle | null = null;
  private buffer: WebGLBuffer | null = null;

  constructor(meta: MaterialMeta) {
    this.id = meta.id;
    this.name = meta.name;
    this.version = meta.version;
    this.description = meta.description;
    this.properties = visualMappingProperties(meta.properties, 'ripples');
    this.values = baselineValues(this.properties);
    this.style = meta.id === 'honey' ? 1 : meta.id === 'smoke' ? 2 : meta.id === 'bubbles' ? 3 : 0;
  }
  init(ctx: VisualContext): Promise<void> {
    this.dispose();
    try {
      this.gl = ctx.gl;
      const gl = ctx.gl,
        res = new GlResources(gl);
      this.resources = res;
      this.program = createProgram(res, RIPPLE_VERTEX, RIPPLE_FRAGMENT, {
        name: `${this.name} ripples`,
      });
      if (this.style === 1) {
        this.honeySurface = createProgram(res, HONEY_SURFACE_VERTEX, HONEY_SURFACE_FRAGMENT, {
          name: 'pooled honey surface',
        });
        this.screen = createFullscreenTriangle(res);
      }
      this.vao = res.vertexArray();
      this.buffer = res.buffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.instances.byteLength, gl.DYNAMIC_DRAW);
      for (let i = 0; i < 2; i++) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 32, i * 16);
        gl.vertexAttribDivisor(i, 1);
      }
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.sim.setCanvas(ctx.width, ctx.height);
      this.reset(ctx.seed);
      return Promise.resolve();
    } catch (error) {
      this.dispose();
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  private value(id: string, fallback = 0.5): number {
    const def = this.properties.find((item) => item.id === id);
    return def ? readProperty(this.values, def) : fallback;
  }
  private lifetime(): number {
    return (
      0.65 * 10 ** this.value('persistence') * (this.style === 1 ? 1.4 : this.style === 2 ? 2.2 : 1)
    );
  }
  reset(seed: number): void {
    this.sim.reset(seed);
  }
  setProperties(props: PropertyValues): void {
    this.values = props;
  }
  step(frame: SignatureFrame, props: PropertyValues, dt: number): void {
    this.values = props;
    this.sim.step(
      frame,
      {
        density: this.value('density'),
        emissionScale: this.style === 2 ? 0.28 : this.style === 3 ? 0.6 : 1,
        independentTiming: this.style === 2,
        intensity: this.value('intensity'),
        range: this.value('range'),
        lifetime: this.lifetime(),
      },
      dt,
    );
  }
  draw(): void {
    const gl = this.gl,
      program = this.program;
    if (!gl || !program || !this.vao || !this.buffer || gl.isContextLost()) return;
    resetPassState(gl);
    if (this.style === 1 && this.resources) {
      const w = Math.min(960, gl.drawingBufferWidth),
        h = Math.max(1, Math.round((w * gl.drawingBufferHeight) / gl.drawingBufferWidth));
      if (!this.honeyTarget || this.honeyTarget.width !== w || this.honeyTarget.height !== h) {
        if (this.honeyTarget) deleteRenderTarget(this.resources, this.honeyTarget);
        const support = detectRenderTargets(gl);
        this.honeyTarget = createRenderTarget(
          this.resources,
          w,
          h,
          support?.type === gl.HALF_FLOAT
            ? support.rgba
            : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, channels: 4 },
          gl.LINEAR,
        );
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const lifetime = this.lifetime();
    const scale = 0.055 * 4 ** this.value('size');
    const speed =
      (0.55 + 0.9 * (1 - this.value('viscosity'))) *
      (this.style === 1 ? 0.7 : this.style === 2 ? 0.45 : 1);
    for (let i = 0; i < this.sim.count; i++) {
      const age = this.sim.age[i],
        fraction = Math.min(1, age / (lifetime * this.sim.durationScale[i]));
      const radius =
        scale *
        (this.style === 1
          ? 0.24 + 0.7 * (1 - Math.exp(-speed * age))
          : (this.style === 2
              ? 0.04 + 0.04 * this.sim.phase[i] * (0.5 + this.value('dispersion'))
              : 0.06) +
            speed * age) *
        (this.style === 2 ? 1 : 1 + (this.sim.phase[i] - 0.5) * this.value('dispersion') * 0.3);
      const width =
        this.style === 3
          ? 0.012 + 0.018 * this.value('size')
          : (this.style === 1
              ? 0.011
              : this.style === 2
                ? 0.005 * (0.65 + 1.3 * fraction)
                : 0.006) *
            (0.6 + this.value('size'));
      const outer =
        this.style === 3
          ? radius * 1.3
          : this.style === 1
            ? radius * 1.25 + width * 3
            : this.style === 2
              ? radius * 1.55 + width * 6
              : radius + width * 3;
      const at = i * 8;
      this.instances[at] = this.sim.x[i];
      this.instances[at + 1] =
        this.sim.y[i] +
        (this.style === 2
          ? age * 0.007
          : this.style === 1
            ? -radius * 0.08 * (1 - Math.exp(-age))
            : 0);
      this.instances[at + 2] = outer;
      this.instances[at + 3] = fraction;
      this.instances[at + 4] = this.sim.strength[i];
      this.instances[at + 5] = this.sim.phase[i];
      this.instances[at + 6] = width / outer;
      this.instances[at + 7] = radius / outer;
    }
    if (!this.sim.count) return;
    if (this.style === 1 && this.honeyTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.honeyTarget.fbo);
      gl.viewport(0, 0, this.honeyTarget.width, this.honeyTarget.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instances, 0, this.sim.count * 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    program.use();
    gl.uniform2f(program.u('uWorld'), this.sim.worldWidth, this.sim.worldHeight);
    gl.uniform1f(program.u('uStyle'), this.style);
    gl.uniform1f(program.u('uExposure'), 1.5 * 2 ** (2.4 * (this.value('brightness') - 0.5)));
    gl.uniform1f(program.u('uSurfaceLight'), this.value('surfaceLight'));
    this.hue.apply(gl, program.u('uHueTurn'), hueTurns(this.value('hue')));
    const palettes = this.style === 1 ? HONEY_PALETTE_BYTES : WATER_PALETTE_BYTES;
    const palette = palettes[this.value('palette', 0)] ?? palettes[0];
    gl.uniform3f(program.u('uTint'), palette[128] / 255, palette[129] / 255, palette[130] / 255);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, this.style === 1 ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.sim.count);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    if (this.style === 1 && this.honeyTarget && this.honeySurface && this.screen) {
      const p = this.honeySurface;
      p.use();
      gl.uniform1i(p.u('uHeight'), bindTexture(gl, 0, this.honeyTarget.texture));
      gl.uniform2f(p.u('uTexel'), this.honeyTarget.texelSizeX, this.honeyTarget.texelSizeY);
      gl.uniform1f(p.u('uExposure'), 1.5 * 2 ** (2.4 * (this.value('brightness') - 0.5)));
      gl.uniform1f(p.u('uSurfaceLight'), this.value('surfaceLight'));
      gl.uniform3f(p.u('uTint'), palette[128] / 255, palette[129] / 255, palette[130] / 255);
      this.hue.apply(gl, p.u('uHueTurn'), hueTurns(this.value('hue')));
      this.screen.blit(null);
      gl.bindVertexArray(null);
    }
  }
  resize(width: number, height: number): void {
    this.sim.setCanvas(width, height);
  }
  dispose(): void {
    this.resources?.dispose();
    this.honeyTarget = null;
    this.honeySurface = null;
    this.screen = null;
    this.resources = null;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.buffer = null;
  }
}
