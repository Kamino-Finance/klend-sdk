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
  const kaminoVault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);
  const vaultState = await kaminoVault.getState();
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);

  // update min invest amount (numerical value)
  const minInvestAmount = new Decimal(100_000);
  const updateMinInvestAmountIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.MinInvestAmount(),
    minInvestAmount.toString(),
    vaultReservesMap
  );

  await sendAndConfirmTx(
    c,
    user,
    [
      updateMinInvestAmountIxs.updateVaultConfigIx,
      ...updateMinInvestAmountIxs.updateLUTIxs,
      ...updateMinInvestAmountIxs.extraIxs,
    ],
    [],
    [vaultState.vaultLookupTable],
    'Update Min Invest Amount'
  );

  // update the vault farm (pubkey value)
  const farmKeypair = await generateKeyPairSigner(); // note this is just a pubkey for the example, in a real world scenario this needs to be a real farm
  const updateFarmIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.Farm(),
    farmKeypair.address,
    vaultReservesMap
  );

  await sendAndConfirmTx(
    c,
    user,
    [updateFarmIxs.updateVaultConfigIx, ...updateFarmIxs.updateLUTIxs, ...updateFarmIxs.extraIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Vault Farm'
  );

  // update vault name (string)
  const vaultName = 'new vault name';

  const updateNameIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.Name(),
    vaultName,
    vaultReservesMap
  );

  await sendAndConfirmTx(
    c,
    user,
    [updateNameIxs.updateVaultConfigIx, ...updateNameIxs.updateLUTIxs, ...updateNameIxs.extraIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Vault Name'
  );
})().catch(async (e) => {
  console.error(e);
});
