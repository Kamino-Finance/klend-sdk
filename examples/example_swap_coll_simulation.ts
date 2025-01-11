import { getSwapCollIxns } from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { MAIN_MARKET, PYUSD_MINT, USDC_MINT } from './utils/constants';
import { getMarket } from './utils/helpers';
import { PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { getJupiterQuoter, getJupiterSwapper } from './utils/jup_utils';
import { getKeypair } from './utils/keypair';

(async () => {
  const wallet = getKeypair();
  const connection = getConnection();

  const market = await getMarket({ connection, marketPubkey: MAIN_MARKET });

  const sourceCollSwapAmount = new Decimal(2.0);
  const sourceCollTokenMint = USDC_MINT;
  const targetCollTokenMint = PYUSD_MINT;
  const slippagePct = 0.01;

  const sourceCollTokenReserve = market.getReserveByMint(sourceCollTokenMint)!;
  const targetCollTokenReserve = market.getReserveByMint(targetCollTokenMint)!;

  const obligation = (await market.getObligationByAddress(
    new PublicKey('HjYDundFuuUjc5KF3X5bu4pFVMhqRAnJubNBxo9KnnCr')
  ))!;

  const currentSlot = await market.getConnection().getSlot();

  const swapCollIxnsOutputs = await getSwapCollIxns({
    market,
    obligation,
    sourceCollSwapAmount,
    sourceCollTokenMint,
    isClosingSourceColl: false,
    targetCollTokenMint,
    newElevationGroup: 0,
    referrer: PublicKey.default,
    currentSlot,
    quoter: getJupiterQuoter(slippagePct * 100, sourceCollTokenReserve, targetCollTokenReserve),
    swapper: getJupiterSwapper(connection, wallet.publicKey),
  });

  console.log('simulationDetails', swapCollIxnsOutputs.simulationDetails);
})().catch(async (e) => {
  console.error(e);
});
