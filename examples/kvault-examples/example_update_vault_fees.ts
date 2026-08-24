import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  VaultConfigField,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const kaminoVault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await kaminoVault.getState();
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);

  // update the performance fee of the vault
  const perfFeeBps = new Decimal(1000);
  const updatePerfFeeIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.PerformanceFeeBps(),
    perfFeeBps.toString(),
    vaultReservesMap
  );

  await sendAndConfirmTx(
    c,
    user,
    [updatePerfFeeIxs.updateVaultConfigIx, ...updatePerfFeeIxs.updateLUTIxs, ...updatePerfFeeIxs.extraIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Vault Performance Fee'
  );

  // update the management fee of the vault
  const mgmtFeeBps = new Decimal(200);
  const updateMgmtFeeIxs = await kaminoManager.updateVaultConfigIxs(
    kaminoVault,
    new VaultConfigField.ManagementFeeBps(),
    mgmtFeeBps.toString(),
    vaultReservesMap
  );

  await sendAndConfirmTx(
    c,
    user,
    [updateMgmtFeeIxs.updateVaultConfigIx, ...updateMgmtFeeIxs.updateLUTIxs, ...updateMgmtFeeIxs.extraIxs],
    [],
    [vaultState.vaultLookupTable],
    'Update Vault Management Fee'
  );
})().catch(async (e) => {
  console.error(e);
});
