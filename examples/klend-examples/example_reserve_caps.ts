import { ReserveArgs } from '../utils/models';
import { MAIN_MARKET, PYUSD_MINT, PYUSD_RESERVE_MAIN_MARKET } from '../utils/constants';
import { getConnectionPool } from '../utils/connection';
import { loadReserveData } from '../utils/helpers';

/**
 * Get reserve supply/borrow caps
 */
export async function getReserveCaps(args: ReserveArgs) {
  const { reserve, currentSlot } = await loadReserveData(args);

  return {
    dailySupplyCapacity: reserve.getDepositWithdrawalCapCapacity(),
    dailyBorrowCapacity: reserve.getDebtWithdrawalCapCapacity(),
    currentSupplyCapacity: reserve.getDepositWithdrawalCapCurrent(currentSlot),
    currentBorrowCapacity: reserve.getDebtWithdrawalCapCurrent(currentSlot),
  };
}
(async () => {
  const c = getConnectionPool();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} token ${PYUSD_MINT.toString()}`);
  const { currentSupplyCapacity, currentBorrowCapacity, dailySupplyCapacity, dailyBorrowCapacity } =
    await getReserveCaps({ rpc: c.rpc, marketPubkey: MAIN_MARKET, reserveAddress: PYUSD_RESERVE_MAIN_MARKET });
  console.log(`current supply capacity:`, currentSupplyCapacity.toNumber());
  console.log('current borrow capacity:', currentBorrowCapacity.toNumber());
  console.log('daily supply capacity:', dailySupplyCapacity.toNumber());
  console.log('daily borrow capacity:', dailyBorrowCapacity.toNumber());
})().catch(async (e) => {
  console.error(e);
});
