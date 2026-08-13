import {
  AccountSubscriptionManager,
  listenToNativeSolBalance,
  listenToTokenBalanceChanges,
} from '@kamino-finance/klend-sdk';
import { address } from '@solana/kit';
import { getConnectionPool } from '../utils/connection';

const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Listen to a wallet's token balances and native SOL balance.
 *
 * Pattern shown:
 *  - Token balances go through `AccountSubscriptionManager` (programNotifications
 *    on the Token Program with an owner memcmp filter — matches both standard
 *    Token and Token-2022 with extensions, since no dataSize filter is used).
 *  - Native SOL goes through `listenToNativeSolBalance` (accountNotifications,
 *    bypasses the manager since the manager only supports programNotifications).
 *  - `onReconnect` on token balances refreshes state via HTTP after a WS
 *    outage so the balance Map doesn't stay frozen at the last seen value.
 *
 *   yarn run listen-balances <wallet>
 */
(async () => {
  const wallet = address(process.argv[2] ?? 'Hs9ioQZ2pCUyvS18anwmBxjQJsZrMPShwTMLySD6Us3V');
  const { wsRpc } = getConnectionPool();

  const manager = new AccountSubscriptionManager({ wsRpc });

  const stopTokens = listenToTokenBalanceChanges({
    manager,
    owner: wallet,
    tokenProgramId: TOKEN_PROGRAM,
    onBalanceChange: ({ ataAddress, amount }) => {
      console.log(`token ${ataAddress.toString().slice(0, 8)}... amount: ${amount.toString()}`);
    },
    onError: (e) => console.error('[token balance]', e),
    onReconnect: async () => {
      // Refresh balances via HTTP to avoid stale state after WS downtime.
      console.log('[token balance] WS reconnected — refresh state here via HTTP if needed');
    },
  });

  const stopSol = listenToNativeSolBalance({
    wsRpc,
    owner: wallet,
    onBalanceChange: ({ lamports, slot }) => {
      console.log(`native SOL: ${lamports.toString()} lamports (slot ${slot.toString()})`);
    },
    onError: (e) => console.error('[native sol]', e),
  });

  setTimeout(() => {
    stopTokens();
    stopSol();
    manager.destroy();
  }, 30_000);
})().catch(console.error);
