import Decimal from 'decimal.js';

export function estimateDebtRepaymentWithColl(
  collAmount: Decimal, // in decimals
  priceDebtToColl: Decimal,
  slippagePct: Decimal,
  flashBorrowReserveFlashLoanFeePercentage: Decimal
): Decimal {
  const slippage = slippagePct.div('100');
  const flashLoanFee = flashBorrowReserveFlashLoanFeePercentage.div('100');

  const debtAfterSwap = collAmount.div(new Decimal(1.0).add(slippage)).div(priceDebtToColl);
  const debtAfterFlashLoanRepay = debtAfterSwap.div(new Decimal(1.0).add(flashLoanFee));

  return debtAfterFlashLoanRepay;
}

export function estimateCollNeededForDebtRepayment(
  debtAmount: Decimal, // in decimals
  priceDebtToColl: Decimal,
  slippagePct: Decimal,
  flashBorrowReserveFlashLoanFeePercentage: Decimal
): Decimal {
  const slippage = slippagePct.div('100');
  const flashLoanFee = flashBorrowReserveFlashLoanFeePercentage.div('100');

  const debtFlashLoanRepay = debtAmount.mul(new Decimal(1.0).add(flashLoanFee));
  const collToSwap = debtFlashLoanRepay.mul(new Decimal(1.0).add(slippage)).mul(priceDebtToColl);

  return collToSwap;
}
