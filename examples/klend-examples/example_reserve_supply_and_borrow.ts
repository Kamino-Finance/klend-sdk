import { ReserveArgs } from '../utils/models';
import { loadReserveData } from '../utils/helpers';
import { getConnectionPool } from '../utils/connection';
import { MAIN_MARKET, PYUSD_MINT, PYUSD_RESERVE_MAIN_MARKET } from '../utils/constants';
import { Slot } from '@solana/kit';

/**
 * Get reserve total supply/borrow
 */
export async function getReserveTotalSupplyAndBorrow(args: ReserveArgs, slot: Slot) {
  const { market, reserve, currentSlot } = await loadReserveData(args, slot);
  const { totalBorrow, totalSupply } = reserve.getEstimatedDebtAndSupply(currentSlot, 0);
  return { totalBorrow, totalSupply };
}

(async () => {
  const c = getConnectionPool();
  const slot = await c.rpc.getSlot().send();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} token ${PYUSD_MINT.toString()}`);
  const { totalSupply, totalBorrow } = await getReserveTotalSupplyAndBorrow(
    {
      rpc: c.rpc,
      marketPubkey: MAIN_MARKET,
      reserveAddress: PYUSD_RESERVE_MAIN_MARKET,
    },
    slot
  );
  console.log(`total borrowed:`, totalBorrow.toNumber());
  console.log('total supplied', totalSupply.toNumber());
})().catch(async (e) => {
  console.error(e);
});
