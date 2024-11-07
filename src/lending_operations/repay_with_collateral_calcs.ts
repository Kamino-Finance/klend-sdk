import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve, numberToLamportsDecimal } from '../classes';
import { PublicKey } from '@solana/web3.js';
import { lamportsToDecimal } from '../classes/utils';

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
  const repayAmountIrAdjusted = amount
    .mul(irSlippageBpsForDebt.mul(new Decimal('1.001')))
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  let repayAmount: Decimal;
  // Ensure when repaying close to the full amount, we repay the full amount as otherwise we might end up having a small amount left
  if (
    repayAmountIrAdjusted.greaterThanOrEqualTo(
      lamportsToDecimal(
        obligation.borrows.get(debtReserve.address)?.amount || new Decimal(0),
        debtReserve.stats.decimals
      )
    )
  ) {
    repayAmount = repayAmountIrAdjusted;
  } else {
    repayAmount = amount;
  }

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
): {
  canWithdrawRemainingColl: boolean;
  withdrawableCollLamports: Decimal;
} {
  const collReserve = kaminoMarket.getReserveByAddress(collReserveAddr)!;
  const collOraclePx = collReserve.getOracleMarketPrice();
  const { maxLtv: collMaxLtv } = obligation.getLtvForReserve(kaminoMarket, collReserve);

  const collPosition = obligation.getDepositByReserve(collReserve.address)!;
  const initialCollValue = collPosition.amount.floor().div(collReserve.getMintFactor()).mul(collOraclePx);

  let totalRemainingDebtValue = new Decimal(0);
  const borrows = obligation.getBorrows();
  for (const debtPosition of borrows) {
    const debtReserve = kaminoMarket.getReserveByAddress(debtPosition.reserveAddress)!;
    const debtOraclePx = debtReserve.getOracleMarketPrice();
    const debtBorrowFactor = debtReserve.getBorrowFactor();
    let remainingDebtAmountLamports = debtPosition.amount;
    if (debtPosition.reserveAddress.equals(debtReserveAddr)) {
      remainingDebtAmountLamports = remainingDebtAmountLamports.sub(repayAmountLamports);
    }
    const remainingDebtBfWeightedValue = remainingDebtAmountLamports
      .ceil()
      .div(debtReserve.getMintFactor())
      .mul(debtBorrowFactor)
      .mul(debtOraclePx);
    totalRemainingDebtValue = totalRemainingDebtValue.add(remainingDebtBfWeightedValue);
  }

  let canWithdrawRemainingColl = false;
  if (totalRemainingDebtValue.lte(new Decimal(0)) && borrows.length === 1) {
    canWithdrawRemainingColl = true;
  }

  const deposits = obligation.getDeposits();
  const otherCollDeposits = deposits.filter((deposit) => !deposit.reserveAddress.equals(collReserve.address));

  let totalOtherCollateralValue = new Decimal(0);
  for (const d of otherCollDeposits) {
    const otherCollReserve = kaminoMarket.getReserveByAddress(d.reserveAddress)!;
    const otherCollOraclePx = otherCollReserve.getOracleMarketPrice();
    const otherCollMaxLtv = obligation.getLtvForReserve(kaminoMarket, otherCollReserve).maxLtv;
    const otherCollValue = d.amount
      .floor()
      .div(otherCollReserve.getMintFactor())
      .mul(otherCollOraclePx)
      .mul(otherCollMaxLtv);
    totalOtherCollateralValue = totalOtherCollateralValue.add(otherCollValue);
  }

  const numerator = initialCollValue.mul(collMaxLtv).add(totalOtherCollateralValue).sub(totalRemainingDebtValue);

  // If all collateral cannot cover the remaining debt
  if (numerator.lte('0')) {
    return { canWithdrawRemainingColl: false, withdrawableCollLamports: new Decimal(0) };
  }

  const denominator = collOraclePx.mul(collMaxLtv);
  const maxCollWithdrawAmount = numerator.div(denominator);
  const maxCollateralWithdrawalAmountLamports = maxCollWithdrawAmount.mul(collReserve.getMintFactor()).floor();

  let withdrawableCollLamports: Decimal;
  if (canWithdrawRemainingColl) {
    withdrawableCollLamports = Decimal.min(maxCollateralWithdrawalAmountLamports, collPosition.amount).floor();
  } else {
    withdrawableCollLamports = Decimal.max(new Decimal(0), maxCollateralWithdrawalAmountLamports);
  }
  return { canWithdrawRemainingColl, withdrawableCollLamports };
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
