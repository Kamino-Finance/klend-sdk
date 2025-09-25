import { getSwapCollIxs, getScopeRefreshIxForObligationAndReserves } from '@kamino-finance/klend-sdk';
import { getConnectionPool } from './utils/connection';
import { MAIN_MARKET, PYUSD_MINT, USDC_MINT } from './utils/constants';
import { getMarket } from './utils/helpers';
import Decimal from 'decimal.js';
import { getJupiterQuoter, getJupiterSwapper } from './utils/jup_utils';
import { getKeypair } from './utils/keypair';
import { address, none } from '@solana/kit';
import { Scope } from '@kamino-finance/scope-sdk';

(async () => {
  const wallet = await getKeypair();
  const c = getConnectionPool();

  const market = await getMarket({ rpc: c.rpc, marketPubkey: MAIN_MARKET });
  const scope = new Scope('mainnet-beta', c.rpc);

  const sourceCollSwapAmount = new Decimal(2.0);
  const sourceCollTokenMint = USDC_MINT;
  const targetCollTokenMint = PYUSD_MINT;
  const slippagePct = 0.01;

  const sourceCollTokenReserve = market.getReserveByMint(sourceCollTokenMint)!;
  const targetCollTokenReserve = market.getReserveByMint(targetCollTokenMint)!;

  const obligation = (await market.getObligationByAddress(address('HjYDundFuuUjc5KF3X5bu4pFVMhqRAnJubNBxo9KnnCr')))!;

  const currentSlot = await c.rpc.getSlot().send();

  const scopeConfiguration = { scope, scopeConfigurations: await scope.getAllConfigurations() };
  const scopeRefreshIx = await getScopeRefreshIxForObligationAndReserves(
    market,
    sourceCollTokenReserve!,
    targetCollTokenReserve!,
    obligation!,
    scopeConfiguration
  );

  const swapCollIxsOutputs = (
    await getSwapCollIxs({
      owner: wallet,
      market,
      obligation,
      sourceCollSwapAmount,
      sourceCollTokenMint,
      isClosingSourceColl: false,
      targetCollTokenMint,
      newElevationGroup: 0,
      referrer: none(),
      currentSlot,
      quoter: getJupiterQuoter(slippagePct * 100, sourceCollTokenReserve, targetCollTokenReserve),
      swapper: getJupiterSwapper(c.rpc, wallet.address),
      useV2Ixs: true,
      scopeRefreshIx,
    })
  )[0];

  console.log('simulationDetails', swapCollIxsOutputs.simulationDetails);
})().catch(async (e) => {
  console.error(e);
});
