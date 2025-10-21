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

  // withdraw 100 shares from the vault
  const sharesToWithdraw = new Decimal(100.0);
  const withdrawIx = await kaminoManager.withdrawFromVaultIxs(
    user,
    vault,
    sharesToWithdraw,
    await c.rpc.getSlot({ commitment: 'confirmed' }).send()
  );

  // send in the tx the instruction to withdraw + the instruction to unstake the shares from the vault farm if the vault has any farm; the unstake instruction has to be before the withdraw instruction as the shares need to be unstaked before they can be withdrawn
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
