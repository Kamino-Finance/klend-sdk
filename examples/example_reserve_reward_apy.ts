import { loadReserveData } from './utils/helpers';
import { getConnection } from './utils/connection';
import { MAIN_MARKET, PYUSD_MINT } from './utils/constants';

(async () => {
  const connection = getConnection();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} reserve for ${PYUSD_MINT.toString()}`);
  const { market, reserve } = await loadReserveData({
    connection,
    marketPubkey: MAIN_MARKET,
    mintPubkey: PYUSD_MINT,
  });
  const prices = await market.getAllScopePrices();
  const rewardApys = await reserve.getRewardYields(prices);
  for (const rewardApy of rewardApys) {
    console.log(
      `reward token ${rewardApy.rewardInfo.token.mint.toString()} APY`,
      rewardApy.apy.toNumber(),
      'APR',
      rewardApy.apr.toNumber()
    );
  }
})().catch(async (e) => {
  console.error(e);
});
