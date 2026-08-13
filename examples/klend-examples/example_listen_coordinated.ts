import {
  AccountSubscriptionManager,
  createUpdateScheduler,
  listenToObligationChanges,
  listenToOraclePriceChanges,
  listenToReserveChanges,
  listenToSlotChanges,
} from '@kamino-finance/klend-sdk';
import { SCOPE_MAINNET_KLEND_FEED } from '@kamino-finance/scope-sdk';
import { address } from '@solana/kit';
import { getMarket } from '../utils/helpers';
import { MAIN_MARKET } from '../utils/constants';
import { getConnectionPool } from '../utils/connection';

/**
 * Coordinated multi-stream subscription.
 *
 * Real-world UI scenario: when an obligation update arrives (a user-triggered
 * borrow/repay just landed on chain), every dependent stream — reserves,
 * oracles, slot — should refresh together so the user sees one coherent
 * snapshot instead of three staggered re-renders.
 *
 * The pattern:
 *  1. Create a single `UpdateScheduler` for the app.
 *  2. Pass `{ scheduler, throttleMs }` (the `wsCadence` shape) to every
 *     listener that should participate in coordinated rendering. Listeners
 *     with the same `throttleMs` land in the same scheduler group and flush
 *     together on each tick.
 *  3. Listeners that should deliver IMMEDIATELY (obligations, balances —
 *     things tied to user actions) skip the scheduler.
 *  4. From the immediate-delivery handler, call `scheduler.updateNow()` to
 *     drain every coordinated stream synchronously — guarantees a coherent
 *     snapshot keyed off the user-action event.
 *
 * Browser callers wrap the drain in `requestAnimationFrame` via the
 * `schedule` option so updates land on a paint boundary and skip work
 * entirely while the tab is hidden. Node callers omit `schedule`.
 *
 *   yarn run listen-coordinated
 */
(async () => {
  const c = getConnectionPool();
  const market = await getMarket({ rpc: c.rpc, marketPubkey: MAIN_MARKET });
  const owner = address('Hs9ioQZ2pCUyvS18anwmBxjQJsZrMPShwTMLySD6Us3V');

  // One scheduler for the app. Browser would pass:
  //   schedule: (cb) => requestAnimationFrame(() => cb())
  const scheduler = createUpdateScheduler({
    onError: (e) => console.error('[scheduler]', e),
  });

  // The shared cadence — every coordinated listener uses this exact object.
  const wsCadence = { scheduler, throttleMs: 5_000 } as const;

  const manager = new AccountSubscriptionManager({ wsRpc: c.wsRpc });

  // --- Coordinated streams (slow, grouped, drain together) ---

  const stopSlot = listenToSlotChanges({
    wsRpc: c.wsRpc,
    ...wsCadence,
    onChange: ({ slot }) => console.log(`[coordinated] slot ${slot.toString()}`),
  });

  const stopOracle = listenToOraclePriceChanges({
    wsRpc: c.wsRpc,
    oracleAddresses: [SCOPE_MAINNET_KLEND_FEED.oraclePrices],
    ...wsCadence,
    onChange: ({ slot }) => console.log(`[coordinated] oracle slot ${slot.toString()}`),
  });

  const stopReserves = listenToReserveChanges({
    manager,
    marketAddress: MAIN_MARKET,
    ...wsCadence,
    onChange: ({ address: addr, slot }) =>
      console.log(`[coordinated] reserve ${addr.toString().slice(0, 8)}... slot ${slot.toString()}`),
  });

  // --- Immediate-delivery stream (no cadence — obligations are
  //     low-frequency and tied to user actions). On each event, fire
  //     scheduler.updateNow() to drain the coordinated streams alongside it.

  const stopObligation = listenToObligationChanges({
    manager,
    markets: new Map([[market.getAddress(), market]]),
    owner,
    onChange: ({ address: addr, slot }) => {
      console.log(`[immediate] obligation ${addr.toString().slice(0, 8)}... slot ${slot.toString()}`);
      // Drain coordinated streams now so the user sees a coherent snapshot
      // (latest reserves + oracle + slot, all keyed off this obligation event).
      scheduler.updateNow();
    },
  });

  // Demonstrate manual per-handle flush: drains just the reserve buffer,
  // independent of the scheduler's group tick.
  setTimeout(() => {
    console.log('--- manual reserve flush ---');
    stopReserves.flush();
  }, 7_000);

  // Demonstrate looking up a single obligation's flush via the handle —
  // useful if you want to drain just that listener.
  setTimeout(() => stopObligation.flush(), 12_000);

  // Tear down everything after 30s.
  setTimeout(() => {
    stopSlot();
    stopOracle();
    stopReserves();
    stopObligation();
    manager.destroy();
    scheduler.destroy();
    console.log('all subscriptions stopped');
  }, 30_000);
})().catch(console.error);
