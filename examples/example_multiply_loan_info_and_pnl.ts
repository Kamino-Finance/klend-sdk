import { getConnectionPool } from './utils/connection';
import { KaminoObligation, ObligationStats } from '@kamino-finance/klend-sdk';
import { JLP_MARKET } from './utils/constants';
import { getLoan, getMarket } from './utils/helpers';
import axios from 'axios';
import { address, Address } from '@solana/kit';

const EXAMPLE_MULTIPLY_OBLIGATION = address('2nRBe7wVbVK9pcDdtYCzVB7pFFsMHEWNruThoagYwfHD');

export interface ObligationPnlResponse {
  usd: string;
  sol: string;
  invested: {
    usd: string;
    sol: string;
  };
}

export async function getObligationPnl(
  marketAddress: Address,
  obligationAddress: Address,
  pnlMode?: 'current_obligation' | 'obligation_all_time'
) {
  const url = `https://api.kamino.finance/v2/kamino-market/${marketAddress.toString()}/obligations/${obligationAddress.toString()}/pnl/`;
  console.log(url);
  const params = {
    pnlMode,
  };

  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: url,
    headers: { 'User-Agent': 'node-fetch' },
    params: params,
  };

  const response = await axios.request<ObligationPnlResponse>(config);
  return response.data;
}

(async () => {
  const c = getConnectionPool();
  console.log('fetching loan:', EXAMPLE_MULTIPLY_OBLIGATION.toString(), 'in market:', JLP_MARKET.toString());

  const args = {
    rpc: c.rpc,
    obligationPubkey: EXAMPLE_MULTIPLY_OBLIGATION,
    marketPubkey: JLP_MARKET,
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
  console.log(`LTV: ${loan!.loanToValue().toNumber() * 100}%`);
  console.log(`liquidation LTV threshold: ${loanStats.liquidationLtv.toFixed(2)}`);

  const leverage = loanStats.netAccountValue.div(loanStats.userTotalDeposit);
  console.log(`leverage: ${leverage.toFixed(2)}`);

  const obligationPnlData = await getObligationPnl(market.getAddress(), loan.obligationAddress, 'current_obligation');
  console.log(`Obligation PnL: ${obligationPnlData.usd} USD, ${obligationPnlData.sol} SOL`);

  // console.log(`\Loan type: ${loan.deposits.length}`);")

  console.log('\nBreakdown:');
  const currentSlot = await c.rpc.getSlot().send();
  // Get the deposit
  const deposit = loan.deposits.values().next().value!;
  const collReserve = market.getReserveByMint(deposit.mintAddress);
  if (!collReserve) {
    console.error(`reserve not found for ${deposit.mintAddress.toString()}`);
    return;
  }
  const collReserveDecimals = collReserve!.getMintFactor();
  console.log(
    `deposit: ${deposit.amount.div(collReserveDecimals).toFixed(0)} ${
      collReserve!.symbol
    } value: $${deposit.marketValueRefreshed.toFixed(2)}`
  );
  const reserveSupplyApr = collReserve.calculateSupplyAPR(currentSlot, market.state.referralFeeBps);
  const reserveSupplyApy = collReserve.totalSupplyAPY(currentSlot);
  console.log(
    `RESERVE ${collReserve.symbol} SUPPLY APY: ${(reserveSupplyApy * 100).toFixed(2)}% APR: ${(
      reserveSupplyApr * 100
    ).toFixed(2)}%`
  );

  // Print all borrows
  const borrow = loan.borrows.values().next().value!;
  const debtReserve = market.getReserveByMint(borrow.mintAddress);
  if (!debtReserve) {
    console.error(`reserve not found for ${borrow.mintAddress.toString()}`);
    return;
  }
  const debtReserveDecimals = debtReserve!.getMintFactor();
  console.log(
    `borrow: ${borrow.amount.div(debtReserveDecimals).toFixed(0)} ${
      debtReserve!.symbol
    } value: $${borrow.marketValueRefreshed.toFixed(2)}`
  );
  const reserveBorrowApr = debtReserve.calculateBorrowAPR(currentSlot, market.state.referralFeeBps);
  const reserveBorrowApy = debtReserve.totalBorrowAPY(currentSlot);
  console.log(
    `RESERVE ${debtReserve.symbol} BORROW APY: ${(reserveBorrowApy * 100).toFixed(2)}% APR: ${(
      reserveBorrowApr * 100
    ).toFixed(2)}%`
  );
})().catch(async (e) => {
  console.error(e);
});
