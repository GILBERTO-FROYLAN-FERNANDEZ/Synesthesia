import type { SignatureFrame } from './types';

export type LiveBodyTrackingResponse =
  | { frame: SignatureFrame | null; onset?: boolean }
  | { error: true; msg: string };
