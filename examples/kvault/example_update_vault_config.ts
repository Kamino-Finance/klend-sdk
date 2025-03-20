import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import {
  buildAndSendTxn,
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  VaultConfigField,
} from '../../src/lib';
import { Keypair } from '@solana/web3.js/lib';

(async () => {
  const connection = getConnection();
  const user = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);
  const kaminoVault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // update min invest amount (numerical value)
  const minInvestAmount = new Decimal(100_000);
  const updateMinInvestAmountIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.MinInvestAmount(),
    minInvestAmount.toString()
  );

  // read the vault state so we can use the LUT in the tx
  const vaultState = await kaminoVault.getState(connection);

  await buildAndSendTxn(
    connection,
    user,
    [updateMinInvestAmountIxs.updateVaultConfigIx, ...updateMinInvestAmountIxs.updateLUTIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Min Invest Amount'
  );

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
    [vaultState.vaultLookupTable],
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
    [vaultState.vaultLookupTable],
    'Update Vault Name'
  );
})().catch(async (e) => {
  console.error(e);
});
