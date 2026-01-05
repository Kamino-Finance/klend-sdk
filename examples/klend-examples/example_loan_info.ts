import { getConnectionPool } from '../utils/connection';
import { KaminoObligation, ObligationStats } from '@kamino-finance/klend-sdk';
import { EXAMPLE_OBLIGATION, MAIN_MARKET } from '../utils/constants';
import { getLoan, getMarket } from '../utils/helpers';
import { address } from '@solana/kit';

(async () => {
  const c = getConnectionPool();
  console.log('fetching loan:', EXAMPLE_OBLIGATION.toString(), 'in market:', MAIN_MARKET.toString());

  const args = {
    rpc: c.rpc,
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
  const currentSlot = await c.rpc.getSlot().send();
  const loanStats: ObligationStats = loan.refreshedStats;
  console.log(
    `\nLoan ${loan.obligationAddress} \nhttps://app.kamino.finance/lending/obligation/${loan.obligationAddress} \n`
  );
  console.log(`userTotalDeposit: ${loanStats.userTotalDeposit.toFixed(2)}`);
  console.log(`userTotalCollateralDeposit: ${loanStats.userTotalCollateralDeposit.toFixed(2)}`);
  console.log(`userTotalBorrow: ${loanStats.userTotalBorrow.toFixed(2)}`);
  console.log('netValue: ', loanStats.netAccountValue.toFixed(2));
  console.log(`LTV: ${loan!.loanToValue().toNumber() * 100}%`);
  console.log(`liquidation LTV threshold: ${loanStats.liquidationLtv.toFixed(2)}`);

  console.log(
    `Max withdraw amount : ${loan
      .getMaxWithdrawAmount(market, address('2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo'), currentSlot)
      .toFixed(2)}`
  );

  console.log(`Borrow limt; ${loanStats.borrowLimit.toFixed(2)}`);
  console.log(`Loan MAX LTV: ${loanStats.borrowLimit.div(loanStats.userTotalCollateralDeposit).toFixed(2)}`);
  // console.log(`\Loan type: ${loan.deposits.length}`);")

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
    const reserveSupplyApr = reserve.calculateSupplyAPR(currentSlot, market.state.referralFeeBps);
    const reserveSupplyApy = reserve.totalSupplyAPY(currentSlot);
    console.log(
      `RESERVE ${reserve.symbol} SUPPLY APY: ${(reserveSupplyApy * 100).toFixed(2)}% APR: ${(
        reserveSupplyApr * 100
      ).toFixed(2)}%`
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
    const reserveBorrowApr = reserve.calculateBorrowAPR(currentSlot, market.state.referralFeeBps);
    const reserveBorrowApy = reserve.totalBorrowAPY(currentSlot);
    console.log(
      `RESERVE ${reserve.symbol} BORROW APY: ${(reserveBorrowApy * 100).toFixed(2)}% APR: ${(
        reserveBorrowApr * 100
      ).toFixed(2)}%`
    );
  });
})().catch(async (e) => {
  console.error(e);
});
