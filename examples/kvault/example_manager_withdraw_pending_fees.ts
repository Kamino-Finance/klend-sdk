import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);

  const withdrawPendingFeesIxs = await kaminoManager.withdrawPendingFeesIxs(
    vault,
    await c.rpc.getSlot({ commitment: 'confirmed' }).send()
  );

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();
  await sendAndConfirmTx(c, user, withdrawPendingFeesIxs, [], [vaultState.vaultLookupTable], 'WithdrawPendingFees');
})().catch(async (e) => {
  console.error(e);
});
