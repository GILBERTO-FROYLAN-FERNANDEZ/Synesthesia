import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../../engine/audio/AudioEngine';
import { baselineValues } from '../../materials/properties';
import { getSoundMaterial } from '../../materials/registry';
import type { PropertyValues } from '../../materials/types';
import { createSyntheticSampler } from '../../signature/synthetic';

interface Session {
  context: AudioContext;
  engine: AudioEngine;
  output: GainNode;
}

async function dispose(session: Session): Promise<void> {
  session.engine.onEnded = null;
  session.engine.pause();
  await session.engine.dispose().catch(() => undefined);
  session.output.disconnect();
  await session.context.close().catch(() => undefined);
}

/** Real one-shot material preview used by manual collaborative-region testing. */
export function useManualSound(volume: number, muted: boolean, intensity: number, properties?: PropertyValues) {
  const sessionRef = useRef<Session | null>(null);
  const tokenRef = useRef(0);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    tokenRef.current++;
    const session = sessionRef.current;
    sessionRef.current = null;
    setState('idle');
    if (session) await dispose(session);
  }, []);

  const play = useCallback(
    async (materialId: string) => {
      const entry = getSoundMaterial(materialId);
      if (!entry) {
        setState('error');
        setError('That sound material is not available.');
        return;
      }
      await stop();
      const token = tokenRef.current;
      setState('loading');
      setError(null);
      let session: Session | null = null;
      try {
        const context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
        const output = context.createGain();
        output.gain.value = (volume / 100) * (0.35 + intensity * 0.65);
        output.connect(context.destination);
        const engine = new AudioEngine({ context, destination: output, masterGain: 1 });
        session = { context, engine, output };
        const activeSession = session;
        sessionRef.current = activeSession;
        const sampler = createSyntheticSampler('wink');
        sampler.configure({ loops: 1, tailSec: 0.6, speed: 1.35 });
        await engine.load({
          entry,
          sampler,
          props: properties ?? baselineValues(entry.meta.properties),
          seed: 3,
        });
        if (token !== tokenRef.current) {
          if (sessionRef.current === activeSession) sessionRef.current = null;
          await dispose(activeSession);
          return;
        }
        engine.setMuted(muted);
        engine.onEnded = () => {
          if (token !== tokenRef.current || sessionRef.current !== activeSession) return;
          tokenRef.current++;
          sessionRef.current = null;
          setState('idle');
          void dispose(activeSession);
        };
        await engine.play(0);
        setState('playing');
      } catch (caught) {
        if (token !== tokenRef.current) return;
        console.warn('Collaborative sound test could not start:', caught);
        if (sessionRef.current === session) sessionRef.current = null;
        if (session) await dispose(session);
        setState('error');
        setError('The sound test could not start on this device.');
      }
    },
    [intensity, muted, properties, stop, volume],
  );

  useEffect(() => {
    if (properties) sessionRef.current?.engine.setProps(properties);
  }, [properties]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.output.gain.setTargetAtTime(
      (volume / 100) * (0.35 + intensity * 0.65),
      session.context.currentTime,
      0.015,
    );
  }, [intensity, volume]);

  useEffect(() => {
    sessionRef.current?.engine.setMuted(muted);
  }, [muted]);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void dispose(session);
    },
    [],
  );

  return { state, error, play, stop };
}
