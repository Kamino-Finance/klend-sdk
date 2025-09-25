import { getComputeBudgetAndPriorityFeeIxs, getRepayWithCollSwapInputs } from '@kamino-finance/klend-sdk';
import { getConnectionPool } from './utils/connection';
import { MAIN_MARKET, PYUSD_MINT, USDC_MINT } from './utils/constants';
import { getMarket } from './utils/helpers';
import { address, none } from '@solana/kit';
import Decimal from 'decimal.js';
import { getJupiterQuoter } from './utils/jup_utils';
import { noopSigner } from '@kamino-finance/klend-sdk/dist/utils/signer';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const c = getConnectionPool();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: MAIN_MARKET });

  const collTokenMint = USDC_MINT;
  const debtTokenMint = PYUSD_MINT;
  const debtTokenReserve = market.getReserveByMint(debtTokenMint);
  const collTokenReserve = market.getReserveByMint(collTokenMint);
  const slippagePct = 0.01;

  const obligation = await market.getObligationByAddress(address('5LvkLen8kPwJvaUBaHbfmNNxFCdxYxVsPPjY6VQQQoMK'));

  const currentSlot = await c.rpc.getSlot().send();

  const repayAmount = obligation?.borrows.get(debtTokenReserve!.address!)?.amount || new Decimal(0);

  const computeIxs = getComputeBudgetAndPriorityFeeIxs(1_400_000, new Decimal(500000));

  const estimatedStats = await getRepayWithCollSwapInputs({
    owner: noopSigner(obligation!.state.owner),
    repayAmount,
    budgetAndPriorityFeeIxs: computeIxs,
    referrer: none(),
    isClosingPosition: false,
    kaminoMarket: market,
    debtTokenMint: debtTokenMint,
    obligation: obligation!,
    currentSlot,
    collTokenMint: collTokenMint,
    quoter: getJupiterQuoter(slippagePct * 100, collTokenReserve!, debtTokenReserve!),
    useV2Ixs: true,
    scopeRefreshIx: [],
  });
  console.log('estimatedStats', estimatedStats);
})().catch(async (e) => {
  console.error(e);
});
