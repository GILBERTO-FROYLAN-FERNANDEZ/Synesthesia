import { baselineValues, readProperty } from '../../properties';
import type {
  MaterialMeta,
  PropertyDef,
  PropertyValues,
  VisualContext,
  VisualMaterial,
} from '../../types';
import type { SignatureFrame } from '../../../signature/types';
import {
  GlResources,
  createProgram,
  createTexture,
  bindTexture,
  resetPassState,
  resetUnpackState,
  type ShaderProgram,
} from '../shared/gl';
import { HueTurn, hueTurns } from '../shared/hue';
import { PALETTE_SIZE, WAKE_PALETTE_BYTES } from '../shared/wakePalette';
import { WATER_PALETTE_BYTES } from '../water/palettes';
import { HONEY_PALETTE_BYTES } from '../honey/palettes';
import { visualMappingProperties } from './properties';
import { HoneyStrands } from './HoneyStrands';
import { LineGeometry } from './LineGeometry';
import { LineSim, type LineParams } from './LineSim';
import { LINE_VERTEX, LINE_FRAGMENT } from './shaders';

/** The mapping owns the paths; the selected medium owns their light, width, and response. */
export class LinesMaterial implements VisualMaterial {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly properties: PropertyDef[];
  private readonly sim = new LineSim();
  private readonly honey: HoneyStrands | null;
  private thicknessBuffer: WebGLBuffer | null = null;
  private readonly geometry = new LineGeometry(this.sim.capacity);
  private gl: WebGL2RenderingContext | null = null;
  private resources: GlResources | null = null;
  private program: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffer: WebGLBuffer | null = null;
  private palette: WebGLTexture | null = null;
  private paletteIndex = -1;
  private values: PropertyValues;
  private readonly hue = new HueTurn();
  private readonly style: number;

  constructor(meta: MaterialMeta) {
    this.id = meta.id;
    this.name = meta.name;
    this.version = meta.version;
    this.description = meta.description;
    this.properties = visualMappingProperties(meta.properties, 'lines');
    this.values = baselineValues(this.properties);
    this.style = meta.id === 'honey' ? 1 : meta.id === 'smoke' ? 2 : meta.id === 'bubbles' ? 3 : 0;
    this.honey = this.style === 1 ? new HoneyStrands() : null;
  }

  init(ctx: VisualContext): Promise<void> {
    this.dispose();
    try {
      const gl = ctx.gl;
      this.gl = gl;
      this.resources = new GlResources(gl);
      this.program = createProgram(this.resources, LINE_VERTEX, LINE_FRAGMENT, {
        name: `${this.name} sampled lines`,
      });
      this.vao = this.resources.vertexArray();
      this.buffer = this.resources.buffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.geometry.instances.byteLength, gl.DYNAMIC_DRAW);
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 64, i * 16);
        gl.vertexAttribDivisor(i, 1);
      }
      this.thicknessBuffer = this.resources.buffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.thicknessBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.geometry.thickness.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 8, 0);
      gl.vertexAttribDivisor(4, 1);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.palette = createTexture(
        this.resources,
        PALETTE_SIZE,
        1,
        { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, channels: 4 },
        { filter: gl.LINEAR, wrap: gl.REPEAT, data: WAKE_PALETTE_BYTES },
      );
      this.sim.setCanvas(ctx.width, ctx.height);
      this.setProperties(baselineValues(this.properties));
      this.reset(ctx.seed);
      return Promise.resolve();
    } catch (error) {
      this.dispose();
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  reset(seed: number): void {
    this.sim.reset(seed);
    this.honey?.reset();
  }

  private value(id: string, fallback = 0.5): number {
    const def = this.properties.find((item) => item.id === id);
    return def ? readProperty(this.values, def) : fallback;
  }

  private params(): LineParams {
    const viscosity = this.value('viscosity');
    return {
      count: (12 + 84 * this.value('density')) * (this.style === 1 ? 0.5 : 1),
      ...(this.style === 2 ? { motionThreshold: 0.006, minimumTravel: 0.008 } : {}),
      range: this.value('range'),
      gain: 0.9 * 4 ** (2 * this.value('intensity') - 1) * (this.style === 1 ? 0.65 : 1),
      lag:
        (this.style === 1 ? 0.05 : 0.012) + (this.style === 1 ? 0.2 : 0.12) * viscosity * viscosity,
      scatter: this.value('dispersion') * 0.35,
      lifetime:
        0.25 * 16 ** this.value('persistence') * (this.style === 1 ? 3 : this.style === 2 ? 6 : 1),
    };
  }

  step(frame: SignatureFrame, props: PropertyValues, dt: number): void {
    this.setProperties(props);
    const params = this.params();
    this.sim.step(frame, params, dt);
    if (this.honey)
      this.honey.step(
        this.sim,
        { lifetime: params.lifetime, viscosity: this.value('viscosity') },
        dt,
      );
  }

  setProperties(props: PropertyValues): void {
    this.values = props;
    const gl = this.gl;
    const index = this.value('palette', 0);
    if (!gl || !this.palette || index === this.paletteIndex) return;
    const palettes = this.style === 1 ? HONEY_PALETTE_BYTES : WATER_PALETTE_BYTES;
    const bytes = this.style === 3 ? WAKE_PALETTE_BYTES : (palettes[index] ?? palettes[0]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.palette);
    resetUnpackState(gl);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PALETTE_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    this.paletteIndex = index;
  }

  draw(): void {
    const gl = this.gl,
      program = this.program;
    if (!gl || !program || !this.buffer || !this.vao || gl.isContextLost()) return;
    resetPassState(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const lifetime = this.params().lifetime;
    const fall = this.style === 3 ? 0.005 + this.value('fallSpeed') * 0.025 : 0;
    const count = this.geometry.build(this.honey ?? this.sim, lifetime, this.style, fall);
    if (count === 0) return;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.geometry.instances, 0, count * 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.thicknessBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.geometry.thickness, 0, count * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    program.use();
    gl.uniform2f(program.u('uWorld'), this.sim.worldWidth, this.sim.worldHeight);
    gl.uniform1f(
      program.u('uWidth'),
      0.001 * (this.style === 2 ? 3 : 1) * 5 ** (2 * this.value('size')),
    );
    gl.uniform1f(program.u('uStyle'), this.style);
    gl.uniform1f(program.u('uExposure'), 1.6 * 2 ** (2.4 * (this.value('brightness') - 0.5)));
    gl.uniform1f(program.u('uSurfaceLight'), this.value('surfaceLight'));
    this.hue.apply(gl, program.u('uHueTurn'), hueTurns(this.value('hue')));
    gl.uniform1i(program.u('uPalette'), bindTexture(gl, 0, this.palette as WebGLTexture));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    const oldWidth = this.sim.worldWidth,
      oldHeight = this.sim.worldHeight;
    this.sim.setCanvas(width, height);
    this.honey?.resize(this.sim.worldWidth / oldWidth, this.sim.worldHeight / oldHeight);
  }
  dispose(): void {
    this.resources?.dispose();
    this.resources = null;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.buffer = null;
    this.thicknessBuffer = null;
    this.palette = null;
    this.paletteIndex = -1;
  }
}
