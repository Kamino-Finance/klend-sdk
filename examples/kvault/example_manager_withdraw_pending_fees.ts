import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import { buildAndSendTxn, getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '../../src/lib';

(async () => {
  const connection = getConnection();
  const user = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  const withdrawPendingFeesIxs = await kaminoManager.withdrawPendingFeesIxs(
    vault,
    await connection.getSlot('confirmed')
  );

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(connection);
  await buildAndSendTxn(
    connection,
    user,
    withdrawPendingFeesIxs,
    [],
    [vaultState.vaultLookupTable],
    'WithdrawPendingFees'
  );
})().catch(async (e) => {
  console.error(e);
});
