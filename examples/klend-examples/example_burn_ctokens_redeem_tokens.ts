import { KaminoAction, PROGRAM_ID, VanillaObligation, getAssociatedTokenAddress } from '@kamino-finance/klend-sdk';
import { getConnectionPool } from '../utils/connection';
import { getKeypair } from '../utils/keypair';
import { MAIN_MARKET, USDC_MINT, USDC_RESERVE_MAIN_MARKET } from '../utils/constants';
import BN from 'bn.js';
import { loadReserveData } from '../utils/helpers';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { sendAndConfirmTx } from '../utils/tx';

(async () => {
  const c = getConnectionPool();
  const wallet = await getKeypair();

  const { market, reserve: usdcReserve } = await loadReserveData({
    rpc: c.rpc,
    marketPubkey: MAIN_MARKET,
    reserveAddress: USDC_RESERVE_MAIN_MARKET,
  });
  const cUsdcMint = usdcReserve.getCTokenMint();

  const cUsdcAta = await getAssociatedTokenAddress(cUsdcMint, wallet.address, TOKEN_PROGRAM_ADDRESS);

  const cUsdcBalance = (await c.rpc.getTokenAccountBalance(cUsdcAta).send()).value.amount;

  // Redeem the whole cUSDC balance
  const redeemAction = await KaminoAction.buildRedeemReserveCollateralTxns({
    kaminoMarket: market,
    amount: new BN(cUsdcBalance),
    reserveAddress: usdcReserve.address,
    owner: wallet,
    obligation: new VanillaObligation(PROGRAM_ID),
    scopeRefreshConfig: undefined,
    extraComputeBudget: 300_000,
    includeAtaIxs: true,
  });

  console.log('redeemAction.computeBudgetIxs', redeemAction.computeBudgetIxsLabels);
  // redeemAction.computeBudgetIxs [ 'AddComputeBudget[300000]' ]
  console.log('redeemAction.setupIxsLabels', redeemAction.setupIxsLabels);
  // redeemAction.setupIxsLabels []
  console.log('redeemAction.lendingIxsLabels', redeemAction.lendingIxsLabels);
  // redeemAction.lendingIxsLabels [ 'redeemReserveCollateral' ]
  console.log('redeemAction.cleanupIxs', redeemAction.cleanupIxsLabels);
  // redeemAction.cleanupIxsLabels []

  const txHash = await sendAndConfirmTx(
    c,
    wallet,
    [
      ...redeemAction.computeBudgetIxs,
      ...redeemAction.setupIxs,
      ...redeemAction.lendingIxs,
      ...redeemAction.cleanupIxs,
    ],
    [],
    [],
    'redeem'
  );
  console.log('txHash', txHash);
})().catch(async (e) => {
  console.error(e);
});
