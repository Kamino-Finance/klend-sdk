import { KaminoObligation, ObligationTypeTag } from '@kamino-finance/klend-sdk';
import { getConnection } from './utils/connection';
import { EXAMPLE_OBLIGATION, MAIN_MARKET } from './utils/constants';
import { getLoan } from './utils/helpers';

/**
 * Get loan values (supply/borrow/net)
 * @param loan
 */
function getLoanValue(loan: KaminoObligation) {
  return {
    depositValue: loan.getDepositedValue(),
    borrowValue: loan.getBorrowedMarketValueBFAdjusted(),
    netValue: loan.getNetAccountValue(),
  };
}

(async () => {
  const connection = getConnection();
  const loan = await getLoan({
    connection,
    obligationPubkey: EXAMPLE_OBLIGATION,
    marketPubkey: MAIN_MARKET,
  });
  const { netValue, borrowValue, depositValue } = getLoanValue(loan!);
  console.log(
    `found ${ObligationTypeTag[loan!.obligationTag]} loan with $${depositValue.toNumber()} deposited, $${borrowValue.toNumber()} borrowed, $${netValue} net value`
  );
})().catch(async (e) => {
  console.error(e);
});
