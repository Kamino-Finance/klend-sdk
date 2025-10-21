import { getConnectionPool } from '../utils/connection';
import { ObligationTypeTag } from '@kamino-finance/klend-sdk';
import { EXAMPLE_OBLIGATION, MAIN_MARKET } from '../utils/constants';
import { getLoan } from '../utils/helpers';

(async () => {
  const c = getConnectionPool();
  console.log('fetching loan:', EXAMPLE_OBLIGATION.toString(), 'in market:', MAIN_MARKET.toString());
  const loan = await getLoan({
    rpc: c.rpc,
    obligationPubkey: EXAMPLE_OBLIGATION,
    marketPubkey: MAIN_MARKET,
  });
  console.log(`found ${ObligationTypeTag[loan!.obligationTag]} loan with ${loan!.loanToValue().toNumber() * 100}% LTV`);
})().catch(async (e) => {
  console.error(e);
});
