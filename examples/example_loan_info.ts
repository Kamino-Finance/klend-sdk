import { getConnection } from './utils/connection';
import { KaminoObligation, ObligationStats, ObligationTypeTag } from '@kamino-finance/klend-sdk';
import { EXAMPLE_OBLIGATION, MAIN_MARKET } from './utils/constants';
import { getLoan, getMarket } from './utils/helpers';

(async () => {
  const connection = getConnection();
  console.log('fetching loan:', EXAMPLE_OBLIGATION.toString(), 'in market:', MAIN_MARKET.toString());

  const args = {
    connection,
    obligationPubkey: EXAMPLE_OBLIGATION,
    marketPubkey: MAIN_MARKET,
  };

  const market = await getMarket(args);
  const loan: KaminoObligation | null = await getLoan(args);

  if (!loan) {
    console.log('loan not found');
    return;
  }

  // General net stats
  const loanStats: ObligationStats = loan.refreshedStats;
  console.log(
    `\nLoan ${loan.obligationAddress} \nhttps://app.kamino.finance/lending/obligation/${loan.obligationAddress} \n`
  );
  console.log(`userTotalDeposit: ${loanStats.userTotalDeposit.toFixed(2)}`);
  console.log(`userTotalBorrow: ${loanStats.userTotalBorrow.toFixed(2)}`);
  console.log('netValue: ', loanStats.netAccountValue.toFixed(2));
  console.log(`ltv ${loan!.loanToValue().toNumber() * 100}%`);

  console.log('\nBreakdown:');
  // Print all deposits
  loan.deposits.forEach((deposit) => {
    const reserve = market.getReserveByMint(deposit.mintAddress);
    if (!reserve) {
      console.error(`reserve not found for ${deposit.mintAddress.toString()}`);
      return;
    }
    const decimals = reserve!.getMintFactor();
    console.log(
      `deposit: ${deposit.amount.div(decimals).toFixed(0)} ${
        reserve!.symbol
      } value: $${deposit.marketValueRefreshed.toFixed(2)}`
    );
  });

  // Print all borrows
  loan.borrows.forEach((borrow) => {
    const reserve = market.getReserveByMint(borrow.mintAddress);
    if (!reserve) {
      console.error(`reserve not found for ${borrow.mintAddress.toString()}`);
      return;
    }
    const decimals = reserve!.getMintFactor();
    console.log(
      `borrow: ${borrow.amount.div(decimals).toFixed(0)} ${
        reserve!.symbol
      } value: $${borrow.marketValueRefreshed.toFixed(2)}`
    );
  });
})().catch(async (e) => {
  console.error(e);
});
