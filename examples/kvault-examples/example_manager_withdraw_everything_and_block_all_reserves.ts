import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const investor = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const slot = await c.rpc.getSlot().send();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const kaminoVault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);
  const vaultState = await kaminoVault.getState();
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);

  const withdrawAllAndBlockReserveIxs = await kaminoManager.withdrawEverythingFromAllReservesAndBlockInvest(
    kaminoVault,
    slot,
    vaultReservesMap,
    investor
  );

  // send update alloc instructions in batches of 2
  for (let i = 0; i < withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs.length; i += 2) {
    const ixs = [withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs[i]];
    if (i + 1 < withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs.length) {
      ixs.push(withdrawAllAndBlockReserveIxs.updateReserveAllocationIxs[i + 1]);
    }
    await sendAndConfirmTx(c, investor, ixs, [], [], 'Update alloc');
  }

  // disinvest all from all reserves in batches of 2
  for (let i = 0; i < withdrawAllAndBlockReserveIxs.investIxs.length; i += 2) {
    const ixs = [withdrawAllAndBlockReserveIxs.investIxs[i]];
    if (i + 1 < withdrawAllAndBlockReserveIxs.investIxs.length) {
      ixs.push(withdrawAllAndBlockReserveIxs.investIxs[i + 1]);
    }
    await sendAndConfirmTx(c, investor, ixs, [], [], 'Disinvest all from all reserves');
  }
})().catch(async (e) => {
  console.error(e);
});
