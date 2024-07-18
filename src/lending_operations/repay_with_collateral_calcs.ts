import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation } from '../classes';
import { PublicKey } from '@solana/web3.js';

export function estimateDebtRepaymentWithColl(props: {
  collAmount: Decimal; // in decimals
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  flashBorrowReserveFlashLoanFeePercentage: Decimal;
  kaminoMarket: KaminoMarket;
  debtTokenMint: PublicKey;
  obligation: KaminoObligation;
  currentSlot: number;
}): Decimal {
  const {
    collAmount,
    priceDebtToColl,
    slippagePct,
    flashBorrowReserveFlashLoanFeePercentage,
    kaminoMarket,
    debtTokenMint,
    obligation,
    currentSlot,
  } = props;
  const slippage = slippagePct.div('100');
  const flashLoanFee = flashBorrowReserveFlashLoanFeePercentage.div('100');
  const debtReserve = kaminoMarket.getReserveByMint(debtTokenMint);
  if (debtReserve === undefined) {
    throw new Error('Debt reserve not found');
  }

  const debtAfterSwap = collAmount.div(new Decimal(1.0).add(slippage)).div(priceDebtToColl);
  const debtAfterFlashLoanRepay = debtAfterSwap.div(new Decimal(1.0).add(flashLoanFee));

  const irSlippageBpsForDebt = obligation
    .estimateObligationInterestRate(
      kaminoMarket,
      debtReserve,
      obligation?.state.borrows.find((borrow) => borrow.borrowReserve?.equals(debtReserve.address))!,
      currentSlot
    )
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  // Estimate slightly more, by adding 1% to IR in order to avoid the case where UI users can repay the max we allow them
  const debtIrAdjusted = debtAfterFlashLoanRepay
    .div(irSlippageBpsForDebt.mul(new Decimal('1.01')))
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  return debtIrAdjusted;
}

export function estimateCollNeededForDebtRepayment(props: {
  debtAmount: Decimal; // in decimals
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  flashBorrowReserveFlashLoanFeePercentage: Decimal;
}): Decimal {
  const {
    debtAmount, // in decimals
    priceDebtToColl,
    slippagePct,
    flashBorrowReserveFlashLoanFeePercentage,
  } = props;
  const slippage = slippagePct.div('100');
  const flashLoanFee = flashBorrowReserveFlashLoanFeePercentage.div('100');

  const debtFlashLoanRepay = debtAmount.mul(new Decimal(1.0).add(flashLoanFee));
  const collToSwap = debtFlashLoanRepay.mul(new Decimal(1.0).add(slippage)).mul(priceDebtToColl);

  return collToSwap;
}
