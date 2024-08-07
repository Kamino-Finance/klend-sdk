import { UserLoansArgs } from './utils/models';
import { getMarket } from './utils/helpers';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from './utils/connection';
import { ObligationTypeTag } from '@kamino-finance/klend-sdk';
import { MAIN_MARKET } from './utils/constants';

/**
 * Get all loans for a user wallet
 * @param args
 */
export async function getUserLoansForMarket(args: UserLoansArgs) {
  const market = await getMarket(args);
  return market.getAllUserObligations(args.wallet);
}

(async () => {
  const connection = getConnection();
  const wallet = new PublicKey('Hs9ioQZ2pCUyvS18anwmBxjQJsZrMPShwTMLySD6Us3V');
  console.log(`fetching all loans for wallet ${wallet.toString()}`);
  const loans = await getUserLoansForMarket({ connection, marketPubkey: MAIN_MARKET, wallet });
  for (const loan of loans) {
    console.log(
      'loan:',
      loan.obligationAddress.toString(),
      'type:',
      ObligationTypeTag[loan.obligationTag],
      'borrow value:',
      loan.getBorrowedMarketValueBFAdjusted().toNumber(),
      'deposit value:',
      loan.getDepositedValue().toNumber(),
      'net value:',
      loan.getNetAccountValue().toNumber()
    );
  }
})().catch(async (e) => {
  console.error(e);
});
