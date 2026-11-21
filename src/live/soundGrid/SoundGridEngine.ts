/**
 * The sound grid: live movement → zones → notes.
 *
 * Feed it every frame a tracker produces (`update(frame)`), or body landmarks
 * (`updatePoints(points)`). Each zone of the grid has its own note and stereo place; movement
 * in a zone swells its hold voice and/or strikes its note.
 *
 * This is a live instrument, separate from the sound materials: materials are scheduled
 * ~350 ms ahead so preview and offline render match (SPEC 9.1), which is too late to feel
 * like playing. The grid writes straight to "now" on the audio clock instead (~20–40 ms from
 * movement to sound, plus the tracker's own delay). Nothing here is part of a composition or
 * a render, so the determinism rules don't apply; it lives outside the deterministic folders.
 *
 * Sound starts only after `start()`, which must be called from a user gesture (Chrome's
 * autoplay policy). Before that, `update` still measures the zones, so the grid overlay can
 * show movement silently.
 */
import { cachedImpulseResponse } from '../../materials/sound/shared/impulse';
import { createMasterChain, type MasterChain } from '../../materials/sound/shared/masterChain';
import type { SignatureFrame } from '../../signature/types';
import {
  DEFAULT_ACTIVITY,
  fullScaleFromResponse,
  ZoneActivity,
  type ActivityParams,
} from './activity';
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_ROOT,
  GRID_SIZES,
  midiToHz,
  zoneCount,
  zoneNote,
  zonePan,
  type GridLayout,
  type ScaleId,
} from './layout';
import {
  bendCents,
  createHoldVoice,
  holdCutoff,
  holdGain,
  MAX_STRIKES,
  playStrike,
  VOICES,
  type HoldVoice,
  type VoiceId,
} from './voices';
import {
  createZoneMotion,
  measurePointZones,
  measureZones,
  type TrackedPoint,
  type ZoneMotion,
} from './zones';

export type PlayMode = 'hold' | 'strike' | 'both';
export const PLAY_MODES: readonly PlayMode[] = ['hold', 'strike', 'both'];
export const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  hold: 'Hold',
  strike: 'Strike',
  both: 'Both',
};

export interface SoundGridSettings {
  /** Index into GRID_SIZES. */
  size: number;
  mode: PlayMode;
  voice: VoiceId;
  scale: ScaleId;
  /** MIDI note of the bottom-left zone. */
  root: number;
  /** 0–1. */
  volume: number;
  /** 0–1: higher lets smaller movements play a zone fully. */
  response: number;
}

export const DEFAULT_SOUND_GRID: SoundGridSettings = {
  size: DEFAULT_GRID_SIZE,
  mode: 'both',
  voice: 'glass',
  scale: 'pentatonic',
  root: DEFAULT_ROOT,
  volume: 0.7,
  response: 0.5,
};

/** What the overlay draws. Arrays are owned by the engine: read them, don't keep them. */
export interface SoundGridSnapshot {
  layout: GridLayout;
  notes: readonly number[];
  level: Float32Array;
  active: Uint8Array;
  /** Strikes so far per zone; a change means "flash". */
  strikes: Uint32Array;
  sounding: boolean;
}

export type SoundGridListener = (snapshot: SoundGridSnapshot) => void;

/** With no movement update for this long (tracking stalled or stopped), zones fall silent. */
const STALE_SEC = 0.4;
const REVERB_DECAY_SEC = 2.6;
const REVERB_WET = 0.28;
/** Seconds for a hold voice to follow its level (between tracker frames). */
const HOLD_GLIDE_SEC = 0.025;

function nowSec(): number {
  return performance.now() / 1000;
}

export function layoutFor(settings: SoundGridSettings): GridLayout {
  return GRID_SIZES[settings.size] ?? GRID_SIZES[DEFAULT_GRID_SIZE];
}

interface Audio {
  ctx: AudioContext;
  chain: MasterChain;
  bus: GainNode;
  reverbSend: GainNode;
  convolver: ConvolverNode;
  holds: HoldVoice[];
}

export class SoundGridEngine {
  private settings: SoundGridSettings;
  private layout: GridLayout;
  private notes: number[] = [];
  private activity: ZoneActivity;
  private motion: ZoneMotion;
  private strikes: Uint32Array;
  private audio: Audio | null = null;
  private starting: Promise<void> | null = null;
  private sounding = false;
  private strikesRinging = 0;
  private lastUpdate = Number.NEGATIVE_INFINITY;
  private previousPoints: TrackedPoint[] | null = null;
  private readonly listeners = new Set<SoundGridListener>();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** Bumped by close(), so an AudioContext still opening when closed is thrown away. */
  private generation = 0;

