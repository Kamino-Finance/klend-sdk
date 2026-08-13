import { ReserveArgs } from '../utils/models';
import { MAIN_MARKET, PYUSD_MINT, PYUSD_RESERVE_MAIN_MARKET } from '../utils/constants';
import { getConnectionPool } from '../utils/connection';
import { loadReserveData } from '../utils/helpers';
import { Slot } from '@solana/kit';

/**
 * Get reserve supply/borrow caps
 */
export async function getReserveCaps(args: ReserveArgs, slot: Slot) {
  const { reserve } = await loadReserveData(args, slot);
  const currentTimestamp = Math.floor(Date.now() / 1000);

  return {
    supplyCapacity: reserve.getDepositWithdrawalCapCapacity(),
    borrowCapacity: reserve.getDebtWithdrawalCapCapacity(),
    currentSupplyCapacity: reserve.getDepositWithdrawalCapCurrent(currentTimestamp),
    currentBorrowCapacity: reserve.getDebtWithdrawalCapCurrent(currentTimestamp),
  };
}
(async () => {
  const c = getConnectionPool();
  const slot = await c.rpc.getSlot().send();
  console.log(`fetching data for market ${MAIN_MARKET.toString()} token ${PYUSD_MINT.toString()}`);
  const { currentSupplyCapacity, currentBorrowCapacity, supplyCapacity, borrowCapacity } = await getReserveCaps(
    {
      rpc: c.rpc,
      marketPubkey: MAIN_MARKET,
      reserveAddress: PYUSD_RESERVE_MAIN_MARKET,
    },
    slot
  );
  console.log('current supply capacity:', currentSupplyCapacity.toNumber());
  console.log('current borrow capacity:', currentBorrowCapacity.toNumber());
  console.log('supply capacity:', supplyCapacity.toNumber());
  console.log('borrow capacity:', borrowCapacity.toNumber());
})().catch(async (e) => {
  console.error(e);
});
