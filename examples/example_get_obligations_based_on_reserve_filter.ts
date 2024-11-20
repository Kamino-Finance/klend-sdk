import { UserLoansArgs } from './utils/models';
import { getMarket } from './utils/helpers';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from './utils/connection';
import { ObligationTypeTag } from '@kamino-finance/klend-sdk';
import { MAIN_MARKET } from './utils/constants';
import Decimal from 'decimal.js';

(async () => {
  const connection = getConnection();
  const reserveAddress = new PublicKey('BHUi32TrEsfN2U821G4FprKrR4hTeK4LCWtA3BFetuqA');
  console.log(`fetching all loans for reserve ${reserveAddress.toString()}`);
  const market = await getMarket({ connection, marketPubkey: MAIN_MARKET });
  const reserve = market.getReserveByAddress(reserveAddress);
  const mintFactor = reserve?.getMintFactor()!;
  const loans = await market.getAllObligationsByDepositedReserve(reserveAddress);
  let totalDepositAmount = new Decimal(0);
  let totalNumberOfLoans = 0;
  for (const loan of loans) {
    let loanDepositAmount = loan.getDepositByReserve(reserveAddress)!.amount;
    totalDepositAmount = totalDepositAmount.plus(loanDepositAmount);
    totalNumberOfLoans++;
    console.log(
      'loan:',
      loan.obligationAddress.toString(),
      'deposit amount:',
      loanDepositAmount.div(mintFactor).toString()
    );
  }
  console.log('total deposit amount:', totalDepositAmount.div(mintFactor).toString());
  console.log('total number of loans:', totalNumberOfLoans);
})().catch(async (e) => {
  console.error(e);
});
