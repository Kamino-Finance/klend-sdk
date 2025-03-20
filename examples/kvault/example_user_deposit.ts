import { getConnection } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { EXAMPLE_USDC_VAULT } from '../utils/constants';
import Decimal from 'decimal.js/decimal';
import { buildAndSendTxn, getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '../../src/lib';

(async () => {
  const connection = getConnection();
  const user = getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(connection, slotDuration);
  const vault = new KaminoVault(EXAMPLE_USDC_VAULT);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState(connection);

  // deposit 100 USDC into the vault
  const usdcToDeposit = new Decimal(100.0);
  const depositIx = await kaminoManager.depositToVaultIxs(user.publicKey, vault, usdcToDeposit);

  // send in the tx the instruction to deposit + the instruction to stake the shares into the vault farm if the vault has any farm
  await buildAndSendTxn(
    connection,
    user,
    [...depositIx.depositIxs, ...depositIx.stakeInFarmIfNeededIxs],
    [],
    [vaultState.vaultLookupTable],
    'DepositToVault'
  );
})().catch(async (e) => {
  console.error(e);
});
