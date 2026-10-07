import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import { Instruction } from '@solana/kit';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  getCurrentLedgerInstant,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

// Withdraw ixs per transaction; pick the size that fits your transactions
const WITHDRAW_IXS_PER_TX = 3;

/**
 * Withdraw with a memo.
 *
 * The SDK returns the memo ix only as `memoIx` and adds it to no instruction group.
 * Rule: every transaction that holds withdraw ixs (they burn the user's shares) must also hold `memoIx`.
 * The position of `memoIx` inside the transaction does not matter.
 * A withdraw from many reserves can need more than one transaction: then each of those transactions gets `memoIx`.
 */
(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();

  // pre-load vault reserves once and pass to all methods (avoids redundant RPC calls)
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const farmState = await kaminoManager.loadVaultFarmState(vaultState);

  // withdraw 100 shares from the vault, with a memo
  const sharesToWithdraw = new Decimal(100.0);
  const memo = 'test-memo';
  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'confirmed');
  const withdrawIxs = await kaminoManager.withdrawFromVaultIxs(
    user,
    vault,
    sharesToWithdraw,
    currentLedgerInstant,
    vaultReservesMap,
    farmState,
    null,
    undefined,
    undefined,
    false,
    undefined,
    memo
  );

  // `memoIx` is set only when the withdraw burns shares
  const memoIxs = withdrawIxs.memoIx ? [withdrawIxs.memoIx] : [];

  // Split the withdraw ixs into transactions: each one burns shares, so each one holds the memo
  const withdrawTxs: Instruction[][] = [];
  for (let i = 0; i < withdrawIxs.withdrawIxs.length; i += WITHDRAW_IXS_PER_TX) {
    withdrawTxs.push([...withdrawIxs.withdrawIxs.slice(i, i + WITHDRAW_IXS_PER_TX), ...memoIxs]);
  }

  // The farm unstake runs before the withdraws and the account closes run after them.
  // They burn no shares, so their transactions need no memo.
  // You can also merge them into the first and last withdraw transaction when they fit; the memo rule stays the same.
  const txs = [withdrawIxs.unstakeFromFarmIfNeededIxs, ...withdrawTxs, withdrawIxs.postWithdrawIxs].filter(
    (ixs) => ixs.length > 0
  );

  // send the transactions in order
  for (const [i, ixs] of txs.entries()) {
    await sendAndConfirmTx(c, user, ixs, [], [vaultState.vaultLookupTable], `WithdrawFromVaultWithMemo_${i + 1}`);
  }
})().catch(async (e) => {
  console.error(e);
});
