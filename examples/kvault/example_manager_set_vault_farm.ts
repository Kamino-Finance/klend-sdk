import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { Keypair } from '@solana/web3.js';
import {
  buildAndSendTxn,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  VaultConfigField,
} from '@kamino-finance/klend-sdk';

(async () => {
  const connection = getConnection();
  const user = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);
  const kaminoVault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // update the vault farm (pubkey value)
  const farmKeypair = new Keypair(); // note this is just a pubkey for the example, in a real world scenario this needs to be a real farm
  const updateFarmIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.Farm(),
    farmKeypair.publicKey.toString()
  );

  await buildAndSendTxn(
    connection,
    user,
    [updateFarmIxs.updateVaultConfigIx, ...updateFarmIxs.updateLUTIxs],
    [],
    [],
    'Update Vault Farm'
  );

  // update vault name (string)
  const vaultName = 'new vault name';

  const updateNameIxs = await kaminoManager.updateVaultConfigIxs(kaminoVault, new VaultConfigField.Name(), vaultName);

  await buildAndSendTxn(
    connection,
    user,
    [updateNameIxs.updateVaultConfigIx, ...updateNameIxs.updateLUTIxs],
    [],
    [],
    'Update Vault Name'
  );
})().catch(async (e) => {
  console.error(e);
});
