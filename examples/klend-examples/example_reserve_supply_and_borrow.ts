import { ReserveArgs } from '../utils/models';
import { getCurrentLedgerInstant, LedgerInstant } from '@kamino-finance/klend-sdk';
import { loadReserveData } from '../utils/helpers';
import { getConnectionPool } from '../utils/connection';
import { MAIN_MARKET, PYUSD_MINT, PYUSD_RESERVE_MAIN_MARKET } from '../utils/constants';

/**
 * Get reserve total supply/borrow
 */
export async function getReserveTotalSupplyAndBorrow(args: ReserveArgs, currentLedgerInstant: LedgerInstant) {
  const { market, reserve } = await loadReserveData(args, currentLedgerInstant);
  const { totalBorrow, totalSupply } = reserve.getEstimatedDebtAndSupply(currentLedgerInstant, 0);
  return { totalBorrow, totalSupply };
}

(async () => {
  const c = getConnectionPool();
  const currentLedgerInstant = await getCurrentLedgerInstant(c.rpc);
  console.log(`fetching data for market ${MAIN_MARKET.toString()} token ${PYUSD_MINT.toString()}`);
  const { totalSupply, totalBorrow } = await getReserveTotalSupplyAndBorrow(
    {
      rpc: c.rpc,
      marketPubkey: MAIN_MARKET,
      reserveAddress: PYUSD_RESERVE_MAIN_MARKET,
    },
    currentLedgerInstant
  );
  console.log(`total borrowed:`, totalBorrow.toNumber());
  console.log('total supplied', totalSupply.toNumber());
})().catch(async (e) => {
  console.error(e);
});
