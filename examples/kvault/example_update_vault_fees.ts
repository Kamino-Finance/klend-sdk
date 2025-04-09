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
import {
  PerformanceFeeBps,
  ManagementFeeBps,
} from '@kamino-finance/klend-sdk/dist/idl_codegen_kamino_vault/types/VaultConfigField';

(async () => {
  const connection = getConnection();
  const user = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);
  const kaminoVault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await kaminoVault.getState(connection);

  // update the performance fee of the vault
  const perfFeeBps = new Decimal(1000);
  const updatePerfFeeIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new PerformanceFeeBps(),
    perfFeeBps.toString()
  );

  await buildAndSendTxn(
    connection,
    user,
    [updatePerfFeeIxs.updateVaultConfigIx, ...updatePerfFeeIxs.updateLUTIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Vault Performance Fee'
  );

  // update the management fee of the vault
  const mgmtFeeBps = new Decimal(200);
  const updateMgmtFeeIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new ManagementFeeBps(),
    mgmtFeeBps.toString()
  );

  await buildAndSendTxn(
    connection,
    user,
    [updateMgmtFeeIxs.updateVaultConfigIx, ...updateMgmtFeeIxs.updateLUTIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Vault Management Fee'
  );
})().catch(async (e) => {
  console.error(e);
});
