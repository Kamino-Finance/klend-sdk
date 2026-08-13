/**
 * Coordinated update scheduler for WS-driven state.
 *
 * Updaters registered with the same `throttleMs` share one timer and fire
 * together. Pick the same `throttleMs` to coordinate cross-stream rendering;
 * pick different values for independent cadences.
 *
 * Browser callers pass `schedule: (cb) => requestAnimationFrame(() => cb())`
 * to align drains with paint and skip hidden tabs. Node callers omit it for
 * synchronous drain.
 */

import { makeWsErrorReporter } from './wsErrorReporter';

export interface UpdateSchedulerOptions {
  /** Wraps the drain — typically `requestAnimationFrame` in browsers. */
  schedule?: (cb: () => void) => void;
  /** Defaults to `console.error('[ws-update-scheduler]', e)`. A throw in one
   *  updater never stops the others. */
  onError?: (error: unknown) => void;
}

export interface UpdateScheduler {
  /** Returns an unregister fn. Same fn registered twice yields two entries. */
  register(updater: () => void, throttleMs: number): () => void;
  /** Drain every group right now. Re-entrant calls are suppressed. */
  updateNow(): void;
  /** After this, register() throws. */
  destroy(): void;
}

interface UpdaterGroup {
  updaters: Map<number, () => void>;
  timer: ReturnType<typeof setInterval> | undefined;
  /** True between when a deferred drain is queued and when it runs — coalesces
   *  hidden-tab interval ticks into one drain. */
  drainPending: boolean;
  /** Bumped on every drain; queued schedule callbacks bail if their captured
   *  value moved (prevents updateNow + interval double-drain). */
  drainSequence: number;
}

export function createUpdateScheduler(opts: UpdateSchedulerOptions = {}): UpdateScheduler {
  const schedule = opts.schedule ?? ((cb) => cb());
  const errorReporter = makeWsErrorReporter('[ws-update-scheduler]', opts.onError);
  const groups = new Map<number, UpdaterGroup>();
  let nextRegistrationId = 0;
  let destroyed = false;
  let draining = false;

  const safeInvoke = (fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      errorReporter.reportError(e);
    }
  };

  const drainSupersededByLaterDrain = (group: UpdaterGroup, enqueuedSequence: number): boolean =>
    group.drainSequence !== enqueuedSequence;

  const drainGroupNow = (group: UpdaterGroup) => {
    if (destroyed) return;
    group.drainSequence++;
    group.drainPending = false;
    // Snapshot before iterating: an updater that mutates the Map mid-drain
    // would otherwise visit added entries / skip deleted ones.
    const snapshot = Array.from(group.updaters.values());
    for (const updater of snapshot) safeInvoke(updater);
  };

  const scheduleDeferredDrain = (group: UpdaterGroup) => {
    if (group.drainPending || destroyed) return;
    group.drainPending = true;
    const enqueuedSequence = group.drainSequence;
    try {
      schedule(() => {
        if (drainSupersededByLaterDrain(group, enqueuedSequence)) return;
        drainGroupNow(group);
      });
    } catch (e) {
      // A buggy user-supplied `schedule` wrapper threw synchronously and
      // never queued our callback. Reset `drainPending` so the next interval
      // tick (or `updateNow()`) can attempt another drain — without this,
      // every future tick short-circuits at `drainPending=true` and the
      // group is silently stuck forever.
      group.drainPending = false;
      errorReporter.reportError(e);
    }
  };

  return {
    register(updater, throttleMs) {
      if (destroyed) throw new Error('UpdateScheduler is destroyed');
      if (!Number.isFinite(throttleMs) || throttleMs <= 0) {
        throw new Error(`UpdateScheduler.register: throttleMs must be a positive number, got ${throttleMs}`);
      }
      let group = groups.get(throttleMs);
      if (group === undefined) {
        const newGroup: UpdaterGroup = { updaters: new Map(), timer: undefined, drainPending: false, drainSequence: 0 };
        groups.set(throttleMs, newGroup);
        newGroup.timer = setInterval(() => scheduleDeferredDrain(newGroup), throttleMs);
        group = newGroup;
      }
      const id = nextRegistrationId++;
      group.updaters.set(id, updater);
      return () => {
        const g = groups.get(throttleMs);
        if (!g) return;
        g.updaters.delete(id);
        if (g.updaters.size === 0) {
          if (g.timer !== undefined) clearInterval(g.timer);
          groups.delete(throttleMs);
        }
      };
    },
    updateNow() {
      // Suppress re-entry: an updater calling updateNow() inside itself
      // would re-iterate every group → unbounded recursion.
      if (draining) return;
      draining = true;
      try {
        // Snapshot first: an updater that registers a NEW updater with a
        // new `throttleMs` creates a new group mid-iteration. `Map.values()`
        // iteration can visit those newly-added entries — meaning the same
        // updateNow() call could drain groups that didn't exist when the
        // user called it. The contract is "drain groups present at call
        // time", so we freeze the set up front.
        const snapshot = Array.from(groups.values());
        for (const group of snapshot) drainGroupNow(group);
      } finally {
        draining = false;
      }
    },
    destroy() {
      destroyed = true;
      for (const group of groups.values()) {
        if (group.timer !== undefined) clearInterval(group.timer);
      }
      groups.clear();
    },
  };
}