  constructor(settings: Partial<SoundGridSettings> = {}) {
    this.settings = { ...DEFAULT_SOUND_GRID, ...settings };
    this.layout = layoutFor(this.settings);
    this.activity = new ZoneActivity(this.layout);
    this.motion = createZoneMotion(zoneCount(this.layout));
    this.strikes = new Uint32Array(zoneCount(this.layout));
    this.computeNotes();
  }

  get current(): SoundGridSettings {
    return this.settings;
  }

  get isSounding(): boolean {
    return this.sounding;
  }

  subscribe(listener: SoundGridListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  /** Change settings; the grid rebuilds only when its size, scale, root or voice change. */
  configure(next: Partial<SoundGridSettings>): void {
    const before = this.settings;
    this.settings = { ...before, ...next };
    const s = this.settings;
    const resized = s.size !== before.size;
    if (resized) {
      this.layout = layoutFor(s);
      this.activity = new ZoneActivity(this.layout);
      this.motion = createZoneMotion(zoneCount(this.layout));
      this.strikes = new Uint32Array(zoneCount(this.layout));
      this.previousPoints = null;
    }
    if (resized || s.scale !== before.scale || s.root !== before.root) this.computeNotes();
    if (this.audio) {
      if (resized || s.scale !== before.scale || s.root !== before.root || s.voice !== before.voice)
        this.rebuildHolds(this.audio);
      if (s.volume !== before.volume)
        this.audio.chain.setGain(s.volume, this.audio.ctx.currentTime);
      if (s.mode === 'strike') this.silenceHolds(this.audio);
    }
    this.emit();
  }

  /** Start sound. Call from a click or key press. */
  async start(): Promise<void> {
    const generation = this.generation;
    this.starting ??= this.open(generation);
    try {
      await this.starting;
    } catch (error) {
      this.starting = null;
      throw error;
    }
    const audio = this.audio;
    if (!audio || generation !== this.generation) return;
    if (audio.ctx.state !== 'running') await audio.ctx.resume();
    audio.chain.setMuted(false, audio.ctx.currentTime);
    this.sounding = true;
    this.emit();
  }

  /** Fade out and suspend the audio (keeps measuring zones for the overlay). */
  async stop(): Promise<void> {
    this.sounding = false;
    this.emit();
    const audio = this.audio;
    if (!audio) return;
    audio.chain.setMuted(true, audio.ctx.currentTime);
    this.silenceHolds(audio);
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (!this.sounding && audio.ctx.state === 'running') await audio.ctx.suspend();
  }

  /**
   * Feed one frame from `trackLiveVideo` / the body-tracking worker. The tracker mirrors the
   * camera before measuring (src/signature/live.ts), so the field already matches the mirrored
   * preview. Pass `mirror: true` only for a field measured from the un-mirrored image.
   */
  update(frame: Pick<SignatureFrame, 'cols' | 'rows' | 'field'>, mirror = false): void {
    this.motion = measureZones(frame, this.layout, mirror, this.motion);
    this.play();
  }

  /**
   * Feed body landmarks (x, y in 0–1 of the un-mirrored camera image, as MediaPipe gives
   * them; `mirror` flips them to match the preview), e.g.
   * `POSE_PLAYING_POINTS.map((i) => res.landmarks[0][i])` from MediaPipe PoseLandmarker.
   * `aspect` is the camera's width / height.
   */
  updatePoints(points: readonly TrackedPoint[], aspect: number, mirror = true): void {
    const dt = Number.isFinite(this.lastUpdate) ? nowSec() - this.lastUpdate : 0;
    this.motion = measurePointZones(
      points,
      this.previousPoints,
      dt,
      aspect,
      this.layout,
      mirror,
      this.motion,
    );
    this.previousPoints = points.map((p) => ({ ...p }));
    this.play();
  }

  /**
   * Release the audio and the timer. The engine stays usable: a later `update` measures
   * again and `start` opens a new AudioContext (React StrictMode mounts effects twice).
   */
  dispose(): void {
    this.generation++;
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    this.starting = null;
    this.sounding = false;
    this.activity.reset();
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      for (const hold of audio.holds) hold.dispose();
      audio.chain.dispose();
      void audio.ctx.close().catch(() => undefined);
    }
  }

  private activityParams(): ActivityParams {
    return { ...DEFAULT_ACTIVITY, fullScale: fullScaleFromResponse(this.settings.response) };
  }

