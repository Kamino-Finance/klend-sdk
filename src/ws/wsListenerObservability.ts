/**
 * Shared observability + reconnect-lifecycle knobs for standalone WS listeners.
 */

import type { Slot } from '@solana/kit';

export interface WsListenerObservability {
  /** Defaults to `console.error('[<listenerName>]', e)`. Throws inside this
   *  handler are swallowed (logged), so a buggy onError can't tear down. */
  onError?: (error: unknown) => void;
  /** Lifecycle logging hook. Throws are routed to `onError`. */
  onLog?: (...args: unknown[]) => void;
  /** Called before re-subscribing on reconnect (skipped on initial connect).
   *
   *  **Best-effort.** A throw here is routed to `onError` and the reconnect
   *  proceeds with whatever local state is currently cached — wrap with
   *  internal retry if your refresh is mandatory. */
  onBeforeReconnect?: () => void | Promise<void>;
  /** Initial reconnect delay (ms); doubles per failure, capped at 30s. Default 500. */
  reconnectDelayMs?: number;
}

/** `{ context: { slot }, value: <payload> }` — shape of a Solana RPC subscription message. */
export interface RpcNotification<TValue> {
  context: { slot: Slot };
  value: TValue;
}
