import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import {
  buildComputeBudgetIx,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  getCurrentLedgerInstant,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

/**
 * Full exit flow: withdraw instantly available liquidity, redeem in kind (receive cTokens) for the
 * portion locked in reserves, and enqueue the cTokens into the klend withdrawal queue so the user
 * eventually receives the underlying tokens.
 *
 * Depending on the vault's liquidity state, some of these steps may be no-ops:
 *  - If all liquidity is available for instant withdraw, redeemInKind and enqueue will be empty.
 *  - If some liquidity is locked in reserves with active borrows, withdraw handles what's available,
 *    redeemInKind converts the rest to cTokens, and enqueue puts them in the klend withdrawal queue.
 */
(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);

  // read the vault state so we can use the LUT in transactions
  const vaultState = await vault.getState();

  // pre-load vault reserves once and pass to all methods (avoids redundant RPC calls)
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const globalConfigState = await kaminoManager.loadKVaultGlobalConfig();
  const farmState = await kaminoManager.loadVaultFarmState(vaultState);
  const sharesToExit = new Decimal(100.0);
  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'confirmed');
  const computeBudgetIx = buildComputeBudgetIx(1_000_000);

  const result = await kaminoManager.withdrawRedeemAndEnqueueIxs(
    user,
    vault,
    sharesToExit,
    currentLedgerInstant,
    vaultReservesMap,
    vaultState,
    globalConfigState,
    farmState,
    null
  );

  // Step 1: Withdraw instantly available liquidity
  // The unstake ixs must come before withdraw ixs since shares need to be unstaked from the
  // vault farm before they can be withdrawn when the user position is staked there.
  if (result.withdrawIxs.withdrawIxs.length > 0) {
    await sendAndConfirmTx(
      c,
      user,
      [
        computeBudgetIx,
        ...result.withdrawIxs.unstakeFromFarmIfNeededIxs,
        ...result.withdrawIxs.withdrawIxs,
        ...result.withdrawIxs.postWithdrawIxs,
      ],
      [],
      [vaultState.vaultLookupTable],
      'Withdraw'
    );
  }

  // Step 2: Redeem in kind — receive cTokens for the portion that cannot be instantly withdrawn
  // because reserves have active borrows draining their liquidity.
  if (result.redeemInKindIxs.redeemInKindIxs.length > 0) {
    await sendAndConfirmTx(
      c,
      user,
      [
        computeBudgetIx,
        ...result.redeemInKindIxs.setupIxs,
        ...result.redeemInKindIxs.redeemInKindIxs.map((r) => r.ix),
        ...result.redeemInKindIxs.cleanupIxs,
      ],
      [],
      result.redeemInKindIxs.luts,
      'RedeemInKind'
    );
  }

  // Step 3: Enqueue the cTokens received from redeemInKind into the klend withdrawal queue.
  // Once the reserve has enough liquidity (e.g. borrows are repaid) the user can claim the
  // underlying tokens from the queue.
  if (result.enqueueIxs.enqueueIxs.length > 0) {
    await sendAndConfirmTx(
      c,
      user,
      [
        computeBudgetIx,
        ...result.enqueueIxs.setupIxs,
        ...result.enqueueIxs.enqueueIxs,
        ...result.enqueueIxs.cleanupIxs,
      ],
      [],
      [],
      'EnqueueToWithdraw'
    );
  }

  console.log('Full exit flow completed');
})().catch(async (e) => {
  console.error(e);
});
