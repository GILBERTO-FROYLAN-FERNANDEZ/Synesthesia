import { AudioEngine } from '../../engine/audio/AudioEngine';
import { soundSeed, visualRng, visualSeed } from '../../engine/seeds';
import { baselineValues } from '../../materials/properties';
import { getSoundMaterial, getVisualMaterial } from '../../materials/registry';
import { FIXED_DT, type PropertyValues, type VisualMaterial } from '../../materials/types';
import { getVisualContext, releaseVisualContext } from '../../materials/visual/shared/gl';
import type { SignatureFrame, SignatureSampler } from '../../signature/types';
import type { RecordedPart } from './liveSession';
import { LiveMotionActivity } from './liveActivity';
import { LiveMotionTracker } from './liveMotion';

class LiveSampler implements SignatureSampler {
  readonly duration = 86_400;
  readonly signatureDuration = 86_400;
  readonly config = {
    speed: 1,
    loops: 1,
    tailSec: 0,
    loopMode: 'loop' as const,
    smoothing: 0,
    strength: 1,
  };
  frame: SignatureFrame;

  constructor(frame: SignatureFrame) {
    this.frame = frame;
  }
  configure(): void {}
  sample(t: number): SignatureFrame {
    return { ...this.frame, t };
  }
  onsetsBetween(): number[] {
    return [];
  }
}

function supportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

interface RecorderState {
  recorder: MediaRecorder;
  chunks: Blob[];
  result: Promise<RecordedPart>;
  stream: MediaStream;
}

export interface LiveVisualSelection {
  id: string;
  fallbackFrom?: string;
}

function recorderFor(stream: MediaStream, mimeType: string): RecorderState {
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  let resolve!: (part: RecordedPart) => void;
  let reject!: (error: Error) => void;
  const result = new Promise<RecordedPart>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onerror = () => reject(new Error('The browser stopped the recording unexpectedly.'));
  recorder.onstop = () => {
    const type = recorder.mimeType || mimeType || 'video/webm';
    resolve({ blob: new Blob(chunks, { type }), mimeType: type });
    stream.getTracks().forEach((track) => track.stop());
  };
  return { recorder, chunks, result, stream };
}

export class LivePerformanceRuntime {
  readonly tracker: LiveMotionTracker;
  readonly canvas: HTMLCanvasElement;
  readonly context: AudioContext;
  readonly audioDestination: MediaStreamAudioDestinationNode;

