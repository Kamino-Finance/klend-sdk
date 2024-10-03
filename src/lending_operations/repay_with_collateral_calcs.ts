import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve, numberToLamportsDecimal } from '../classes';
import { PublicKey } from '@solana/web3.js';

export function calcRepayAmountWithSlippage(
  kaminoMarket: KaminoMarket,
  debtReserve: KaminoReserve,
  currentSlot: number,
  obligation: KaminoObligation,
  amount: Decimal,
  referrer: PublicKey
): {
  repayAmount: Decimal;
  repayAmountLamports: Decimal;
  flashRepayAmountLamports: Decimal;
} {
  const irSlippageBpsForDebt = obligation
    .estimateObligationInterestRate(
      kaminoMarket,
      debtReserve,
      obligation.state.borrows.find((borrow) => borrow.borrowReserve.equals(debtReserve.address))!,
      currentSlot
    )
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);
  // add 0.1% to irSlippageBpsForDebt because we don't want to estimate slightly less than SC and end up not reapying enough
  const repayAmount = amount
    .mul(irSlippageBpsForDebt.mul(new Decimal('1.001')))
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);
  const repayAmountLamports = numberToLamportsDecimal(repayAmount, debtReserve.stats.decimals);

  const { flashRepayAmountLamports } = calcFlashRepayAmount({
    reserve: debtReserve,
    referralFeeBps: kaminoMarket.state.referralFeeBps,
    hasReferral: !referrer.equals(PublicKey.default),
    flashBorrowAmountLamports: repayAmountLamports,
  });
  return { repayAmount, repayAmountLamports, flashRepayAmountLamports };
}

export const calcFlashRepayAmount = (props: {
  reserve: KaminoReserve;
  referralFeeBps: number;
  hasReferral: boolean;
  flashBorrowAmountLamports: Decimal;
}): {
  flashRepayAmountLamports: Decimal;
} => {
  const { reserve, referralFeeBps, hasReferral, flashBorrowAmountLamports } = props;
  const { referrerFees, protocolFees } = reserve.calculateFlashLoanFees(
    flashBorrowAmountLamports,
    referralFeeBps,
    hasReferral
  );
  const flashRepayAmountLamports = flashBorrowAmountLamports.add(referrerFees).add(protocolFees);

  return {
    flashRepayAmountLamports,
  };
};

export function calcMaxWithdrawCollateral(
  kaminoMarket: KaminoMarket,
  collReserveAddr: PublicKey,
  debtReserveAddr: PublicKey,
  obligation: KaminoObligation,
  repayAmountLamports: Decimal
) {
  const collReserve = kaminoMarket.getReserveByAddress(collReserveAddr)!;
  const debtReserve = kaminoMarket.getReserveByAddress(debtReserveAddr)!;

  const debtOraclePx = debtReserve.getOracleMarketPrice();
  const collOraclePx = collReserve.getOracleMarketPrice();
  const { maxLtv: collMaxLtv } = obligation.getLtvForReserve(kaminoMarket, collReserve);
  const debtBorrowFactor = debtReserve.getBorrowFactor();

  const debtPosition = obligation.getBorrowByReserve(debtReserve.address)!;
  const collPosition = obligation.getDepositByReserve(collReserve.address)!;
  const initialCollValue = collPosition.amount.floor().div(collReserve.getMintFactor()).mul(collOraclePx);
  const remainingDebtAmountLamports = debtPosition.amount.sub(repayAmountLamports);
  const remainingDebtBfWeightedValue = remainingDebtAmountLamports
    .ceil()
    .div(debtReserve.getMintFactor())
    .mul(debtBorrowFactor)
    .mul(debtOraclePx);

  let isClosingPosition = false;
  if (remainingDebtAmountLamports.lte(new Decimal(0)) && obligation.getBorrows().length === 1) {
    isClosingPosition = true;
  }
  const numerator = initialCollValue.mul(collMaxLtv).sub(remainingDebtBfWeightedValue);
  const denominator = collOraclePx.mul(collMaxLtv);
  const maxCollWithdrawAmount = numerator.div(denominator);
  const maxCollateralWithdrawalAmountLamports = maxCollWithdrawAmount.mul(collReserve.getMintFactor()).floor();

  let withdrawableCollLamports: Decimal;
  if (isClosingPosition) {
    // sanity check: we have extra collateral to swap, but we want to ensure we don't quote for way more than needed and get a bad px
    const maxSwapCollLamportsWithBuffer = maxCollateralWithdrawalAmountLamports.mul('1.1');
    withdrawableCollLamports = Decimal.min(maxSwapCollLamportsWithBuffer, collPosition.amount).floor();
  } else {
    withdrawableCollLamports = Decimal.max(new Decimal(0), maxCollateralWithdrawalAmountLamports);
  }
  return { isClosingPosition, withdrawableCollLamports };
}

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
