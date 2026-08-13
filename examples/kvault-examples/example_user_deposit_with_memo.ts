import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { address } from '@solana/kit';
import Decimal from 'decimal.js/decimal';
import { getMedianSlotDurationInMsFromLastEpochs, KaminoManager, KaminoVault } from '@kamino-finance/klend-sdk';
import { sendAndConfirmTx } from '../utils/tx';

const USDC_VAULT = address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E');

(async () => {
  const c = getConnectionPool();
  const user = await getKeypair();
  const slotDuration = await getMedianSlotDurationInMsFromLastEpochs();
  const kaminoManager = new KaminoManager(c.rpc, slotDuration);
  const vault = new KaminoVault(c.rpc, USDC_VAULT);

  // read the vault state so we can use the LUT in the tx
  const vaultState = await vault.getState();

  // pre-load vault reserves and farm state
  const vaultReservesMap = await kaminoManager.loadVaultReserves(vaultState);
  const farmState = await kaminoManager.loadVaultFarmState(vaultState);

  // deposit 1 USDC into the vault, with a memo
  const usdcToDeposit = new Decimal(1.0);
  const memo = 'test-memo';
  const depositIx = await kaminoManager.depositToVaultIxs(
    user,
    vault,
    usdcToDeposit,
    vaultReservesMap,
    farmState,
    null,
    undefined,
    memo
  );

  // send in the tx the instruction to deposit + the instruction to stake the shares into the vault farm if the vault has any farm
  await sendAndConfirmTx(
    c,
    user,
    [...depositIx.depositIxs, ...depositIx.stakeInFarmIfNeededIxs],
    [],
    [vaultState.vaultLookupTable],
    'DepositToVaultWithMemo'
  );
})().catch(async (e) => {
  console.error(e);
});
