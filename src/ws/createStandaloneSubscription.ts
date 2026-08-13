/**
 * Composes {@link runReconnectLoop} + {@link createBufferedDispatcher} +
 * {@link makeSubscriptionHandle} for single-source listeners (slot, native SOL).
 *
 * Multi-source listeners (oracle, fan-out per address) compose these
 * primitives directly — they share one dispatcher across multiple loops,
 * which is outside this helper's single-source shape.
 */

import { type RpcSubscriptions, type SolanaRpcSubscriptionsApi } from '@solana/kit';

import { createBufferedDispatcher } from './bufferedDispatcher';
import { makeSubscriptionHandle, type SubscriptionHandle } from './subscriptionHandle';
import type { WsCadenceOptions } from './wsCadenceOptions';
import type { WsListenerObservability } from './wsListenerObservability';
import { runReconnectLoop } from './wsReconnectLoop';

export interface StandaloneSubscriptionOptions<TEvent, TMessage> extends WsListenerObservability, WsCadenceOptions {
  wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** Omit for single-slot (latest-wins). Pass for per-key buckets. */
  keyOf?: (event: TEvent) => unknown;
  subscribe: (
    wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    abortSignal: AbortSignal
  ) => Promise<AsyncIterable<TMessage>>;
  toEvent: (message: TMessage) => TEvent;
  onChange: (event: TEvent) => void;
  /** Prefix for the default `console.error` fallback (e.g. `'[listenToSlotChanges]'`). */
  errorPrefix: string;
  /** Function name used in validation error messages (e.g. `'listenToSlotChanges'`). */
  callSiteName: string;
}

export function createStandaloneSubscription<TEvent, TMessage>(
  opts: StandaloneSubscriptionOptions<TEvent, TMessage>
): SubscriptionHandle {
  const dispatcher = createBufferedDispatcher<TEvent>({
    scheduler: opts.scheduler,
    throttleMs: opts.throttleMs,
    keyOf: opts.keyOf,
    onDeliver: opts.onChange,
    onError: opts.onError,
    errorPrefix: opts.errorPrefix,
    callSiteName: opts.callSiteName,
  });

  const stopReconnectLoop = runReconnectLoop<TMessage>({
    wsRpc: opts.wsRpc,
    reconnectDelayMs: opts.reconnectDelayMs,
    onError: opts.onError,
    onLog: opts.onLog,
    onBeforeReconnect: opts.onBeforeReconnect,
    subscribe: opts.subscribe,
    onMessage: (message) => dispatcher.push(opts.toEvent(message)),
  });

  return makeSubscriptionHandle(
    () => {
      // Drop dispatcher first so an in-flight scheduler tick can't re-fire
      // while we're tearing down the loop.
      dispatcher.unsubscribe();
      stopReconnectLoop();
    },
    () => dispatcher.flush()
  );
}
