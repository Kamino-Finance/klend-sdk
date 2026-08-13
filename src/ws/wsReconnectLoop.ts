/**
 * Shared reconnect loop for WS subscriptions (oracle, slot, native SOL,
 * and AccountSubscriptionManager).
 *
 * Guarantees:
 * - Auto-reconnect with exponential backoff, capped at 30s.
 * - Backoff escalates ONLY after a connection that never delivered a
 *   message — once any message arrives, the next reconnect restarts at
 *   `baseDelay`. (A healthy connection that drops shouldn't wait 30s.)
 * - Consumer callback throws are isolated — reported via `onError` but
 *   never tear down the WS.
 * - Clean stream close → reconnect after `baseDelay` (no escalation).
 * - Returned unsubscribe aborts the loop AND any pending sleep.
 */
import { type RpcSubscriptions, type SolanaRpcSubscriptionsApi } from '@solana/kit';

import { makeWsErrorReporter, type WsErrorReporter } from './wsErrorReporter';

// Local one-liner — avoids dragging `src/classes/utils.ts` (and its
// transitive axios/decimal.js/token deps) into the WS foundation layer.
const noop = (): void => {};

export const WS_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 30_000;

export interface WsReconnectLoopParams<TMessage> {
  wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** Called on initial connect and every reconnect.
   *
   *  **REQUIRED contract:** the returned async iterable's underlying
   *  subscription MUST honor `abortSignal`. `unsubscribe()` aborts the loop
   *  via this signal; an implementation that ignores it will leave the loop
   *  hung awaiting `subscribe()` and prevent teardown.
   *
   *  `@solana/kit` subscription factories accept `{ abortSignal }` and honor
   *  it natively — pass it through verbatim. */
  subscribe: (
    wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    abortSignal: AbortSignal
  ) => Promise<AsyncIterable<TMessage>>;
  /** Throws are caught and routed to {@link onError}. */
  onMessage: (message: TMessage) => void;
  /** Defaults to `console.error`. Throws here are swallowed (logged) so a
   *  buggy onError can't tear down the loop. */
  onError?: (error: unknown) => void;
  /** Lifecycle logging hook. Defaults to noop. */
  onLog?: (...args: unknown[]) => void;
  /** Called before every reconnect (NOT initial connect). Use to refresh
   *  state via HTTP after long downtime.
   *
   *  **Best-effort.** A throw is routed to `onError` and reconnect proceeds
   *  with cached state — wrap with internal retry if mandatory. */
  onBeforeReconnect?: () => void | Promise<void>;
  /** Fires after `subscribe()` resolves successfully — i.e. the handshake
   *  completed, but the stream has NOT yet delivered any message. This is
   *  the "subscribed" milestone, not "healthy / receiving data". For the
   *  latter, gate on the first `onMessage` call.
   *
   *  The reconnect loop deliberately treats subscribed and first-message
   *  differently: only the first message resets the backoff counter. */
  onSubscribed?: () => void;
  /** Initial reconnect delay; doubles per failure, capped at 30s. Default 500. */
  reconnectDelayMs?: number;
}

/** Sleep `ms`, but resolve immediately on abort — prevents teardown blocking
 *  on a stale timer for up to {@link MAX_RECONNECT_DELAY_MS}. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    // Remove the abort listener on normal timeout — long-lived loops would
    // otherwise accumulate listeners on the same AbortSignal.
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

/** Calls `onFirstMessage` exactly once when the first message arrives from
 *  the stream — the loop uses this to reset its backoff counter only on a
 *  "real" connection (one that actually received data from the wire).
 *
 *  We mark the connection healthy BEFORE invoking the consumer callback:
 *  message arrival proves the stream is alive, and a consumer-side throw is
 *  the consumer's bug, not a "no-message" connection. The previous
 *  ordering meant a throw in the very first `deliver()` left
 *  `firstDelivered=false`, so a later stream failure would incorrectly
 *  escalate backoff. */
async function consumeMessages<TMessage>(
  messageStream: AsyncIterable<TMessage>,
  signal: AbortSignal,
  deliver: (message: TMessage) => void,
  onError: (error: unknown) => void,
  onFirstMessage: () => void
): Promise<void> {
  let firstDelivered = false;
  for await (const message of messageStream) {
    if (signal.aborted) return;
    if (!firstDelivered) {
      firstDelivered = true;
      onFirstMessage();
    }
    try {
      deliver(message);
    } catch (e) {
      onError(e);
    }
  }
}

