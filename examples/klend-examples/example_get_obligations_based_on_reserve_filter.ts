import { getMarket } from '../utils/helpers';
import { address } from '@solana/kit';
import { getConnectionPool } from '../utils/connection';
import { MAIN_MARKET } from '../utils/constants';
import Decimal from 'decimal.js';

(async () => {
  const c = getConnectionPool();
  const reserveAddress = address('BHUi32TrEsfN2U821G4FprKrR4hTeK4LCWtA3BFetuqA');
  console.log(`fetching all loans for reserve ${reserveAddress.toString()}`);
  const market = await getMarket({ rpc: c.rpc, marketPubkey: MAIN_MARKET });
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
