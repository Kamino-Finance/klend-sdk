import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import {
  buildAndSendTxn,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
} from '@kamino-finance/klend-sdk';

(async () => {
  const connection = getConnection();
  const user = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  const feesToGiveUp = new Decimal(0.01);
  const giveUpFeesIx = await kaminoManager.giveUpPendingFeesIx(vault, feesToGiveUp);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(connection);
  await buildAndSendTxn(connection, user, [giveUpFeesIx], [], [vaultState.vaultLookupTable], 'GiveUpPendingFees');
})().catch(async (e) => {
  console.error(e);
});
