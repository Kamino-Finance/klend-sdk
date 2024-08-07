import { getReserveRewardsApy, loadReserveData } from './utils/helpers';
import { getConnection } from './utils/connection';
import { MAIN_MARKET, PYUSD_RESERVE } from './utils/constants';

(async () => {
  const connection = getConnection();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} reserve ${PYUSD_RESERVE.toString()}`);
  const rewardApys = await getReserveRewardsApy({
    connection,
    marketPubkey: MAIN_MARKET,
    reservePubkey: PYUSD_RESERVE,
  });
  for (const rewardApy of rewardApys) {
    console.log(`reward token ${rewardApy.rewardInfo.token.mint.toString()} APY`, rewardApy.rewardApy.toNumber());
  }
})().catch(async (e) => {
  console.error(e);
});
