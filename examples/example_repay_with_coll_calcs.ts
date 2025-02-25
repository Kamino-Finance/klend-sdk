import { getComputeBudgetAndPriorityFeeIxns, getRepayWithCollSwapInputs } from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { getKeypair } from './utils/keypair';
import { MAIN_MARKET, PYUSD_MINT, USDC_MINT } from './utils/constants';
import { getMarket } from './utils/helpers';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { getJupiterQuoter } from './utils/jup_utils';

// For this example we are only using JLP/USDC multiply
// This can be also used for leverage by using the correct type when creating the obligation
(async () => {
  const connection = getConnection();

  const market = await getMarket({ connection, marketPubkey: MAIN_MARKET });

  const collTokenMint = USDC_MINT;
  const debtTokenMint = PYUSD_MINT;
  const debtTokenReserve = market.getReserveByMint(debtTokenMint);
  const collTokenReserve = market.getReserveByMint(collTokenMint);
  const slippagePct = 0.01;

  const obligation = await market.getObligationByAddress(new PublicKey('5LvkLen8kPwJvaUBaHbfmNNxFCdxYxVsPPjY6VQQQoMK'));

  const currentSlot = await market.getConnection().getSlot();

  const repayAmount = obligation?.borrows.get(debtTokenReserve!.address!)?.amount || new Decimal(0);

  const computeIxs = getComputeBudgetAndPriorityFeeIxns(1_400_000, new Decimal(500000));

  const estimatedStats = await getRepayWithCollSwapInputs({
    repayAmount,
    budgetAndPriorityFeeIxs: computeIxs,
    referrer: PublicKey.default,
    isClosingPosition: false,
    kaminoMarket: market,
    debtTokenMint: debtTokenMint,
    obligation: obligation!,
    currentSlot,
    collTokenMint: collTokenMint,
    quoter: getJupiterQuoter(slippagePct * 100, collTokenReserve!, debtTokenReserve!),
  });
  console.log('estimatedStats', estimatedStats);
})().catch(async (e) => {
  console.error(e);
});
