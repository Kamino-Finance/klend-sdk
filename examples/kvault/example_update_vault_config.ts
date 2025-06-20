import Decimal from 'decimal.js/decimal';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  VaultConfigField,
} from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { sendAndConfirmTx } from '../utils/tx';
import { generateKeyPairSigner } from '@solana/kit';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const kaminoVault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // update min invest amount (numerical value)
  const minInvestAmount = new Decimal(100_000);
  const updateMinInvestAmountIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.MinInvestAmount(),
    minInvestAmount.toString()
  );

  // read the vault state so we can use the LUT in the tx
  const vaultState = await kaminoVault.getState(c.rpc);

  await sendAndConfirmTx(
    c,
    user,
    [updateMinInvestAmountIxs.updateVaultConfigIx, ...updateMinInvestAmountIxs.updateLUTIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Min Invest Amount'
  );

  // update the vault farm (pubkey value)
  const farmKeypair = await generateKeyPairSigner(); // note this is just a pubkey for the example, in a real world scenario this needs to be a real farm
  const updateFarmIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.Farm(),
    farmKeypair.address
  );

  await sendAndConfirmTx(
    c,
    user,
    [updateFarmIxs.updateVaultConfigIx, ...updateFarmIxs.updateLUTIxs],
    [],
    [vaultState.vaultLookupTable],
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
    [vaultState.vaultLookupTable],
    'Update Vault Name'
  );
})().catch(async (e) => {
  console.error(e);
});
