import { ReserveArgs } from './utils/models';
import { MAIN_MARKET, PYUSD_MINT } from './utils/constants';
import { getConnection } from './utils/connection';
import { loadReserveData } from './utils/helpers';

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
  const connection = getConnection();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} token ${PYUSD_MINT.toString()}`);
  const { currentSupplyCapacity, currentBorrowCapacity, dailySupplyCapacity, dailyBorrowCapacity } =
    await getReserveCaps({ connection, marketPubkey: MAIN_MARKET, mintPubkey: PYUSD_MINT });
  console.log(`current supply capacity:`, currentSupplyCapacity.toNumber());
  console.log('current borrow capacity:', currentBorrowCapacity.toNumber());
  console.log('daily supply capacity:', dailySupplyCapacity.toNumber());
  console.log('daily borrow capacity:', dailyBorrowCapacity.toNumber());
})().catch(async (e) => {
  console.error(e);
});
