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
  const vault = new KaminoVault(c.rpc, EXAMPLE_USDC_VAULT, slotDuration);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();

  // pre-load vault reserves once and pass to all methods (avoids redundant RPC calls)
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const farmState = await kaminoManager.loadVaultFarmState(vaultState);

  // deposit 100 USDC into the vault
  const usdcToDeposit = new Decimal(100.0);
  const depositIx = await kaminoManager.depositToVaultIxs(
    user,
    vault,
    usdcToDeposit,
    vaultReservesMap,
    farmState,
    null
  );

  // send the deposit ixs, then the vault-farm stake ixs if the vault farm was provided
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
