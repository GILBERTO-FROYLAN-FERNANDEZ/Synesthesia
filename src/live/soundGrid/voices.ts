/**
 * Sound grid voices, plain Web Audio (no worklets, so they start instantly and cost little
 * on a 2017 MacBook Pro):
 *
 * - A **hold** voice per zone runs all the time; its gain and brightness follow the zone's
 *   level, so a zone swells while you move in it. Vertical movement bends it slightly.
 * - A **strike** is a short decaying note made for each onset and thrown away when done.
 *
 * The tone table and the gain/brightness curves are pure and tested; the node builders below
 * them are thin.
 */

export type VoiceId = 'glass' | 'reed' | 'bell';
export const VOICE_IDS: readonly VoiceId[] = ['glass', 'reed', 'bell'];

export interface VoiceSpec {
  label: string;
  description: string;
  hold: {
    type: OscillatorType;
    /** Second oscillator: waveform, frequency ratio, detune in cents. */
    partner: OscillatorType;
    partnerRatio: number;
    partnerCents: number;
    partnerGain: number;
    /** Low-pass cutoff at level 0, and how far it opens at level 1 (Hz above base). */
    cutoffBase: number;
    cutoffSpan: number;
    q: number;
  };
  strike: {
    type: OscillatorType;
    /** [frequency ratio, relative gain] partials. */
    partials: readonly (readonly [number, number])[];
    decaySec: number;
    /** Low-pass cutoff as a multiple of the note's frequency at velocity 1. */
    brightness: number;
  };
}

export const VOICES: Record<VoiceId, VoiceSpec> = {
  glass: {
    label: 'Glass',
    description: 'Soft sine tones and struck glass.',
    hold: {
      type: 'sine',
      partner: 'triangle',
      partnerRatio: 2,
      partnerCents: 3,
      partnerGain: 0.35,
      cutoffBase: 1200,
      cutoffSpan: 5000,
      q: 0.5,
    },
    strike: {
      type: 'sine',
      partials: [
        [1, 1],
        [2.76, 0.35],
        [5.4, 0.12],
      ],
      decaySec: 1.6,
      brightness: 12,
    },
  },
  reed: {
    label: 'Reed',
    description: 'Breathy reeds that open as you move, and plucked strings.',
    hold: {
      type: 'sawtooth',
      partner: 'sawtooth',
      partnerRatio: 1,
      partnerCents: 9,
      partnerGain: 0.8,
      cutoffBase: 250,
      cutoffSpan: 3000,
      q: 1.2,
    },
    strike: {
      type: 'sawtooth',
      partials: [
        [1, 1],
        [2, 0.25],
      ],
      decaySec: 0.55,
      brightness: 8,
    },
  },
  bell: {
    label: 'Bell',
    description: 'Hollow organ tones and ringing bells.',
    hold: {
      type: 'square',
      partner: 'sine',
      partnerRatio: 0.5,
      partnerCents: 0,
      partnerGain: 0.6,
      cutoffBase: 500,
      cutoffSpan: 2200,
      q: 0.7,
    },
    strike: {
      type: 'sine',
      partials: [
        [1, 1],
        [2.0, 0.5],
        [3.01, 0.3],
        [4.17, 0.2],
        [6.3, 0.08],
      ],
      decaySec: 2.4,
      brightness: 16,
    },
  },
};

/** Hold gain for a zone level (0–1); a gentle curve so small movements stay quiet. */
export function holdGain(level: number, zones: number): number {
  const l = Math.min(1, Math.max(0, level));
  return (0.45 / Math.sqrt(Math.max(1, zones))) * l ** 1.5;
}

/** Hold cutoff (Hz) for a zone level. */
export function holdCutoff(spec: VoiceSpec, level: number): number {
  const l = Math.min(1, Math.max(0, level));
  return spec.hold.cutoffBase + spec.hold.cutoffSpan * l * l;
}

/** Pitch bend (cents) from vertical flow: up (negative y) bends up, at most ±40 cents. */
export function bendCents(flowY: number, fullScale: number): number {
  const amount = Math.min(1, Math.max(-1, -flowY / Math.max(1e-6, fullScale)));
  return 40 * amount;
}

/** Peak gain of a strike. */
export function strikeGain(velocity: number): number {
  return 0.32 * Math.min(1, Math.max(0, velocity)) ** 1.2;
}

/** Most strikes ringing at once; more are skipped rather than stealing (no clicks). */
export const MAX_STRIKES = 24;

export interface HoldVoice {
  readonly osc: OscillatorNode;
  readonly partner: OscillatorNode;
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
  readonly pan: StereoPannerNode;
  dispose(): void;
}

export function createHoldVoice(
  ctx: BaseAudioContext,
  spec: VoiceSpec,
  frequency: number,
  pan: number,
  destination: AudioNode,
): HoldVoice {
  const osc = ctx.createOscillator();
  osc.type = spec.hold.type;
  osc.frequency.value = frequency;
  const partner = ctx.createOscillator();
  partner.type = spec.hold.partner;
  partner.frequency.value = frequency * spec.hold.partnerRatio;
  partner.detune.value = spec.hold.partnerCents;
  const partnerGain = ctx.createGain();
  partnerGain.gain.value = spec.hold.partnerGain;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = spec.hold.cutoffBase;
  filter.Q.value = spec.hold.q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  osc.connect(filter);
  partner.connect(partnerGain);
  partnerGain.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  osc.start();
  partner.start();
  return {
    osc,
    partner,
    filter,
    gain,
    pan: panner,
    dispose() {
      try {
        osc.stop();
        partner.stop();
      } catch {
        // Already stopped.
      }
      for (const node of [osc, partner, partnerGain, filter, gain, panner]) node.disconnect();
    },
  };
}

/** Play one strike starting at `at` (context time). Calls `onDone` when it has rung out. */
export function playStrike(
  ctx: BaseAudioContext,
  spec: VoiceSpec,
  frequency: number,
  velocity: number,
  pan: number,
  destination: AudioNode,
  at: number,
  onDone: () => void,
): void {
  const peak = strikeGain(velocity);
  const decay = spec.strike.decaySec * (0.6 + 0.4 * velocity);
  const end = at + decay;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const top = Math.min(18000, frequency * spec.strike.brightness * (0.4 + 0.6 * velocity));
  filter.frequency.setValueAtTime(top, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.5, 200), end);
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  filter.connect(panner);
  panner.connect(destination);
  const nodes: AudioNode[] = [filter, panner];
  let remaining = spec.strike.partials.length;
  spec.strike.partials.forEach(([ratio, weight], i) => {
    const osc = ctx.createOscillator();
    osc.type = spec.strike.type;
    osc.frequency.value = frequency * ratio;
    const env = ctx.createGain();
    // Higher partials die away faster, as in struck things.
    const partialEnd = at + decay / (1 + i * 0.6);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak * weight, at + 0.004);
    env.gain.exponentialRampToValueAtTime(1e-4, partialEnd);
    osc.connect(env);
    env.connect(filter);
    nodes.push(osc, env);
    osc.onended = () => {
      remaining--;
      if (remaining > 0) return;
      for (const node of nodes) node.disconnect();
      onDone();
    };
    osc.start(at);
    osc.stop(partialEnd + 0.02);
  });
}
