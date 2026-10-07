import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import { Instruction } from '@solana/kit';
import {
  buildComputeBudgetIx,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  getCurrentLedgerInstant,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

// redeemInKind ixs per transaction; pick the size that fits your transactions
const REDEEM_IXS_PER_TX = 2;

/**
 * Redeem shares in kind (receive cTokens) with a memo.
 *
 * The SDK returns the memo ix only as `memoIx` and adds it to no instruction group.
 * Rule: every transaction that holds redeemInKind ixs (they burn the user's shares) must also hold `memoIx`.
 * The position of `memoIx` inside the transaction does not matter.
 * `setupIxs` (farm unstake, cToken ATA creation) burn no shares, so a transaction with only setup ixs needs no memo.
 */
(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);

  // read the vault state and pre-load everything the redeem needs (avoids redundant RPC calls)
  const vaultState = await vault.getState();
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const globalConfigState = await kaminoManager.loadKVaultGlobalConfig();
  const farmState = await kaminoManager.loadVaultFarmState(vaultState);
  const computeBudgetIx = buildComputeBudgetIx(1_000_000);

  // redeem 100 shares in kind, with a memo
  const sharesToRedeem = new Decimal(100.0);
  const memo = 'test-memo';
  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'confirmed');
  const redeemIxs = await kaminoManager.redeemInKindIxs(
    user,
    vault,
    sharesToRedeem,
    currentLedgerInstant,
    vaultReservesMap,
    vaultState,
    globalConfigState,
    farmState,
    null,
    undefined,
    false,
    undefined,
    memo
  );

  if (redeemIxs.redeemInKindIxs.length === 0) {
    console.log('Nothing to redeem in kind');
    return;
  }

  // `memoIx` is set only when the redeem burns shares
  const memoIxs = redeemIxs.memoIx ? [redeemIxs.memoIx] : [];

  // Split the redeemInKind ixs into transactions: each one burns shares, so each one holds the memo
  const redeemTxs: Instruction[][] = [];
  for (let i = 0; i < redeemIxs.redeemInKindIxs.length; i += REDEEM_IXS_PER_TX) {
    const redeemChunk = redeemIxs.redeemInKindIxs.slice(i, i + REDEEM_IXS_PER_TX).map((r) => r.ix);
    redeemTxs.push([...redeemChunk, ...memoIxs]);
  }

  // The setup (farm unstake, cToken ATA creation) runs before the redeems and the cleanup (account closes) after them.
  // They burn no shares, so their transactions need no memo.
  // You can also merge them into the first and last redeem transaction when they fit; the memo rule stays the same.
  const txs = [redeemIxs.setupIxs, ...redeemTxs, redeemIxs.cleanupIxs].filter((ixs) => ixs.length > 0);

  // send the transactions in order
  for (const [i, ixs] of txs.entries()) {
    await sendAndConfirmTx(c, user, [computeBudgetIx, ...ixs], [], redeemIxs.luts, `RedeemInKindWithMemo_${i + 1}`);
  }
})().catch(async (e) => {
  console.error(e);
});
