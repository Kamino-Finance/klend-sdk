import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  VaultConfigField,
} from '@kamino-finance/klend-sdk';
import { generateKeyPairSigner } from '@solana/kit';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const kaminoVault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // update the vault farm (pubkey value)
  const farmKeypair = await generateKeyPairSigner(); // note this is just a pubkey for the example, in a real world scenario this needs to be a real farm
  const updateFarmIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.Farm(),
    farmKeypair.address.toString()
  );

  await sendAndConfirmTx(
    c,
    user,
    [updateFarmIxs.updateVaultConfigIx, ...updateFarmIxs.updateLUTIxs],
    [],
    [],
    'Update Vault Farm'
  );

  // update vault name (string)
  const vaultName = 'new vault name';

  const updateNameIxs = await kaminoManager.updateVaultConfigIxs(kaminoVault, new VaultConfigField.Name(), vaultName);

  await sendAndConfirmTx(
    c,
    user,
    [updateNameIxs.updateVaultConfigIx, ...updateNameIxs.updateLUTIxs],
    [],
    [],
    'Update Vault Name'
  );
})().catch(async (e) => {
  console.error(e);
});
