import {
  KaminoAction,
  PROGRAM_ID,
  VanillaObligation,
  buildVersionedTransaction,
  sendAndConfirmVersionedTransaction,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { MAIN_MARKET, USDC_MINT } from './utils/constants';
import BN from 'bn.js';
import { loadReserveData } from './utils/helpers';

(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const { market, reserve: usdcReserve } = await loadReserveData({
    connection,
    marketPubkey: MAIN_MARKET,
    mintPubkey: USDC_MINT,
  });

  const depositAction = await KaminoAction.buildDepositReserveLiquidityTxns(
    market,
    // Deposit 1 USDC * 10^6 decimals
    new BN(1_000_000),
    usdcReserve.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(PROGRAM_ID),
    300_000,
    true
  );

  console.log('depositAction.setupIxsLabels', depositAction.setupIxsLabels);
  // depositAction.setupIxsLabels [ 'AddComputeBudget[300000]' ]
  console.log('depositAction.lendingIxsLabels', depositAction.lendingIxsLabels);
  // depositAction.lendingIxsLabels [ 'depositReserveLiquidity' ]
  console.log('depositAction.cleanupIxs', depositAction.cleanupIxsLabels);
  // depositAction.cleanupIxsLabels []

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
