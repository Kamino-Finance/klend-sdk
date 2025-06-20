import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(c.rpc);

  // deposit 100 USDC into the vault
  const usdcToDeposit = new Decimal(100.0);
  const depositIx = await kaminoManager.depositToVaultIxs(user, vault, usdcToDeposit);

  // send in the tx the instruction to deposit + the instruction to stake the shares into the vault farm if the vault has any farm
  await sendAndConfirmTx(
    c,
    user,
    [...depositIx.depositIxs, ...depositIx.stakeInFarmIfNeededIxs],
    [],
    [vaultState.vaultLookupTable],
    'DepositToVault'
  );
})().catch(async (e) => {
  console.error(e);
});
