import { ReserveArgs } from './utils/models';
import { loadReserveData } from './utils/helpers';
import { getConnectionPool } from './utils/connection';
import { MAIN_MARKET, PYUSD_MINT } from './utils/constants';

/**
 * Get reserve total supply/borrow
 */
export async function getReserveTotalSupplyAndBorrow(args: ReserveArgs) {
  const { reserve, currentSlot } = await loadReserveData(args);
  const { totalBorrow, totalSupply } = reserve.getEstimatedDebtAndSupply(currentSlot, 0);
  return { totalBorrow, totalSupply };
}

(async () => {
  const c = getConnectionPool();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} token ${PYUSD_MINT.toString()}`);
  const { totalSupply, totalBorrow } = await getReserveTotalSupplyAndBorrow({
    rpc: c.rpc,
    marketPubkey: MAIN_MARKET,
    mintPubkey: PYUSD_MINT,
  });
  console.log(`total borrowed:`, totalBorrow.toNumber());
  console.log('total supplied', totalSupply.toNumber());
})().catch(async (e) => {
  console.error(e);
});
