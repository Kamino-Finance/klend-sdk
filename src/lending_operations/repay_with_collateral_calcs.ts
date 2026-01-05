import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve, numberToLamportsDecimal } from '../classes';
import { Address, isSome, Option, Slot } from '@solana/kit';
import { lamportsToDecimal } from '../classes/utils';
import {
  MaxWithdrawLtvCheck,
  getMaxCollateralFromRepayAmount,
  getMaxWithdrawLtvCheck,
} from './repay_with_collateral_operations';

export function calcRepayAmountWithSlippage(
  kaminoMarket: KaminoMarket,
  debtReserve: KaminoReserve,
  currentSlot: Slot,
  obligation: KaminoObligation,
  amount: Decimal,
  referrer: Option<Address>
): {
  repayAmount: Decimal;
  repayAmountLamports: Decimal;
  flashRepayAmountLamports: Decimal;
} {
  const interestRateAccrued = obligation
    .estimateObligationInterestRate(
      kaminoMarket,
      debtReserve,
      obligation.state.borrows.find((borrow) => borrow.borrowReserve === debtReserve.address)!,
      currentSlot
    )
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);
  // add 0.1% to interestRateAccrued because we don't want to estimate slightly less than SC and end up not repaying enough
  const repayAmountIrAdjusted = amount
    .mul(interestRateAccrued.mul(new Decimal('1.001')))
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  let repayAmount: Decimal;
  // Ensure when repaying close to the full amount, we repay the full amount as otherwise we might end up having a small amount left
  if (
    repayAmountIrAdjusted.greaterThanOrEqualTo(
      lamportsToDecimal(
        obligation.getBorrowByReserve(debtReserve.address)?.amount || new Decimal(0),
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
    hasReferral: isSome(referrer),
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
  market: KaminoMarket,
  obligation: KaminoObligation,
  collReserveAddr: Address,
  debtReserveAddr: Address,
  repayAmountLamports: Decimal
): {
  maxWithdrawableCollLamports: Decimal;
  canWithdrawAllColl: boolean;
  repayingAllDebt: boolean;
} {
  const deposit = obligation.getDepositByReserve(collReserveAddr)!;
  const borrow = obligation.getBorrowByReserve(debtReserveAddr)!;
  const depositReserve = market.getReserveByAddress(deposit.reserveAddress)!;
  const debtReserve = market.getReserveByAddress(borrow.reserveAddress)!;
  const depositTotalLamports = deposit.amount.floor(); // TODO: can remove floor, we have lamports only for deposits

  // Calculate the market value of the remaining debt after repaying
  const remainingBorrowLamports = borrow.amount.sub(repayAmountLamports).ceil();
  const remainingBorrowAmount = remainingBorrowLamports.div(debtReserve.getMintFactor());
  let remainingBorrowsValue = remainingBorrowAmount.mul(debtReserve.getOracleMarketPrice());
  if (obligation.getBorrows().length > 1) {
    remainingBorrowsValue = obligation
      .getBorrows()
      .filter((p) => p.reserveAddress !== borrow.reserveAddress)
      .reduce((acc, b) => acc.add(b.marketValueRefreshed), new Decimal('0'));
  }

  const hypotheticalWithdrawLamports = getMaxCollateralFromRepayAmount(
    repayAmountLamports.div(debtReserve.getMintFactor()),
    debtReserve,
    depositReserve
  );

  // Calculate the max withdraw ltv we can withdraw up to
  const maxWithdrawLtvCheck = getMaxWithdrawLtvCheck(
    obligation,
    repayAmountLamports,
    debtReserve,
    hypotheticalWithdrawLamports,
    depositReserve
  );
  // Calculate the max borrowable value remaining against deposits
  let maxBorrowableValueRemainingAgainstDeposits = new Decimal('0');
  if (obligation.getDeposits().length > 1) {
    maxBorrowableValueRemainingAgainstDeposits = obligation
      .getDeposits()
      .filter((p) => p.reserveAddress !== deposit.reserveAddress)
      .reduce((acc, d) => {
        const { maxLtv, liquidationLtv } = obligation.getLtvForReserve(market, d.reserveAddress);
        const maxWithdrawLtv =
          maxWithdrawLtvCheck === MaxWithdrawLtvCheck.LIQUIDATION_THRESHOLD ? liquidationLtv : maxLtv;
        return acc.add(d.marketValueRefreshed.mul(maxWithdrawLtv));
      }, new Decimal('0'));
  }

  // if the remaining borrow value is less than the
  // this means that the user's ltv is less or equal to the max ltv
  if (maxBorrowableValueRemainingAgainstDeposits.gte(remainingBorrowsValue)) {
    return {
      maxWithdrawableCollLamports: depositTotalLamports,
      canWithdrawAllColl: true,
      repayingAllDebt: repayAmountLamports.gte(borrow.amount),
    };
  } else {
    const { maxLtv: collMaxLtv, liquidationLtv: collLiquidationLtv } = obligation.getLtvForReserve(
      market,
      depositReserve.address
    );
    const maxWithdrawLtv =
      maxWithdrawLtvCheck === MaxWithdrawLtvCheck.LIQUIDATION_THRESHOLD ? collLiquidationLtv : collMaxLtv;
    const numerator = deposit.marketValueRefreshed
      .mul(maxWithdrawLtv)
      .add(maxBorrowableValueRemainingAgainstDeposits)
      .sub(remainingBorrowsValue);

    const denominator = depositReserve.getOracleMarketPrice().mul(maxWithdrawLtv);
    const maxCollWithdrawAmount = numerator.div(denominator);
    const maxWithdrawableCollLamports = maxCollWithdrawAmount.mul(depositReserve.getMintFactor()).floor();

    return {
      maxWithdrawableCollLamports,
      canWithdrawAllColl: false,
      repayingAllDebt: repayAmountLamports.gte(borrow.amount),
    };
  }
}

export function estimateDebtRepaymentWithColl(props: {
  collAmount: Decimal; // in decimals
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  flashLoanFeePct: Decimal;
  kaminoMarket: KaminoMarket;
  debtTokenMint: Address;
  obligation: KaminoObligation;
  currentSlot: Slot;
}): Decimal {
  const {
    collAmount,
    priceDebtToColl,
    slippagePct,
    flashLoanFeePct,
    kaminoMarket,
    debtTokenMint,
    obligation,
    currentSlot,
  } = props;
  const slippageMultiplier = new Decimal(1.0).add(slippagePct.div('100'));
  const flashLoanFeeMultiplier = new Decimal(1.0).add(flashLoanFeePct.div('100'));

  const debtReserve = kaminoMarket.getExistingReserveByMint(debtTokenMint);

  const debtAfterSwap = collAmount.div(slippageMultiplier).div(priceDebtToColl);
  const debtAfterFlashLoanRepay = debtAfterSwap.div(flashLoanFeeMultiplier);

  const accruedInterestRate = obligation
    .estimateObligationInterestRate(
      kaminoMarket,
      debtReserve,
      obligation.getObligationLiquidityByReserve(debtReserve.address),
      currentSlot
    )
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  // Estimate slightly more, by adding 1% to IR in order to avoid the case where UI users can repay the max we allow them
  const debtIrAdjusted = debtAfterFlashLoanRepay
    .div(accruedInterestRate.mul(new Decimal('1.01')))
    .toDecimalPlaces(debtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);

  return debtIrAdjusted;
}

export function estimateCollNeededForDebtRepayment(props: {
  debtAmount: Decimal; // in decimals
  priceDebtToColl: Decimal;
  slippagePct: Decimal;
  flashLoanFeePct: Decimal;
}): Decimal {
  const {
    debtAmount, // in decimals
    priceDebtToColl,
    slippagePct,
    flashLoanFeePct,
  } = props;
  const slippageRatio = slippagePct.div('100');
  const flashLoanFeeRatio = flashLoanFeePct.div('100');
  const slippageMultiplier = new Decimal(1.0).add(slippageRatio);
  const flashLoanFeeMultiplier = new Decimal(1.0).add(flashLoanFeeRatio);

  const debtFlashLoanRepay = debtAmount.mul(flashLoanFeeMultiplier);
  const collToSwap = debtFlashLoanRepay.mul(slippageMultiplier).mul(priceDebtToColl);

  return collToSwap;
}
