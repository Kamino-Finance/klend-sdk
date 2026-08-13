import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();

  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();

  // pre-load vault reserves once and pass to all methods (avoids redundant RPC calls)
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const farmState = await kaminoManager.loadVaultFarmState(vaultState);

  // withdraw 100 shares from the vault
  const sharesToWithdraw = new Decimal(100.0);
  const slot = await c.rpc.getSlot({ commitment: 'confirmed' }).send();
  const withdrawIx = await kaminoManager.withdrawFromVaultIxs(
    user,
    vault,
    sharesToWithdraw,
    slot,
    vaultReservesMap,
    farmState,
    null
  );

  // send the vault-farm unstake ixs first if the vault farm was provided, then the withdraw ixs
  await sendAndConfirmTx(
    c,
    user,
    [...withdrawIx.unstakeFromFarmIfNeededIxs, ...withdrawIx.withdrawIxs, ...withdrawIx.postWithdrawIxs],
    [],
    [vaultState.vaultLookupTable],
    'WithdrawFromVault'
  );
})().catch(async (e) => {
  console.error(e);
});
