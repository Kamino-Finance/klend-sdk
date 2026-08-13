/**
 * Shared buffered-delivery plumbing for standalone WS listeners (slot,
 * oracle, native SOL). Owns the cadence triple-branch (immediate / throttle
 * timer / scheduler), latest-wins buffering, and error-routing fallback.
 *
 * Buffer is keyed by `keyOf(event)` — pass it for per-key buckets (e.g.
 * one slot per oracle address); omit for single-slot latest-wins.
 *
 * Each listener decodes the WS message into TEvent, calls `dispatcher.push()`,
 * and returns `makeSubscriptionHandle(dispatcher.unsubscribe, dispatcher.flush)`.
 */

import { assertCadenceOptions, validateThrottleMs, type WsCadenceOptions } from './wsCadenceOptions';
import { makeWsErrorReporter } from './wsErrorReporter';

export interface BufferedDispatcherOptions<TEvent, TKey = unknown> extends WsCadenceOptions {
  /** Omit for single-slot (latest-wins). Pass for per-key buckets. */
  keyOf?: (event: TEvent) => TKey;
  onDeliver: (event: TEvent) => void;
  onError?: (error: unknown) => void;
  /** Prefix for the default `console.error` fallback (e.g. `'[listenToSlotChanges]'`). */
  errorPrefix: string;
  /** Function name used in validation error messages. */
  callSiteName: string;
}

export interface BufferedDispatcher<TEvent> {
  push(event: TEvent): void;
  flush(): void;
  unsubscribe(): void;
}

/** Sentinel — when `keyOf` is omitted, every event lands under the same key. */
const SINGLE_SLOT_KEY: unique symbol = Symbol('buffered-dispatcher.single-slot');

export function createBufferedDispatcher<TEvent, TKey = unknown>(
  opts: BufferedDispatcherOptions<TEvent, TKey>
): BufferedDispatcher<TEvent> {
  validateThrottleMs(opts.throttleMs, opts.callSiteName);
  assertCadenceOptions(opts.callSiteName, opts.scheduler, opts.throttleMs);

  const errorReporter = makeWsErrorReporter(opts.errorPrefix, opts.onError);
  const keyOf = opts.keyOf ?? ((_e: TEvent) => SINGLE_SLOT_KEY as unknown as TKey);

  const bufferedEvents = new Map<TKey, TEvent>();
  let throttleDrainTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribed = false;
  let unregisterFromScheduler: (() => void) | undefined;

  const drainBuffer = () => {
    if (unsubscribed || bufferedEvents.size === 0) return;
    const drained = Array.from(bufferedEvents.values());
    bufferedEvents.clear();
    for (const event of drained) {
      try {
        opts.onDeliver(event);
      } catch (e) {
        errorReporter.reportError(e);
      }
    }
  };

  const onThrottleTimerFired = () => {
    throttleDrainTimer = undefined;
    drainBuffer();
  };

  if (opts.scheduler && opts.throttleMs !== undefined) {
    unregisterFromScheduler = opts.scheduler.register(drainBuffer, opts.throttleMs);
  }

  const bufferForSchedulerTick = (key: TKey, event: TEvent): void => {
    bufferedEvents.set(key, event);
  };

  const bufferAndArmThrottleTimer = (key: TKey, event: TEvent, throttleMs: number): void => {
    bufferedEvents.set(key, event);
    if (throttleDrainTimer === undefined) {
      throttleDrainTimer = setTimeout(onThrottleTimerFired, throttleMs);
    }
  };

  const deliverImmediately = (event: TEvent): void => {
    try {
      opts.onDeliver(event);
    } catch (e) {
      errorReporter.reportError(e);
    }
  };

  return {
    push(event) {
      if (unsubscribed) return;
      const key = keyOf(event);
      if (opts.scheduler) return bufferForSchedulerTick(key, event);
      if (opts.throttleMs !== undefined) return bufferAndArmThrottleTimer(key, event, opts.throttleMs);
      deliverImmediately(event);
    },
    flush() {
      drainBuffer();
    },
    unsubscribe() {
      unsubscribed = true;
      if (throttleDrainTimer !== undefined) {
        clearTimeout(throttleDrainTimer);
        throttleDrainTimer = undefined;
      }
      bufferedEvents.clear();
      unregisterFromScheduler?.();
      unregisterFromScheduler = undefined;
    },
  };
}
