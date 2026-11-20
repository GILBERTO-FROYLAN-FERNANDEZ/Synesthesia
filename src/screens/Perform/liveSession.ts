import type { TimestampedSettingChange } from '../../engine/composition';
import type { PropertyValues } from '../../materials/types';
import type { KineticSignature } from '../../signature/types';

export interface PerformanceSettings {
  visualId: string;
  soundId: string;
  visualProperties: PropertyValues;
  soundProperties: PropertyValues;
  bodyTrackingEnabled: boolean;
  intensity: number;
  volume: number;
  muted: boolean;
  sensitivity: number;
  recordSource: boolean;
}

export interface ActivePerformanceSession {
  id: string;
  stream: MediaStream;
  cameraName: string;
  startedAt: string;
  settings: PerformanceSettings;
}

export interface RecordedPart {
  blob: Blob;
  mimeType: string;
}

export interface CompletedPerformanceSession {
  id: string;
  name: string;
  recordedAt: string;
  duration: number;
  settings: PerformanceSettings;
  settingChanges: TimestampedSettingChange[];
  signature: KineticSignature;
  generated: RecordedPart | null;
  source: RecordedPart | null;
  recordingError: string | null;
  thumbnail?: string;
}

let active: ActivePerformanceSession | null = null;
let completed: CompletedPerformanceSession | null = null;

export function beginPerformance(
  stream: MediaStream,
  cameraName: string,
  settings: PerformanceSettings,
): ActivePerformanceSession {
  active = {
    id: crypto.randomUUID(),
    stream,
    cameraName,
    startedAt: new Date().toISOString(),
    settings: { ...settings },
  };
  completed = null;
  return active;
}

export function takeActivePerformance(): ActivePerformanceSession | null {
  const current = active;
  active = null;
  return current;
}

export function getActivePerformance(): ActivePerformanceSession | null {
  return active;
}

export function completePerformance(session: CompletedPerformanceSession): void {
  completed = session;
}

export function getCompletedPerformance(): CompletedPerformanceSession | null {
  return completed;
}

export function discardCompletedPerformance(): void {
  completed = null;
}
