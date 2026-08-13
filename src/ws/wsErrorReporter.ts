/**
 * Shared "errors don't tear things down" reporter for WS subscriptions.
 *
 * Routes errors to the user handler with a labeled `console.error` fallback;
 * if the user handler itself throws, it's swallowed after one fallback log
 * attempt — a buggy `onError` can't tear down its host.
 */

export interface WsErrorReporter {
  reportError(error: unknown): void;
}

export function makeWsErrorReporter(prefix: string, userOnError?: (error: unknown) => void): WsErrorReporter {
  const consoleFallback = (e: unknown) => console.error(prefix, e);
  const handler = userOnError ?? consoleFallback;
  return {
    reportError(e) {
      try {
        handler(e);
      } catch (innerErr) {
        // The user's handler threw. Log the ORIGINAL error first — that's the
        // one the caller cared about and it would otherwise vanish entirely.
        // Then log the handler's own bug so it's not silently swallowed either.
        try {
          consoleFallback(e);
        } catch {
          /* nothing more we can do */
        }
        try {
          consoleFallback(innerErr);
        } catch {
          /* nothing more we can do */
        }
      }
    },
  };
}
