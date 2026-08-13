/**
 * Generic account subscription manager using Solana programNotifications.
 * Framework-agnostic — consumers provide error/log callbacks for observability.
 *
 * Features:
 * - Ref-counted: first listener starts the WS, last unsubscribe tears it down.
 * - Slot-based ordering + buffer dedup (skips unchanged data, updates slot only).
 * - Auto-reconnect via {@link runReconnectLoop}.
 * - Decode/listener throws are reported but DO NOT trigger reconnect.
 * - Per-listener `onReconnect` for state refresh after WS recovery; cleaned
 *   up on unsubscribe so departed listeners' hooks cannot fire later.
 */
import {
  type Address,
  type Base58EncodedBytes,
  type Commitment,
  type RpcSubscriptions,
  type Slot,
  type SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import { Buffer } from 'buffer';

import { makeSubscriptionHandle, type SubscriptionHandle } from './subscriptionHandle';
import { blobEquals, noop, toJson } from './utils';
import { assertCadenceOptions, validateThrottleMs } from './wsCadenceOptions';
import type { UpdateScheduler } from './wsUpdateScheduler';
import { runReconnectLoop, WS_RECONNECT_DELAY_MS } from './wsReconnectLoop';

export type SubscriptionCallback = (address: Address, buffer: Uint8Array, slot: Slot) => void;
export type SubscriptionMode = 'ws' | 'idle';
export type SubscriptionErrorHandler = (error: unknown) => void;
export type SubscriptionLogger = (...args: unknown[]) => void;

export type ProgramFilter =
  | Readonly<{ dataSize: bigint }>
  | Readonly<{ memcmp: Readonly<{ offset: bigint; bytes: Base58EncodedBytes; encoding: 'base58' }> }>;

export interface AccountSubscriptionManagerConfig {
  wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  onError?: SubscriptionErrorHandler;
  onLog?: SubscriptionLogger;
  reconnectDelayMs?: number;
}

export interface SubscribeProgramAccountsOptions {
  commitment?: Commitment;
  /** Called after WS reconnects, before resuming the notification loop.
   *  Use to refresh state that may have drifted during downtime.
   *
   *  Per-listener: each subscriber's hook is tracked independently and
   *  cleaned up on `unsubscribe()`. The hook invoked on each reconnect is
   *  the most recently registered one still attached (latest wins), so a
   *  subscriber whose hook is currently in use can leave without leaving
   *  a dangling reference.
   *
   *  The manager wraps the call in retry-with-exponential-backoff (capped
   *  at 30s, 5 attempts). A throwing hook is reported through `onError`
   *  per attempt; after the max, we give up and proceed with cached state.
   *  Aborts cleanly on `unsubscribe()`. */
  onReconnect?: () => void | Promise<void>;
  /** Request a delivery cadence of at most one per N ms. The actual cadence
   *  is the minimum of all subscribers' demands (**shortest wins**) — your
   *  callback may fire faster than your own `throttleMs` if another
   *  subscriber asked for less.
   *
   *  - A subscriber that omits `throttleMs` adds no demand and inherits the
   *    existing cadence. To guarantee strictly immediate delivery, ensure
   *    no other subscriber on the same `(programId, commitment, filters)`
   *    key sets a `throttleMs` — otherwise their throttle wins.
   *  - A throttled subscriber joining an unthrottled key silently throttles
   *    the original subscriber (intentional — fast wins, no data loss).
   *
   *  Required when `scheduler` is set (sets the group cadence). */
  throttleMs?: number;
  /** Cross-stream flush scheduler — registers an updater under `throttleMs`
   *  in the scheduler's group map. Drains the buffer on each scheduler tick
   *  instead of running an own setTimeout.
   *
   *  Per-listener tracking: each subscriber's scheduler is recorded, and
   *  the **active** scheduler is the FIRST one passed (insertion order).
   *  Subscribers that omit `scheduler` don't contribute, so a no-scheduler
   *  subscriber doesn't block a later one from establishing the active
   *  scheduler. If a subscriber passes a scheduler DIFFERENT from the
   *  active one, the manager logs (via `onLog`) and records the demand
   *  anyway — that scheduler will take over only if every listener owning
   *  the currently-active scheduler unsubscribes.
   *
   *  On unsubscribe, the active scheduler is recomputed and the buffered-
   *  drain registration moves to the next scheduler in line (or falls back
   *  to a self-managed timer if none remain). This prevents holding a dead
   *  reference to a scheduler whose owner has departed.
   *
   *  Note: this subscription's scheduler-group cadence follows the
   *  shortest-wins effective `throttleMs`. If a later subscriber to the
   *  same key passes a shorter `throttleMs` (with or without scheduler),
   *  the scheduler-group registration moves to the faster cadence — your
   *  other subscriptions registered under the original cadence will no
   *  longer flush together with this one. */
  scheduler?: UpdateScheduler;
}

interface ManagedSubscription {
  key: string;
  programId: Address;
  filters: readonly ProgramFilter[];
  /** Pre-serialized for O(1) lookups in findSubscription. */
  serializedFilters: string;
  commitment: Commitment;
  listeners: Map<number, SubscriptionCallback>;
  /** Last value per address — used for slot-ordering and dedup.
   *
   *  **Memory note:** this grows unbounded over the subscription's lifetime
   *  (every distinct address ever delivered is retained until teardown).
   *  Acceptable for current callers because the address set per subscription
   *  is naturally bounded (e.g. one entry per reserve / per obligation in a
   *  market) and the subscription's lifetime is the page/session. If a
   *  long-lived subscription is added that observes a very large or
   *  ever-expanding address space, swap this for an LRU or add eviction on
   *  some staleness signal — neither is needed today. */
  cachedValuesByAddress: Map<Address, { buffer: Uint8Array; slot: Slot }>;
  mode: SubscriptionMode;
  stopWsLoop: (() => void) | undefined;
  /** Per-listener reconnect hooks. Active hook = latest insertion (Map
   *  preserves insertion order). Recomputed on unsubscribe so a removed
   *  listener's hook cannot fire after it leaves. */
  onReconnectDemands: Map<number, () => void | Promise<void>>;
  /** Per-listener cadence demands; effective `throttleMs` is the min. */
  throttleMsDemands: Map<number, number>;
  /** Effective throttle: min of demands, or undefined if none. */
  throttleMs?: number;
  throttleDrainTimer?: ReturnType<typeof setTimeout>;
  unregisterFromScheduler?: () => void;
  /** Per-listener scheduler demands. Active scheduler = first insertion
   *  (oldest non-undefined demand). Recomputed on unsubscribe so a scheduler
   *  whose owning listener leaves is swapped for the next available one
   *  (vs holding a dead reference). */
  schedulerDemands: Map<number, UpdateScheduler>;
  /** Currently-attached scheduler (derived from {@link schedulerDemands}). */
  activeScheduler?: UpdateScheduler;
  bufferedNotifications: Map<Address, { buffer: Uint8Array; slot: Slot }>;
  connectedResolve?: () => void;
  connectedPromise?: Promise<void>;
  /** Aborted on teardown — cancels any in-flight `onReconnect` retry loop. */
  teardownAbortController: AbortController;
}

interface ProgramAccountNotification {
  context: { slot: Slot };
  value: { pubkey: Address; account: { data: [string, string] } | null };
}

function computeShortestThrottle(throttleMsDemands: Map<number, number>): number | undefined {
  let shortest: number | undefined;
  for (const demand of throttleMsDemands.values()) {
    if (shortest === undefined || demand < shortest) shortest = demand;
  }
  return shortest;
}

/** Latest hook in insertion order — preserves "last subscriber wins" semantics
 *  while ensuring removed listeners' hooks no longer fire (see PR #563 review). */
function pickLatestReconnectHook(
  onReconnectDemands: Map<number, () => void | Promise<void>>
): (() => void | Promise<void>) | undefined {
  let latest: (() => void | Promise<void>) | undefined;
  for (const hook of onReconnectDemands.values()) latest = hook;
  return latest;
}

/** First scheduler in insertion order (oldest demand). Subscribers without a
 *  scheduler don't contribute, so an early no-scheduler subscriber doesn't
 *  block a later one from setting the active scheduler. */
function pickFirstScheduler(schedulerDemands: Map<number, UpdateScheduler>): UpdateScheduler | undefined {
  for (const scheduler of schedulerDemands.values()) return scheduler;
  return undefined;
}

/** Bounded exponential backoff for reconnect-hook retries (uses the same
 *  cap as runReconnectLoop's stream backoff so worst-case wait is bounded
 *  symmetrically). */
const RECONNECT_HOOK_MAX_RETRIES = 5;
const RECONNECT_HOOK_MAX_DELAY_MS = 30_000;

export class AccountSubscriptionManager {
  private subscriptions = new Map<string, ManagedSubscription>();
  private nextListenerId = 0;
  private wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  private onError: SubscriptionErrorHandler;
  private onLog: SubscriptionLogger;
  private reconnectDelayMs: number;

  constructor(config: AccountSubscriptionManagerConfig) {
    this.wsRpc = config.wsRpc;
    this.onError = config.onError ?? noop;
    this.onLog = config.onLog ?? noop;
    this.reconnectDelayMs = config.reconnectDelayMs ?? WS_RECONNECT_DELAY_MS;
  }

  /**
   * Subscribe to program account changes. First subscriber for a key starts
   * the WS; last unsubscribe tears it down. Late subscribers replay any
   * cached account data immediately.
   */
  subscribeProgramAccounts(
    programId: Address,
    filters: readonly ProgramFilter[],
    callback: SubscriptionCallback,
    options?: SubscribeProgramAccountsOptions
  ): SubscriptionHandle {
    // Validate before any state is created — bad input throws at the
    // entrypoint instead of leaving a partial subscription behind.
    validateThrottleMs(options?.throttleMs, 'AccountSubscriptionManager.subscribeProgramAccounts');
    assertCadenceOptions(
      'AccountSubscriptionManager.subscribeProgramAccounts',
      options?.scheduler,
      options?.throttleMs
    );

    const commitment = options?.commitment ?? 'processed';
    const key = this.buildKey(programId, commitment, filters);
    const listenerId = this.nextListenerId++;

    let subscription = this.subscriptions.get(key);
    const subscriptionWasCreated = !subscription;
    if (!subscription) {
      subscription = this.createSubscription(key, programId, filters, commitment);
    } else if (
      options?.scheduler &&
      subscription.activeScheduler &&
      subscription.activeScheduler !== options.scheduler
    ) {
      // A scheduler is already active and the new subscriber passed a
      // DIFFERENT one. We still record the demand so it becomes active if
      // the original scheduler's owner unsubscribes — but it won't take
      // effect right now. Log to surface the coordination gap.
      this.onLog(
        '[AccountSubscriptionManager] Subscriber passed a scheduler different from the currently-active one for this key — buffer drains will continue on the active scheduler. The new scheduler will take over only if every listener owning the active one unsubscribes.'
      );
    }

    // Wrap the per-listener mutations + register() calls so a throw (e.g.
    // user passed a destroyed scheduler whose register() raises) cannot
    // poison the subscription with a ghost listener. Without this, the
    // ghost would leave `listeners.size > 0` and every subsequent normal
    // subscriber would see size > 1 → skip startWs → silent WS stall.
    try {
      if (options?.scheduler) {
        subscription.schedulerDemands.set(listenerId, options.scheduler);
      }
      if (options?.throttleMs !== undefined) {
        subscription.throttleMsDemands.set(listenerId, options.throttleMs);
        this.recomputeEffectiveThrottle(subscription);
      }
      subscription.listeners.set(listenerId, callback);
      if (options?.onReconnect) {
        subscription.onReconnectDemands.set(listenerId, options.onReconnect);
      }
      // Recompute active scheduler now that demands changed. May start using
      // a scheduler for the first time (if first scheduler-providing
      // subscriber just joined) — recomputeEffectiveThrottle won't pick this
      // up on its own when throttleMs wasn't passed.
      this.recomputeActiveScheduler(subscription);
    } catch (e) {
      // Roll back EVERY per-listener mutation so the failure looks like the
      // subscribe never happened. Rollback steps themselves run inside
      // try/catch so a doubly-bad scheduler (rollback recompute throws too)
      // still cleans the maps and surfaces both errors via onError instead
      // of leaving the subscription in a worse state than where we started.
      subscription.listeners.delete(listenerId);
      subscription.onReconnectDemands.delete(listenerId);
      subscription.schedulerDemands.delete(listenerId);
      if (subscription.throttleMsDemands.delete(listenerId)) {
        try {
          this.recomputeEffectiveThrottle(subscription);
        } catch (rollbackErr) {
          this.onError(rollbackErr);
        }
      }
      try {
        this.recomputeActiveScheduler(subscription);
      } catch (rollbackErr) {
        this.onError(rollbackErr);
      }
      // If this call created the subscription and rollback drained it, drop
      // the key entirely — otherwise a future subscribe sees a zombie entry.
      if (subscriptionWasCreated && subscription.listeners.size === 0) {
        this.teardown(subscription);
        this.subscriptions.delete(key);
      }
      throw e;
    }

    if (subscription.listeners.size === 1) this.startWs(subscription);

    for (const [address, cached] of subscription.cachedValuesByAddress) {
      try {
        callback(address, cached.buffer, cached.slot);
      } catch (e) {
        this.onError(e);
      }
    }

    const unsubscribe = () => {
      const current = this.subscriptions.get(key);
      if (!current) return;
      current.listeners.delete(listenerId);
      current.onReconnectDemands.delete(listenerId);
      const schedulerDemandChanged = current.schedulerDemands.delete(listenerId);
      if (current.throttleMsDemands.delete(listenerId)) {
        this.recomputeEffectiveThrottle(current);
      }
      if (schedulerDemandChanged) {
        // Scheduler ownership may have transferred or fallen away — re-wire
        // the buffered-drain registration so we don't hold a dead reference
        // to a scheduler whose owner just left.
        this.recomputeActiveScheduler(current);
      }
      if (current.listeners.size === 0) {
        this.teardown(current);
        this.subscriptions.delete(key);
      }
    };

    const flush = () => {
      const current = this.subscriptions.get(key);
      if (current) this.flushSubscription(current);
    };

    return makeSubscriptionHandle(unsubscribe, flush);
  }

  /**
   * Drain any buffered notifications immediately. With `commitment`, flushes
   * just that subscription; without, flushes all matching programId+filters
   * across all commitments.
   *
   * No-op if unbuffered or empty. Cadence timers keep ticking — next firing
   * may be a no-op since the buffer was just cleared.
   */
  flushPending(programId: Address, filters: readonly ProgramFilter[], commitment?: Commitment): void {
    if (commitment) {
      const key = this.buildKey(programId, commitment, filters);
      const subscription = this.subscriptions.get(key);
      if (subscription) this.flushSubscription(subscription);
    } else {
      const serializedFilters = toJson(filters, true);
      for (const subscription of this.subscriptions.values()) {
        if (subscription.programId === programId && subscription.serializedFilters === serializedFilters) {
          this.flushSubscription(subscription);
        }
      }
    }
  }

  getMode(programId: Address, filters: readonly ProgramFilter[], commitment?: Commitment): SubscriptionMode {
    return this.findSubscription(programId, filters, commitment)?.mode ?? 'idle';
  }

  destroy(): void {
    for (const [key, subscription] of this.subscriptions) {
      this.teardown(subscription);
      this.subscriptions.delete(key);
    }
  }

  /** Resolves when the WS subscription is established.
   *
   *  Throws if no subscription matches `(programId, filters, commitment)` —
   *  silently resolving used to make caller typos (wrong commitment, missing
   *  prior `subscribeProgramAccounts`, stale filter array) look like a
   *  successful wait. Failing loudly surfaces the sequencing bug at the
   *  call site. */
  async waitForConnection(
    programId: Address,
    filters: readonly ProgramFilter[],
    commitment?: Commitment
  ): Promise<void> {
    const subscription = this.findSubscription(programId, filters, commitment);
    if (!subscription) {
      throw new Error(
        `AccountSubscriptionManager.waitForConnection: no subscription found for programId=${programId}` +
          `${commitment ? `, commitment=${commitment}` : ' (any commitment)'}. ` +
          'Call subscribeProgramAccounts() first, and ensure the filters/commitment match.'
      );
    }
    await subscription.connectedPromise;
  }

  private buildKey(programId: Address, commitment: string, filters: readonly ProgramFilter[]): string {
    return `${programId}:${commitment}:${toJson(filters, true)}`;
  }

  /** Direct lookup with `commitment`; fan-out scan without. */
  private findSubscription(
    programId: Address,
    filters: readonly ProgramFilter[],
    commitment?: Commitment
  ): ManagedSubscription | undefined {
    if (commitment) {
      return this.subscriptions.get(this.buildKey(programId, commitment, filters));
    }
    const serializedFilters = toJson(filters, true);
    for (const subscription of this.subscriptions.values()) {
      if (subscription.programId === programId && subscription.serializedFilters === serializedFilters) {
        return subscription;
      }
    }
    return undefined;
  }

  /** Re-wire cadence machinery after a demands change. Fast no-op if effective throttle didn't change. */
  private recomputeEffectiveThrottle(subscription: ManagedSubscription): void {
    const newCadence = computeShortestThrottle(subscription.throttleMsDemands);
    if (newCadence === subscription.throttleMs) return;

    const previousCadence = subscription.throttleMs;
    subscription.throttleMs = newCadence;

    this.tearDownActiveCadence(subscription);

    if (subscription.activeScheduler && newCadence !== undefined) {
      this.attachToSchedulerGroup(subscription, newCadence);
    } else if (newCadence === undefined && previousCadence !== undefined) {
      // All throttled subscribers gone — flush so buffered data isn't orphaned.
      this.flushOrphanedBuffer(subscription);
    } else if (newCadence !== undefined && !subscription.activeScheduler) {
      // defined → defined transition with buffered data — re-arm at the new
      // rate so the buffer drains promptly instead of waiting for the next WS
      // notification (could be minutes for low-frequency accounts).
      this.rearmTimerForBufferedData(subscription, newCadence);
    }
  }

  /** Re-pick the active scheduler from current demands and re-wire the
   *  group registration if the choice changed. */
  private recomputeActiveScheduler(subscription: ManagedSubscription): void {
    const newActive = pickFirstScheduler(subscription.schedulerDemands);
    if (newActive === subscription.activeScheduler) return;

    subscription.activeScheduler = newActive;
    // If we were attached to a scheduler group, that registration is now
    // stale (either pointed at a departed scheduler or needs to switch).
    if (subscription.unregisterFromScheduler !== undefined) {
      subscription.unregisterFromScheduler();
      subscription.unregisterFromScheduler = undefined;
    }
    if (newActive !== undefined && subscription.throttleMs !== undefined) {
      this.attachToSchedulerGroup(subscription, subscription.throttleMs);
    } else if (newActive === undefined && subscription.throttleMs !== undefined) {
      // Scheduler disappeared but throttle remains — fall back to the
      // self-managed timer so buffered notifications still drain.
      this.rearmTimerForBufferedData(subscription, subscription.throttleMs);
    }
  }

  private tearDownActiveCadence(subscription: ManagedSubscription): void {
    if (subscription.throttleDrainTimer !== undefined) {
      clearTimeout(subscription.throttleDrainTimer);
      subscription.throttleDrainTimer = undefined;
    }
    if (subscription.unregisterFromScheduler !== undefined) {
      subscription.unregisterFromScheduler();
      subscription.unregisterFromScheduler = undefined;
    }
  }

  private attachToSchedulerGroup(subscription: ManagedSubscription, throttleMs: number): void {
    if (!subscription.activeScheduler) return;
    subscription.unregisterFromScheduler = subscription.activeScheduler.register(() => {
      if (subscription.bufferedNotifications.size === 0) return;
      this.drainBufferedNotifications(subscription);
    }, throttleMs);
  }

  private flushOrphanedBuffer(subscription: ManagedSubscription): void {
    if (subscription.bufferedNotifications.size > 0) {
      this.drainBufferedNotifications(subscription);
    }
  }

  private rearmTimerForBufferedData(subscription: ManagedSubscription, throttleMs: number): void {
    if (subscription.bufferedNotifications.size > 0) {
      this.armThrottleDrainTimer(subscription, throttleMs);
    }
  }

  /** No-op if a timer is already armed. */
  private armThrottleDrainTimer(subscription: ManagedSubscription, throttleMs: number): void {
    if (subscription.throttleDrainTimer !== undefined) return;
    subscription.throttleDrainTimer = setTimeout(() => {
      subscription.throttleDrainTimer = undefined;
      this.drainBufferedNotifications(subscription);
    }, throttleMs);
  }

  private flushSubscription(subscription: ManagedSubscription): void {
    if (subscription.bufferedNotifications.size === 0) return;
    this.onLog('[WS] Flushing', subscription.bufferedNotifications.size, 'throttled notifications');
    if (subscription.throttleDrainTimer) {
      clearTimeout(subscription.throttleDrainTimer);
      subscription.throttleDrainTimer = undefined;
    }
    this.drainBufferedNotifications(subscription);
  }

  private createSubscription(
    key: string,
    programId: Address,
    filters: readonly ProgramFilter[],
    commitment: Commitment
  ): ManagedSubscription {
    let connectedResolve: (() => void) | undefined;
    const connectedPromise = new Promise<void>((resolve) => {
      connectedResolve = resolve;
    });
    const subscription: ManagedSubscription = {
      key,
      programId,
      filters,
      serializedFilters: toJson(filters, true),
      commitment,
      listeners: new Map(),
      cachedValuesByAddress: new Map(),
      mode: 'idle',
      stopWsLoop: undefined,
      onReconnectDemands: new Map(),
      throttleMsDemands: new Map(),
      throttleMs: undefined,
      schedulerDemands: new Map(),
      activeScheduler: undefined,
      bufferedNotifications: new Map(),
      connectedResolve,
      connectedPromise,
      teardownAbortController: new AbortController(),
    };
    this.subscriptions.set(key, subscription);
    return subscription;
  }

  private startWs(subscription: ManagedSubscription): void {
    subscription.mode = 'ws';

    subscription.stopWsLoop = runReconnectLoop<ProgramAccountNotification>({
      wsRpc: this.wsRpc,
      reconnectDelayMs: this.reconnectDelayMs,
      onError: this.onError,
      onLog: this.onLog,
      // Read the latest reconnect hook lazily so hooks added after the loop
      // starts are picked up on the next reconnect. The manager is the
      // documented "wrap with internal retry if mandatory" wrapper from
      // runReconnectLoop's onBeforeReconnect contract: a transient HTTP
      // refresh failure shouldn't cause the listener to resume with stale
      // state and misclassify subsequent fills.
      onBeforeReconnect: () => this.runReconnectHookWithRetry(subscription),
      onSubscribed: () => {
        this.onLog('[WS] Subscription established, listening...');
        subscription.connectedResolve?.();
        subscription.connectedResolve = undefined;
      },
      subscribe: (wsRpc, abortSignal) => {
        this.onLog('[WS] Connecting programSubscribe for', subscription.programId);
        return wsRpc
          .programNotifications(subscription.programId, {
            commitment: subscription.commitment,
            encoding: 'base64',
            filters: subscription.filters,
          })
          .subscribe({ abortSignal }) as unknown as Promise<AsyncIterable<ProgramAccountNotification>>;
      },
      onMessage: ({ context, value: { pubkey, account } }) => {
        if (!account) return;
        this.handleNotification(subscription, pubkey, Buffer.from(account.data[0], 'base64'), context.slot);
      },
    });
  }

  private handleNotification(
    subscription: ManagedSubscription,
    address: Address,
    buffer: Uint8Array,
    slot: Slot
  ): void {
    const cached = subscription.cachedValuesByAddress.get(address);

    if (cached && slot < cached.slot) return;
    if (cached && blobEquals(cached.buffer, buffer)) {
      cached.slot = slot;
      return;
    }

    subscription.cachedValuesByAddress.set(address, { buffer, slot });
    this.deliverByCadence(subscription, address, buffer, slot);
  }

  private deliverByCadence(subscription: ManagedSubscription, address: Address, buffer: Uint8Array, slot: Slot): void {
    if (subscription.unregisterFromScheduler) {
      subscription.bufferedNotifications.set(address, { buffer, slot });
      return;
    }
    if (subscription.throttleMs !== undefined) {
      subscription.bufferedNotifications.set(address, { buffer, slot });
      this.armThrottleDrainTimer(subscription, subscription.throttleMs);
      return;
    }
    this.fireListeners(subscription, address, buffer, slot);
  }

  private drainBufferedNotifications(subscription: ManagedSubscription): void {
    for (const [address, { buffer, slot }] of subscription.bufferedNotifications) {
      this.fireListeners(subscription, address, buffer, slot);
    }
    subscription.bufferedNotifications.clear();
  }

  private fireListeners(subscription: ManagedSubscription, address: Address, buffer: Uint8Array, slot: Slot): void {
    for (const listener of subscription.listeners.values()) {
      try {
        listener(address, buffer, slot);
      } catch (e) {
        this.onError(e);
      }
    }
  }

  private teardown(subscription: ManagedSubscription): void {
    // Abort first so any in-flight onReconnect retry exits its sleep loop
    // before we tear down the WS loop itself.
    subscription.teardownAbortController.abort();
    subscription.stopWsLoop?.();
    subscription.stopWsLoop = undefined;
    if (subscription.throttleDrainTimer) clearTimeout(subscription.throttleDrainTimer);
    subscription.throttleDrainTimer = undefined;
    subscription.unregisterFromScheduler?.();
    subscription.unregisterFromScheduler = undefined;
    subscription.bufferedNotifications.clear();
    subscription.cachedValuesByAddress.clear();
    subscription.mode = 'idle';
    // Settle any pending waitForConnection() — callers must NOT hang forever
    // if the subscription is torn down before the WS handshake completed.
    // Resolve (not reject) so existing await-chains don't need new catch
    // logic; awaiters can re-check manager state if they need certainty.
    subscription.connectedResolve?.();
    subscription.connectedResolve = undefined;
  }

  /** Sleep `ms`, but resolve immediately on abort — mirrors the pattern in
   *  runReconnectLoop so teardown cancels in-flight reconnect-hook retries. */
  private static abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Calls the latest registered `onReconnect` hook with bounded retry-with-
   *  backoff. The manager is the documented wrapper for runReconnectLoop's
   *  best-effort `onBeforeReconnect` contract — failing the hook silently
   *  would let listeners resume with stale state (e.g. borrowOrderFills
   *  misclassifying new fills against pre-downtime obligations).
   *
   *  After {@link RECONNECT_HOOK_MAX_RETRIES} consecutive failures we give
   *  up and proceed anyway: an indefinitely failing hook would block the
   *  WS forever, which is worse than stale state. The error reporter sees
   *  every failure regardless. */
  private async runReconnectHookWithRetry(subscription: ManagedSubscription): Promise<void> {
    const signal = subscription.teardownAbortController.signal;
    let attempt = 0;
    while (!signal.aborted) {
      const hook = pickLatestReconnectHook(subscription.onReconnectDemands);
      if (!hook) return;
      try {
        this.onLog('[WS] Calling onReconnect before re-subscribing (attempt', attempt + 1, ')');
        await hook();
        return;
      } catch (e) {
        this.onError(e);
        attempt++;
        if (attempt >= RECONNECT_HOOK_MAX_RETRIES) {
          this.onLog(
            '[WS] onReconnect failed after',
            RECONNECT_HOOK_MAX_RETRIES,
            'attempts — proceeding with cached state (consumer must reconcile)'
          );
          return;
        }
        const delay = Math.min(this.reconnectDelayMs * 2 ** attempt, RECONNECT_HOOK_MAX_DELAY_MS);
        await AccountSubscriptionManager.abortableSleep(delay, signal);
      }
    }
  }
}
