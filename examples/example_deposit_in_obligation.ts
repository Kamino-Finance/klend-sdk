import {
  KaminoAction,
  PROGRAM_ID,
  VanillaObligation,
  buildVersionedTransaction,
  sendAndConfirmVersionedTransaction,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import BN from 'bn.js';
import { MAIN_MARKET, USDC_MINT } from './utils/constants';
import { loadReserveData } from './utils/helpers';

(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const { market, reserve: usdcReserve } = await loadReserveData({
    connection,
    marketPubkey: MAIN_MARKET,
    mintPubkey: USDC_MINT,
  });

  const depositAction = await KaminoAction.buildDepositTxns(
    market,
    new BN(1_000_000),
    usdcReserve.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(PROGRAM_ID),
    300_000,
    true
  );

  // eg This user has deposited jupSOL and borrowed PYUSD.
  // He is trying to deposit USDC into the reserve.

  // We refresh all the reserves in which the user has deposited collateral (jupSOL) and from which has borrowed liquidity (PYUSD) and the reserve we are looking to deposit in (USDC).

  // We refresh the obligation state to ensure the user's deposited and borrowed values are up to date.

  // We refresh the farm for the collateral before and after the deposit, to make sure the user is getting the correct amount of rewards and his new stake is reflected properly.

  console.log('depositAction.setupIxsLabels', depositAction.setupIxsLabels);
  // depositAction.setupIxsLabels [
  // 'AddComputeBudget[300000]',
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

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, [
    ...depositAction.setupIxs,
    ...depositAction.lendingIxs,
    ...depositAction.cleanupIxs,
  ]);

  tx.sign([wallet]);

  const txHash = await sendAndConfirmVersionedTransaction(connection, tx, 'processed', { skipPreflight: true });
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
