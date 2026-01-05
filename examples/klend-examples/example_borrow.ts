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

  // The user needs to have collateral backing its loan (deposited beforehand), otherwise the borrow tx will fail.
  const borrowAction = await KaminoAction.buildBorrowTxns(
    market,
    new BN(1_000_000), // 1 USDC
    usdcReserve.getLiquidityMint(),
    wallet,
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

  const txHash = await sendAndConfirmTx(c, wallet, KaminoAction.actionToIxs(borrowAction), [], [], 'borrow');
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
