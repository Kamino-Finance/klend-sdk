import { KaminoAction, PROGRAM_ID, VanillaObligation } from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { MAIN_MARKET, USDC_RESERVE_MAIN_MARKET } from '../utils/constants';
import BN from 'bn.js';
import { loadReserveData } from '../utils/helpers';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const { market, reserve: usdcReserve } = await loadReserveData({
    rpc: c.rpc,
    marketPubkey: MAIN_MARKET,
    reserveAddress: USDC_RESERVE_MAIN_MARKET,
  });

  const depositAction = await KaminoAction.buildDepositReserveLiquidityTxns({
    kaminoMarket: market,
    // Deposit 1 USDC * 10^6 decimals
    amount: new BN(1_000_000),
    reserveAddress: usdcReserve.address,
    owner: wallet,
    obligation: new VanillaObligation(PROGRAM_ID),
    scopeRefreshConfig: undefined,
    extraComputeBudget: 300_000,
    includeAtaIxs: true,
  });

  console.log('depositAction.computeBudgetIxsLabels', depositAction.computeBudgetIxsLabels);
  // depositAction.computeBudgetIxsLabels [ 'AddComputeBudget[300000]' ]
  console.log('depositAction.setupIxsLabels', depositAction.setupIxsLabels);
  // depositAction.setupIxsLabels []
  console.log('depositAction.lendingIxsLabels', depositAction.lendingIxsLabels);
  // depositAction.lendingIxsLabels [ 'depositReserveLiquidity' ]
  console.log('depositAction.cleanupIxs', depositAction.cleanupIxsLabels);
  // depositAction.cleanupIxsLabels []

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
