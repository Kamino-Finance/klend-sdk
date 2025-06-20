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
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  const feesToGiveUp = new Decimal(0.01);
  const giveUpFeesIx = await kaminoManager.giveUpPendingFeesIx(vault, feesToGiveUp);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(c.rpc);
  await sendAndConfirmTx(c, user, [giveUpFeesIx], [], [vaultState.vaultLookupTable], 'GiveUpPendingFees');
})().catch(async (e) => {
  console.error(e);
});
