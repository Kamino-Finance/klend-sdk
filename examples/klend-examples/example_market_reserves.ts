import { getConnectionPool } from '../utils/connection';
import { MAIN_MARKET } from '../utils/constants';
import { getMarket } from '../utils/helpers';
import { calculateAPYFromAPR } from '@kamino-finance/klend-sdk';

(async () => {
  const c = getConnectionPool();
  const market = await getMarket({ rpc: c.rpc, marketPubkey: MAIN_MARKET });
  const reserves = market.getReserves();
  console.log(
    `found market ${MAIN_MARKET.toString()} reserves:\n\n${reserves.map((x) => x.address.toString()).join('\n')}`
  );

  console.log('Reserve supply and borrow APYs:\n');

  const currentSlot = await c.rpc.getSlot().send();
  for (const reserve of reserves) {
    if (reserve.state.config.status === 1 || reserve.state.config.status === 2) {
      continue;
    }
    console.log(`RESERVE ${reserve.symbol}`);
    console.log(`  Status: ${reserve.stats.status} | UI Deprecated: ${reserve.stats.isUIDeprecated ?? 'unknown'}`);
    const reserveSupplyApr = reserve.calculateSupplyAPR(currentSlot, market.state.referralFeeBps);
    const reserveSupplyApy = reserve.totalSupplyAPY(currentSlot);
    // Reserve-rewards distribution: extra supply-side yield from the reserve's on-chain rewards budget
    // (raises the cToken exchange rate, like interest). This is the rate earned right now — zero once the
    // budget runs dry; see calculateTheoreticalReserveRewardsSupplyAPR for the configured rate.
    const reserveRewardsApr = reserve.calculateEffectiveReserveRewardsSupplyAPR(currentSlot, 0);
    const reserveRewardsApy = calculateAPYFromAPR(reserveRewardsApr);
    const reserveBorrowApr = reserve.calculateBorrowAPR(currentSlot, market.state.referralFeeBps);
    const reserveBorrowApy = reserve.totalBorrowAPY(currentSlot);
    console.log(`SUPPLY APY: ${(reserveSupplyApy * 100).toFixed(2)}% APR: ${(reserveSupplyApr * 100).toFixed(2)}%`);
    console.log(
      `RESERVE REWARDS DISTRIBUTION APY: ${(reserveRewardsApy * 100).toFixed(2)}% APR: ${(
        reserveRewardsApr * 100
      ).toFixed(2)}%`
    );
    console.log(`BORROW APY: ${(reserveBorrowApy * 100).toFixed(2)}% APR: ${(reserveBorrowApr * 100).toFixed(2)}%`);
    console.log('--------------------');
  }
})().catch(async (e) => {
  console.error(e);
});
