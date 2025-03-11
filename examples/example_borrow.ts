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

  // The user needs to have collateral backing its loan (deposited beforehand), otherwise the borrow tx will fail.
  const borrowAction = await KaminoAction.buildBorrowTxns(
    market,
    new BN(1_000_000), // 1 USDC
    usdcReserve.getLiquidityMint(),
    wallet.publicKey,
    new VanillaObligation(PROGRAM_ID),
    true,
    undefined
  );

  // If we want to inspect the prepended instructions to the borrow instruction
  console.log('borrowAction.setupIxsLabels', borrowAction.setupIxsLabels);
  // 'CreateLiquidityUserAta[11111111111111111111111111111111]',
  // 'RefreshReserve[FBSyPnxtHKLBZ4UeeUyAnbtFuAmTHLtso9YtsqRDRWpM]',
  // 'RefreshReserve[D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59]',
  // 'RefreshObligation[HQUj2hES46d5rCVaACf6QwKvBUxKraRpv75SLBpckkUb]'

  const tx = await buildVersionedTransaction(connection, wallet.publicKey, KaminoAction.actionToIxs(borrowAction));

  tx.sign([wallet]);

  const txHash = await sendAndConfirmVersionedTransaction(connection, tx, 'processed', { skipPreflight: true });
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
