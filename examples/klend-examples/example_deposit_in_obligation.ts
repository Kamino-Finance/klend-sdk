import { KaminoAction, PROGRAM_ID, VanillaObligation } from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import BN from 'bn.js';
import { MAIN_MARKET, USDC_MINT } from '../utils/constants';
import { loadReserveData } from '../utils/helpers';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const { market, reserve: usdcReserve } = await loadReserveData({
    rpc: c.rpc,
    marketPubkey: MAIN_MARKET,
    mintPubkey: USDC_MINT,
  });

  const depositAction = await KaminoAction.buildDepositTxns(
    market,
    new BN(1_000_000),
    usdcReserve.getLiquidityMint(),
    wallet,
    new VanillaObligation(PROGRAM_ID),
    false,
    undefined,
    300_000,
    true
  );

  // eg This user has deposited jupSOL and borrowed PYUSD.
  // He is trying to deposit USDC into the reserve.

  // We refresh all the reserves in which the user has deposited collateral (jupSOL) and from which has borrowed liquidity (PYUSD) and the reserve we are looking to deposit in (USDC).

  // We refresh the obligation state to ensure the user's deposited and borrowed values are up to date.

  // We refresh the farm for the collateral before and after the deposit, to make sure the user is getting the correct amount of rewards and his new stake is reflected properly.

  console.log('depositAction.computeBudgetIxsLabels', depositAction.computeBudgetIxsLabels);
  // depositAction.computeBudgetIxsLabels [ 'AddComputeBudget[300000]' ]

  console.log('depositAction.setupIxsLabels', depositAction.setupIxsLabels);
  // depositAction.setupIxsLabels [
  // 'RefreshReserve[DGQZWCY17gGtBUgdaFs1VreJWsodkjFxndPsskwFKGpp]',
  // 'RefreshReserve[2gc9Dm1eB6UgVYFBUN9bWks6Kes9PbWSaPaa9DqyvEiN]',
  // 'RefreshReserve[D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59]',
  // 'RefreshObligation[2CojYC9YCsYjszfRYi2AKVThg7qvfGS74Y5mLgxsNRo1w]',
  // 'RefreshFarmForObligation[Collateral, res=D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59, obl=2CojYC9YCsYjszfRYi2AKVThg7qvfGS74Y5mLgsNRo1w]']

  console.log('depositAction.lendingIxsLabels', depositAction.lendingIxsLabels);
  // depositAction.lendingIxsLabels [ 'depositReserveLiquidityAndObligationCollateral' ]

  console.log('depositAction.cleanupIxs', depositAction.cleanupIxsLabels);
  // depositAction.cleanupIxs [
  //   'RefreshFarmForObligation[Collateral, res=D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59, obl=2CojYC9YCsYjszfRYi2AKVThg7qvfGS74Y5mLgsNRo1w]'
  // ]

  const txHash = await sendAndConfirmTx(
    c,
    wallet,
    [
      ...depositAction.computeBudgetIxs,
      ...depositAction.setupIxs,
      ...depositAction.lendingIxs,
      ...depositAction.cleanupIxs,
    ],
    [],
    [],
    'deposit'
  );
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
