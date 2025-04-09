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

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(connection);

  // withdraw 100 shares from the vault
  const sharesToWithdraw = new Decimal(100.0);
  const withdrawIx = await kaminoManager.withdrawFromVaultIxs(
    user.publicKey,
    vault,
    sharesToWithdraw,
    await connection.getSlot('confirmed')
  );

  // send in the tx the instruction to withdraw + the instruction to unstake the shares from the vault farm if the vault has any farm; the unstake instruction has to be before the withdraw instruction as the shares need to be unstaked before they can be withdrawn
  await buildAndSendTxn(
    connection,
    user,
    [...withdrawIx.unstakeFromFarmIfNeededIxs, ...withdrawIx.withdrawIxs],
    [],
    [vaultState.vaultLookupTable],
    'WithdrawFromVault'
  );
})().catch(async (e) => {
  console.error(e);
});