  private play(): void {
    this.watchdog ??= setInterval(() => this.checkStale(), 100);
    const t = nowSec();
    const dt = Number.isFinite(this.lastUpdate) ? Math.min(0.25, t - this.lastUpdate) : 1 / 30;
    this.lastUpdate = t;
    const params = this.activityParams();
    const state = this.activity.update(this.motion.level, dt, params);
    for (let z = 0; z < this.activity.count; z++) if (state.onset[z]) this.strikes[z]++;

    const audio = this.audio;
    if (audio && this.sounding) {
      const now = audio.ctx.currentTime;
      const spec = VOICES[this.settings.voice];
      const holds = this.settings.mode !== 'strike';
      const strikes = this.settings.mode !== 'hold';
      const count = this.activity.count;
      for (let z = 0; z < count; z++) {
        const hold = audio.holds[z];
        if (hold && holds) {
          const level = state.level[z] ?? 0;
          // In "both", holds sit lower so the strikes read on top.
          const gain = holdGain(level, count) * (strikes ? 0.6 : 1);
          hold.gain.gain.setTargetAtTime(gain, now, HOLD_GLIDE_SEC);
          hold.filter.frequency.setTargetAtTime(holdCutoff(spec, level), now, HOLD_GLIDE_SEC);
          const bend = bendCents(this.motion.flowY[z] ?? 0, params.fullScale);
          hold.osc.detune.setTargetAtTime(bend, now, 0.08);
        }
        if (strikes && state.onset[z] && this.strikesRinging < MAX_STRIKES) {
          this.strikesRinging++;
          playStrike(
            audio.ctx,
            spec,
            midiToHz(this.notes[z] ?? this.settings.root),
            state.velocity[z] ?? 0.5,
            zonePan(z, this.layout),
            audio.bus,
            now,
            () => {
              this.strikesRinging--;
            },
          );
        }
      }
    }
    this.emit();
  }

  private checkStale(): void {
    if (nowSec() - this.lastUpdate < STALE_SEC) return;
    if (!this.activity.state.level.some((l) => l > 0.001)) return;
    // Tracking has gone quiet: let every zone ring down.
    this.motion.level.fill(0);
    this.motion.flowY.fill(0);
    this.previousPoints = null;
    this.play();
  }

  private computeNotes(): void {
    const { scale, root } = this.settings;
    this.notes = Array.from({ length: zoneCount(this.layout) }, (_, z) =>
      zoneNote(z, this.layout, scale, root),
    );
  }

  private async open(generation: number): Promise<void> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const chain = createMasterChain(ctx, ctx.destination, { gain: this.settings.volume });
    chain.setMuted(true, ctx.currentTime, 0);
    const bus = ctx.createGain();
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = REVERB_WET;
    const convolver = ctx.createConvolver();
    const channels = cachedImpulseResponse({
      sampleRate: ctx.sampleRate,
      decaySec: REVERB_DECAY_SEC,
      seed: 0x53474944, // "SGID"
    });
    const ir = ctx.createBuffer(channels.length, channels[0]?.length ?? 1, ctx.sampleRate);
    channels.forEach((data, i) => ir.copyToChannel(data, i));
    convolver.buffer = ir;
    bus.connect(chain.input);
    bus.connect(reverbSend);
    reverbSend.connect(convolver);
    convolver.connect(chain.input);
    const audio: Audio = { ctx, chain, bus, reverbSend, convolver, holds: [] };
    if (generation !== this.generation) {
      chain.dispose();
      await ctx.close();
      return;
    }
    this.audio = audio;
    this.rebuildHolds(audio);
  }

  private rebuildHolds(audio: Audio): void {
    const old = audio.holds;
    const now = audio.ctx.currentTime;
    for (const hold of old) hold.gain.gain.setTargetAtTime(0, now, 0.03);
    setTimeout(() => old.forEach((hold) => hold.dispose()), 200);
    const spec = VOICES[this.settings.voice];
    audio.holds = this.notes.map((note, z) =>
      createHoldVoice(audio.ctx, spec, midiToHz(note), zonePan(z, this.layout), audio.bus),
    );
  }

  private silenceHolds(audio: Audio): void {
    const now = audio.ctx.currentTime;
    for (const hold of audio.holds) hold.gain.gain.setTargetAtTime(0, now, 0.05);
  }

  private snapshot(): SoundGridSnapshot {
    return {
      layout: this.layout,
      notes: this.notes,
      level: this.activity.state.level,
      active: this.activity.state.active,
      strikes: this.strikes,
      sounding: this.sounding,
    };
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
