import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import {
  getMedianSlotDurationInMsFromLastEpochs,
  KaminoManager,
  KaminoVault,
  VaultConfigField,
} from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

// Note: the admin change is a 2 step process:
// 1. The current admin changes the pendingAdmin to the new admin pubkey
// 2. The new admin accepts the admin role
(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  const newAdmin = await getKeypair();

  // 1. Change pending admin
  const changeVaultAdminIx = await kaminoManager.updateVaultConfigIxs(
    vault,
    new VaultConfigField.PendingVaultAdmin(),
    newAdmin.address
  );

  await sendAndConfirmTx(
    c,
    user,
    [changeVaultAdminIx.updateVaultConfigIx, ...changeVaultAdminIx.updateLUTIxs],
    [],
    [],
    'Change Vault Pending Admin'
  );

  // 2. Accept admin role + replace the LUT of the vault as the LUT is owned by the admin
  const acceptAdminIxs = await kaminoManager.acceptVaultOwnershipIxs(vault);

  await sendAndConfirmTx(
    c,
    newAdmin,
    [acceptAdminIxs.acceptVaultOwnershipIx, acceptAdminIxs.initNewLUTIx],
    [],
    [],
    'Accept Vault Ownership'
  );

  // needs 1 slot to pass from the LUT creation so we can populate it
  await sendAndConfirmTx(c, newAdmin, acceptAdminIxs.updateLUTIxs, [], [], 'Populate New LUT');
})().catch(async (e) => {
  console.error(e);
});