function computeBackoffDelay(baseDelay: number, consecutiveFailures: number): number {
  return Math.min(baseDelay * 2 ** consecutiveFailures, MAX_RECONNECT_DELAY_MS);
}

/** Wrap a no-arg sync hook so throws route through the reporter. Returns
 *  immediately, no microtask hop — used for `onSubscribed` so the connect
 *  path stays on the same tick. */
function safelyInvoke(reporter: WsErrorReporter, hook: (() => void) | undefined): () => void {
  return () => {
    if (!hook) return;
    try {
      hook();
    } catch (e) {
      reporter.reportError(e);
    }
  };
}

/** Wrap a varargs sync hook (logger) so throws route through the reporter. */
function safelyInvokeLog(reporter: WsErrorReporter, hook: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args) => {
    try {
      hook(...args);
    } catch (e) {
      reporter.reportError(e);
    }
  };
}

/** Wrap a no-arg async-or-sync hook (`onBeforeReconnect`) so rejections route
 *  through the reporter. */
function safelyInvokeAsync(
  reporter: WsErrorReporter,
  hook: (() => void | Promise<void>) | undefined
): () => Promise<void> {
  return async () => {
    if (!hook) return;
    try {
      await hook();
    } catch (e) {
      reporter.reportError(e);
    }
  };
}

export function runReconnectLoop<TMessage>(params: WsReconnectLoopParams<TMessage>): () => void {
  const baseDelay = params.reconnectDelayMs ?? WS_RECONNECT_DELAY_MS;
  const userOnLog = params.onLog ?? noop;
  const abortController = new AbortController();
  const { signal } = abortController;

  const errorReporter = makeWsErrorReporter('[ws-reconnect-loop]', params.onError);
  const reportError = errorReporter.reportError;
  const safeOnLog = safelyInvokeLog(errorReporter, userOnLog);
  const safeOnBeforeReconnect = safelyInvokeAsync(errorReporter, params.onBeforeReconnect);
  const safeOnSubscribed = safelyInvoke(errorReporter, params.onSubscribed);

  const loop = async () => {
    let consecutiveFailures = 0;
    let hasEverConnected = false;

    while (!signal.aborted) {
      // Per-iteration flag: did THIS connection deliver any messages?
      // Drives the "backoff escalates only on no-message connections" rule
      // — see catch block below.
      let messageDeliveredThisConnection = false;
      try {
        if (hasEverConnected) {
          safeOnLog('[ws] running onBeforeReconnect');
          await safeOnBeforeReconnect();
          if (signal.aborted) break;
        }

        safeOnLog('[ws] subscribing');
        const messageStream = await params.subscribe(params.wsRpc, signal);
        // Don't reset `consecutiveFailures` here — handshake success doesn't
        // prove the connection is healthy. Reset happens in consumeMessages
        // once a message actually arrives.
        safeOnLog('[ws] subscribed');
        hasEverConnected = true;
        safeOnSubscribed();

        await consumeMessages(messageStream, signal, params.onMessage, reportError, () => {
          consecutiveFailures = 0;
          messageDeliveredThisConnection = true;
        });

        if (signal.aborted) break;
        // Clean close = not a failure. Reset the counter so prior failures
        // (if any) don't escalate the next reconnect's backoff. Doc contract:
        // "Clean stream close → reconnect after baseDelay (no escalation)."
        consecutiveFailures = 0;
        safeOnLog('[ws] stream ended cleanly, reconnecting');
        await abortableSleep(baseDelay, signal);
      } catch (e) {
        if (signal.aborted) break;
        reportError(e);
        const delay = computeBackoffDelay(baseDelay, consecutiveFailures);
        safeOnLog('[ws] reconnecting in', delay, 'ms (attempt', consecutiveFailures + 1, ')');
        // Only escalate when THIS connection delivered no messages. Doc
        // contract: "Backoff escalates ONLY after a connection that never
        // delivered a message." If a healthy connection drops, the next
        // reconnect uses baseDelay and we don't accumulate escalation.
        if (!messageDeliveredThisConnection) {
          consecutiveFailures++;
        }
        await abortableSleep(delay, signal);
      }
    }
  };

  // loop() resolves cleanly — every throw is caught inside the while body.
  void loop();

  return () => abortController.abort();
}