  private readonly cameraStream: MediaStream;
  private readonly gl: WebGL2RenderingContext;
  private readonly sampler: LiveSampler;
  private readonly output: GainNode;
  private readonly activityGain: GainNode;
  private readonly activity = new LiveMotionActivity();
  private sensitivity = 1;
  private audible = false;
  private audio: AudioEngine;
  private visual: VisualMaterial | null = null;
  private visualProps: PropertyValues = {};
  private intensity = 1;
  private raf = 0;
  private lastFrame = 0;
  private generatedRecorder: RecorderState | null = null;
  private sourceRecorder: RecorderState | null = null;
  private recordStarted = 0;
  private finalizedGenerated: RecordedPart | null = null;
  private finalizedSource: RecordedPart | null = null;
  private stopped = false;
  private recordingProblem: string | null = null;
  onMotion: ((frame: SignatureFrame) => void) | null = null;
  onActivity: ((active: boolean) => void) | null = null;
  onTrackingMode: ((mode: 'body' | 'block') => void) | null = null;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement, cameraStream: MediaStream) {
    this.cameraStream = cameraStream;
    this.canvas = canvas;
    this.canvas.width = 1280;
    this.canvas.height = 720;
    const gl = getVisualContext(canvas);
    if (!gl) throw new Error('WebGL 2 is required for live performance visuals.');
    this.gl = gl;
    this.context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
    this.audioDestination = this.context.createMediaStreamDestination();
    this.output = this.context.createGain();
    this.activityGain = this.context.createGain();
    this.activityGain.gain.value = 0;
    this.output.connect(this.activityGain);
    this.activityGain.connect(this.context.destination);
    this.activityGain.connect(this.audioDestination);
    this.audio = new AudioEngine({ context: this.context, destination: this.output, masterGain: 1 });
    this.tracker = new LiveMotionTracker(video);
    this.sampler = new LiveSampler(this.tracker.latest);
    this.tracker.onFrame = (frame) => {
      this.sampler.frame = frame;
      this.audio.timelineChanged();
      this.updateActivity(this.activity.update(frame.features.energy, performance.now(), this.sensitivity));
      this.onMotion?.(frame);
    };
    this.tracker.onTrackingMode = (mode) => this.onTrackingMode?.(mode);
  }

  get recording(): boolean {
    return this.generatedRecorder?.recorder.state === 'recording';
  }

  get recordingDuration(): number {
    return this.recording ? (performance.now() - this.recordStarted) / 1000 : 0;
  }

  get recordingError(): string | null {
    return this.recordingProblem;
  }

  async start(options: {
    visualId: string;
    soundId: string;
    intensity: number;
    volume: number;
    muted: boolean;
    sensitivity: number;
  }): Promise<LiveVisualSelection> {
    this.intensity = options.intensity;
    this.setSensitivity(options.sensitivity);
    this.setVolume(options.volume);
    const visual = await this.setVisual(options.visualId);
    if (this.stopped) return visual;
    await this.setSound(options.soundId);
    if (this.stopped) return visual;
    this.setMuted(options.muted);
    this.tracker.start();
    await this.audio.play(0);
    this.raf = requestAnimationFrame(this.draw);
    return visual;
  }

  async setVisual(id: string): Promise<LiveVisualSelection> {
    const requested = getVisualMaterial(id);
    if (!requested) throw new Error('That visual material is unavailable.');
    // Fluid materials need floating-point render targets. Bubbles draws with ordinary
    // WebGL2 buffers, so it can keep the live motion visible on less capable GPUs.
    const candidates = [id, 'bubbles', 'signature'].filter((value, index, list) =>
      list.indexOf(value) === index,
    );
    let failure: unknown;
    for (const candidate of candidates) {
      const entry = getVisualMaterial(candidate);
      if (!entry) continue;
      const material = entry.create();
      try {
        await material.init({
          gl: this.gl,
          width: this.canvas.width,
          height: this.canvas.height,
          quality: 'standard',
          seed: 42,
          rng: visualRng(42),
        });
        if (this.stopped) {
          material.dispose();
          return { id: candidate };
        }
        material.resize(this.canvas.width, this.canvas.height);
        material.reset(visualSeed(42));
        material.draw();
        const previous = this.visual;
        this.visual = material;
        this.visualProps = baselineValues(entry.meta.properties);
        previous?.dispose();
        return candidate === id ? { id } : { id: candidate, fallbackFrom: id };
      } catch (caught) {
        material.dispose();
        failure = caught;
      }
    }
    // A failed attempt may have left a framebuffer bound. Keep the stage dark and
    // preserve the previous material instead of showing an undefined white frame.
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    throw failure instanceof Error ? failure : new Error('No visual can render on this graphics card.');
  }

  async setSound(id: string): Promise<void> {
    const entry = getSoundMaterial(id);
    if (!entry) throw new Error('That sound material is unavailable.');
    await this.audio.load({
      entry,
      sampler: this.sampler,
      props: baselineValues(entry.meta.properties),
      seed: soundSeed(42),
    });
  }

  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(3, value));
  }
  setVolume(value: number): void {
    this.output.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.015,
    );
  }
  setMuted(value: boolean): void {
    this.audio.setMuted(value);
  }
  setSensitivity(value: number): void {
    this.sensitivity = value;
    this.tracker.setSensitivity(value);
  }

  private updateActivity(active: boolean): void {
    if (active === this.audible) return;
    this.audible = active;
    this.onActivity?.(active);
    const now = this.context.currentTime;
    this.activityGain.gain.cancelScheduledValues(now);
    this.activityGain.gain.setTargetAtTime(active ? 1 : 0, now, active ? 0.025 : 0.07);
  }

  startRecording(includeSource: boolean): void {
    this.finalizedGenerated = null;
    this.finalizedSource = null;
    this.recordingProblem = null;
    const mimeType = supportedMimeType();
    if (mimeType === null) throw new Error('MediaRecorder is not supported by this browser.');
    const capture = this.canvas.captureStream(30);
    const generated = new MediaStream([
      ...capture.getVideoTracks(),
      ...this.audioDestination.stream.getAudioTracks().map((track) => track.clone()),
    ]);
    this.generatedRecorder = recorderFor(generated, mimeType);
    this.generatedRecorder.recorder.start(1000);
    if (includeSource) {
      this.sourceRecorder = recorderFor(
        new MediaStream(this.cameraStream.getVideoTracks().map((track) => track.clone())),
        mimeType,
      );
      this.sourceRecorder.recorder.start(1000);
    }
    this.recordStarted = performance.now();
  }

  async stopRecording(): Promise<{ generated: RecordedPart | null; source: RecordedPart | null }> {
    const generated = this.generatedRecorder;
    const source = this.sourceRecorder;
    this.generatedRecorder = null;
    this.sourceRecorder = null;
    for (const state of [generated, source]) {
      if (state?.recorder.state === 'recording') state.recorder.stop();
    }
    const [generatedResult, sourceResult] = await Promise.allSettled([
      generated ? generated.result : Promise.resolve(null),
      source ? source.result : Promise.resolve(null),
    ]);
    if (generatedResult.status === 'fulfilled') this.finalizedGenerated = generatedResult.value;
    if (sourceResult.status === 'fulfilled') this.finalizedSource = sourceResult.value;
    const failed = [generatedResult, sourceResult].filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      this.recordingProblem =
        'One recording could not be finalized. The successfully captured parts remain available.';
    }
    return { generated: this.finalizedGenerated, source: this.finalizedSource };
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.tracker.stop();
    this.audio.pause();
    await this.audio.dispose().catch(() => undefined);
    this.visual?.dispose();
    this.visual = null;
    this.output.disconnect();
    this.activityGain.disconnect();
    await this.context.close().catch(() => undefined);
    releaseVisualContext(this.gl);
  }

  private readonly draw = (now: number) => {
    this.raf = requestAnimationFrame(this.draw);
    this.updateActivity(this.activity.active(now));
    const material = this.visual;
    if (!material) return;
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : FIXED_DT;
    this.lastFrame = now;
    const source = this.tracker.latest;
    const frame: SignatureFrame = {
      ...source,
      field: Float32Array.from(source.field, (value) => value * this.intensity),
      features: Object.fromEntries(
        Object.entries(source.features).map(([key, value]) => [
          key,
          value * (key === 'direction' || key.startsWith('centroid') ? 1 : this.intensity),
        ]),
      ) as SignatureFrame['features'],
      normalized: Object.fromEntries(
        Object.entries(source.normalized).map(([key, value]) => [
          key,
          value * (key === 'direction' || key.startsWith('centroid') ? 1 : this.intensity),
        ]),
      ) as SignatureFrame['normalized'],
    };
    material.step(frame, this.visualProps, dt);
    material.draw();
  };
}
