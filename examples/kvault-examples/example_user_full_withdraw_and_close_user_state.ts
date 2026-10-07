import { address } from '@solana/kit';
import {
  buildComputeBudgetIx,
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getEnvOrThrow } from '../utils/env';
import { getKeypair } from '../utils/keypair';
import { ensureTransactionFitsWithLookupTable } from '../utils/lookupTable';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const vaultAddress = address(getEnvOrThrow('VAULT_ADDRESS'));
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, vaultAddress, slotDuration);
  const vaultState = await vault.getState();
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const farmState = await kaminoManager.loadVaultFarmState(vaultState);
  if (!farmState) {
    throw new Error(`Vault ${vaultAddress} does not have a vault farm`);
  }

  const userShares = await kaminoManager.getUserSharesBalanceSingleVault(user.address, vault);
  if (userShares.totalShares.lte(0)) {
    throw new Error(`User ${user.address} does not have shares in vault ${vaultAddress}`);
  }
  if (userShares.stakedShares.lte(0)) {
    throw new Error(`User ${user.address} does not have staked shares in vault farm ${vaultState.vaultFarm}`);
  }

  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'confirmed');
  const closeUserStateIfPossible = true;
  const withdrawIxs = await kaminoManager.withdrawFromVaultIxs(
    user,
    vault,
    userShares.totalShares, // Share-token units, not share lamports.
    currentLedgerInstant,
    vaultReservesMap,
    farmState,
    null,
    user,
    undefined,
    closeUserStateIfPossible
  );

  // Keep these arrays in this order and submit them in one transaction.
  // The SDK puts reward collection before unstake and user-state closure after the KVault withdrawal.
  const atomicFullExitIxs = [
    buildComputeBudgetIx(1_000_000),
    ...withdrawIxs.unstakeFromFarmIfNeededIxs,
    ...withdrawIxs.withdrawIxs,
    ...withdrawIxs.postWithdrawIxs,
  ];
  const lookupTableAddresses = await ensureTransactionFitsWithLookupTable(c, user, atomicFullExitIxs, [
    vaultState.vaultLookupTable,
  ]);

  await sendAndConfirmTx(c, user, atomicFullExitIxs, [], lookupTableAddresses, 'FullWithdrawAndCloseFarmUserState');
})().catch(async (error) => {
  console.error(error);
});
