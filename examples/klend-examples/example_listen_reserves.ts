import { AccountSubscriptionManager, listenToReserveChanges, Reserve } from '@kamino-finance/klend-sdk';
import { MAIN_MARKET } from '../utils/constants';
import { getConnectionPool } from '../utils/connection';

/**
 * Listen to all reserves of a single market.
 *
 * Pattern shown:
 *  - `AccountSubscriptionManager` multiplexes one programNotifications stream
 *    per (programId, filters, commitment) key. Multiple listeners that share
 *    a key share the WS — last unsubscribe tears it down.
 *  - `throttleMs: 5_000` because reserves update every slot (~400 ms);
 *    coalescing them into 5 s windows is plenty for typical UIs.
 *  - `onError` receives all decode/listener throws — they NEVER tear down
 *    the WS. Reconnects only happen on transport-level errors.
 *
 *   yarn run listen-reserves
 */
(async () => {
  const { wsRpc } = getConnectionPool();

  const manager = new AccountSubscriptionManager({
    wsRpc,
    onLog: (...args) => console.log('[manager]', ...args),
    onError: (e) => console.error('[manager error]', e),
  });

  const stop = listenToReserveChanges({
    manager,
    marketAddress: MAIN_MARKET,
    throttleMs: 5_000,
    onChange: ({ address, reserve, slot }) => {
      console.log(
        `reserve ${address.toString().slice(0, 8)}...`,
        'liquidity:',
        (reserve as Reserve).liquidity.totalAvailableAmount.toString(),
        'slot:',
        slot.toString()
      );
    },
    onError: (e) => console.error('[reserve listener]', e),
  });

  // Manual flush bypasses the 5 s window — useful when an external event
  // (e.g. user submitted a tx) needs the freshest data right now.
  setTimeout(() => {
    console.log('manually flushing...');
    stop.flush();
  }, 7_000);

  setTimeout(() => {
    stop();
    manager.destroy();
  }, 30_000);
})().catch(console.error);
