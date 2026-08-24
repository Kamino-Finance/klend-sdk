import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import {
  DEFAULT_PUBLIC_KEY,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  getCurrentLedgerInstant,
} from '@kamino-finance/klend-sdk';
import { fetchMaybeFarmState } from '@kamino-finance/farms-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();
  if (vaultState.firstLossCapitalFarm === DEFAULT_PUBLIC_KEY) {
    throw new Error('This vault does not have a first loss capital farm configured.');
  }

  // pre-load vault reserves once and pass to all methods (avoids redundant RPC calls)
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const maybeFlcFarmState = await fetchMaybeFarmState(c.rpc, vaultState.firstLossCapitalFarm);
  const flcFarmState = maybeFlcFarmState.exists ? maybeFlcFarmState.data : null;
  if (!flcFarmState) {
    throw new Error('Could not load the first loss capital farm state.');
  }

  // withdraw 100 shares from the vault after unstaking them from the first loss capital farm
  const sharesToWithdraw = new Decimal(100.0);
  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc, 'confirmed');
  const withdrawIx = await kaminoManager.withdrawFromVaultIxs(
    user,
    vault,
    sharesToWithdraw,
    currentLedgerInstant,
    vaultReservesMap,
    null,
    flcFarmState
  );

  await sendAndConfirmTx(
    c,
    user,
    [...withdrawIx.unstakeFromFarmIfNeededIxs, ...withdrawIx.withdrawIxs, ...withdrawIx.postWithdrawIxs],
    [],
    [vaultState.vaultLookupTable],
    'WithdrawFromVaultAndUnstakeFromFlc'
  );
})().catch(async (e) => {
  console.error(e);
});
