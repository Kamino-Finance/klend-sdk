/**
 * Cadence-option types and validation shared by WS listeners and the
 * subscription manager. Two knobs:
 *   - `throttleMs` — own trailing-edge timer at this interval.
 *   - `scheduler` — cross-stream coordinator; needs `throttleMs` for the
 *     group cadence.
 */

import type { UpdateScheduler } from './wsUpdateScheduler';

export interface WsCadenceOptions {
  throttleMs?: number;
  /** Requires `throttleMs` to also be set. */
  scheduler?: UpdateScheduler;
}

/** Throws synchronously at the entrypoint so partial subscription state never lands. */
export function validateThrottleMs(throttleMs: number | undefined, callSiteName: string): void {
  if (throttleMs === undefined) return;
  if (!Number.isFinite(throttleMs) || throttleMs <= 0) {
    throw new Error(`${callSiteName}: \`throttleMs\` must be a positive finite number, got ${throttleMs}`);
  }
}

export function assertCadenceOptions(
  callSiteName: string,
  scheduler: UpdateScheduler | undefined,
  throttleMs: number | undefined
): void {
  if (scheduler && throttleMs === undefined) {
    throw new Error(`${callSiteName}: \`scheduler\` requires \`throttleMs\` to set the group cadence`);
  }
}
