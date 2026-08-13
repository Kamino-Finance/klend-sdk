import { listenToSlotChanges } from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';

/**
 * Simplest WS listener: receive every Solana slot change.
 *
 * Pattern: pass `wsRpc` + `onChange`. The returned handle is callable
 * to unsubscribe; `.flush()` is a no-op when no cadence is configured.
 *
 *   yarn run listen-slot
 */
(async () => {
  const { wsRpc } = getConnectionPool();

  const stop = listenToSlotChanges({
    wsRpc,
    onChange: ({ slot }) => {
      console.log('slot:', slot.toString());
    },
    onError: (e) => console.error('slot listener error:', e),
  });

  // Run for 30s, then unsubscribe.
  setTimeout(() => {
    console.log('stopping...');
    stop();
  }, 30_000);
})().catch(console.error);
