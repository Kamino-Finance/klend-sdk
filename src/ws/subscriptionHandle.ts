/**
 * Generic return type for every WS subscription in this SDK.
 *
 * Callable as `() => void` to unsubscribe; `.flush()` drains the internal
 * buffer immediately (no-op if unbuffered) without affecting the running
 * cadence. Use `flush()` when one stream needs fresh state from another
 * before the next scheduler tick.
 */
export type SubscriptionHandle = (() => void) & {
  flush(): void;
};

export function makeSubscriptionHandle(unsubscribe: () => void, flush: () => void): SubscriptionHandle {
  const handle = unsubscribe as SubscriptionHandle;
  handle.flush = flush;
  return handle;
}
