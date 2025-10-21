import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { sendAndConfirmTx } from '../utils/tx';
import BN from 'bn.js';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const kaminoVault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT);

  const newUnallocatedWeight = new BN(1999);
  const unallocatedCapLamports = new BN(1000);

  const ixs = await kaminoManager.updateVaultUnallocatedWeightAndCapIxs(
    kaminoVault,
    user,
    newUnallocatedWeight,
    unallocatedCapLamports
  );

  const tx = await sendAndConfirmTx(c, user, ixs, []);

  console.log('tx', tx);
})().catch(async (e) => {
  console.error(e);
});
