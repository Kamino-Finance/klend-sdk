import { listenToOraclePriceChanges } from '@kamino-finance/klend-sdk';
import { SCOPE_MAINNET_KLEND_FEED } from '@kamino-finance/scope-sdk';
import { getConnectionPool } from '../utils/connection';

/**
 * Listen to Scope oracle price updates with trailing-edge throttle.
 *
 * Pattern shown:
 *  - Multiple oracle addresses fan out under one shared async iterable
 *    (one reconnect loop per address, multiplexed over a single WS).
 *  - `throttleMs` collapses high-frequency updates into the latest-per-window
 *    per address — prevents UI thrash when prices stream every slot.
 *
 *   yarn run listen-oracle
 */
(async () => {
  const { wsRpc } = getConnectionPool();

  // Scope normally stores all klend token prices in a single OraclePrices
  // account (`SCOPE_MAINNET_KLEND_FEED.oraclePrices`), so this list is
  // usually length 1. Multiple entries are supported for unusual deployments.
  const oracleAddresses = [SCOPE_MAINNET_KLEND_FEED.oraclePrices];

  const stop = listenToOraclePriceChanges({
    wsRpc,
    oracleAddresses,
    throttleMs: 1_000, // at most one delivery per second per address
    onChange: ({ address: oracleAddress, slot }) => {
      console.log(`oracle ${oracleAddress.toString().slice(0, 8)}... updated at slot ${slot.toString()}`);
    },
    onError: (e) => console.error('oracle listener error:', e),
  });

  setTimeout(() => stop(), 30_000);
})().catch(console.error);
