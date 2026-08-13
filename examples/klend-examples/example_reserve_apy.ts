import { ReserveArgs } from '../utils/models';
import { getConnectionPool } from '../utils/connection';
import { MAIN_MARKET, PYUSD_RESERVE_MAIN_MARKET, PYUSD_MINT } from '../utils/constants';
import { getReserveFarmRewardsApy, loadReserveData } from '../utils/helpers';
import { Slot } from '@solana/kit';
import { calculateAPYFromAPR } from '@kamino-finance/klend-sdk';

/**
 * Get current reserve APY (supply/borrow APY + rewards APY)
 */
export async function getReserveApy(args: ReserveArgs, slot: Slot) {
  const { market, reserve, currentSlot } = await loadReserveData(args, slot);
  const supplyApy = reserve.totalSupplyAPY(currentSlot);
  const borrowApy = reserve.totalBorrowAPY(currentSlot);
  // Reserve-rewards distribution: an extra supply-side yield paid from the reserve's on-chain rewards
  // budget (it raises the cToken exchange rate, like interest). Distinct from farm rewards below, so it
  // is surfaced as its own line rather than folded into supplyApy. The effective helper reports what
  // depositors earn right now, which is zero once the budget runs dry; for the configured rate
  // regardless of the budget, use calculateTheoreticalReserveRewardsSupplyAPR instead.
  const reserveRewardsApy = calculateAPYFromAPR(reserve.calculateEffectiveReserveRewardsSupplyAPR(currentSlot, 0));
  const farmRewardApys = await getReserveFarmRewardsApy(args, slot);
  return { supplyApy, borrowApy, reserveRewardsApy, farmRewardApys };
}

(async () => {
  const c = getConnectionPool();
  const slot = await c.rpc.getSlot().send();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} reserve for ${PYUSD_MINT.toString()}`);
  const { borrowApy, farmRewardApys, reserveRewardsApy, supplyApy } = await getReserveApy(
    {
      rpc: c.rpc,
      marketPubkey: MAIN_MARKET,
      reserveAddress: PYUSD_RESERVE_MAIN_MARKET,
    },
    slot
  );
  console.log('borrow APY:', borrowApy);
  console.log('supply APY', supplyApy);
  console.log('reserve rewards distribution APY', reserveRewardsApy);
  for (const farmRewardApy of farmRewardApys) {
    console.log(
      `farm reward token ${farmRewardApy.rewardInfo.token.mint.toString()} APY`,
      farmRewardApy.rewardApy.toNumber()
    );
  }
})().catch(async (e) => {
  console.error(e);
});
