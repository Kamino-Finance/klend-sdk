import { ReserveArgs } from './utils/models';
import { getConnection } from './utils/connection';
import { MAIN_MARKET, PYUSD_MINT } from './utils/constants';
import { getReserveRewardsApy, loadReserveData } from './utils/helpers';

/**
 * Get current reserve APY (supply/borrow APY + rewards APY)
 */
export async function getReserveApy(args: ReserveArgs) {
  const { reserve, currentSlot } = await loadReserveData(args);
  const supplyApy = reserve.totalSupplyAPY(currentSlot);
  const borrowApy = reserve.totalBorrowAPY(currentSlot);
  const rewardApys = await getReserveRewardsApy(args);
  return { supplyApy, borrowApy, rewardApys };
}

(async () => {
  const connection = getConnection();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} reserve for ${PYUSD_MINT.toString()}`);
  const { borrowApy, rewardApys, supplyApy } = await getReserveApy({
    connection,
    marketPubkey: MAIN_MARKET,
    mintPubkey: PYUSD_MINT,
  });
  console.log('borrow APY:', borrowApy);
  console.log('supply APY', supplyApy);
  for (const rewardApy of rewardApys) {
    console.log(`reward token ${rewardApy.rewardInfo.token.mint.toString()} APY`, rewardApy.rewardApy.toNumber());
  }
})().catch(async (e) => {
  console.error(e);
});
