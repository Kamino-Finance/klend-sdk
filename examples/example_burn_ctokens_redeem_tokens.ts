import {
  KaminoAction,
  PROGRAM_ID,
  VanillaObligation,
  buildVersionedTransaction,
  getAssociatedTokenAddress,
  sendAndConfirmVersionedTransaction,
} from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { MAIN_MARKET, USDC_MINT } from './utils/constants';
import BN from 'bn.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { loadReserveData } from './utils/helpers';

(async () => {
  const connection = getConnection();
  const wallet = getKeypair();

  const { market, reserve: usdcReserve } = await loadReserveData({
    connection,
    marketPubkey: MAIN_MARKET,
    mintPubkey: USDC_MINT,
  });
  const cUsdcMint = usdcReserve.getCTokenMint();

  const cUsdcAta = await getAssociatedTokenAddress(cUsdcMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);

  const cUsdcBalance = (await connection.getTokenAccountBalance(cUsdcAta)).value.amount;

  // Redeem the whole cUSDC balance
  const redeemAction = await KaminoAction.buildRedeemReserveCollateralTxns(
    market,
    new BN(cUsdcBalance),
    usdcReserve.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(PROGRAM_ID),
    300_000,
    true
  );

  console.log('redeemAction.setupIxsLabels', redeemAction.setupIxsLabels);
  // redeemAction.setupIxsLabels [ 'AddComputeBudget[300000]' ]
  console.log('redeemAction.lendingIxsLabels', redeemAction.lendingIxsLabels);
  // redeemAction.lendingIxsLabels [ 'redeemReserveCollateral' ]
  console.log('redeemAction.cleanupIxs', redeemAction.cleanupIxsLabels);
  // redeemAction.cleanupIxsLabels []

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, [
    ...redeemAction.setupIxs,
    ...redeemAction.lendingIxs,
    ...redeemAction.cleanupIxs,
  ]);

  tx.sign([wallet]);

  const txHash = await sendAndConfirmVersionedTransaction(connection, tx, 'processed', { skipPreflight: true });
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
