import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve, numberToLamportsDecimal } from '../classes';
import { Address, isSome, Option, Slot } from '@solana/kit';
import { lamportsToDecimal } from '../classes/utils';
import { assertPositiveFiniteDecimal, getSlippageFactor } from './swap_calcs';
import { LedgerInstant, normalizeLedgerInstantArgument, requireMatchingLedgerInstant } from '../utils/ledger';

export enum MaxWithdrawLtvCheck {
  MAX_LTV,
  LIQUIDATION_THRESHOLD,
}

export function calcRepayAmountWithSlippage(
  kaminoMarket: KaminoMarket,
  debtReserve: KaminoReserve,
  currentSlotOrLedgerInstant: Slot | LedgerInstant,
  obligation: KaminoObligation,
  amount: Decimal,
  referrer: Option<Address>,
  currentLedgerInstant?: LedgerInstant
): {
  repayAmount: Decimal;
  /** The repay principal (debt lamports). This is the `liquidity_amount` of the on-chain repay instruction. */
  repayAmountLamports: Decimal;
  /**
   * Fixed-term early-repay penalty (debt lamports) charged on-chain *in addition* to the repay
   * (`lending_operations.rs:766`). Zero for open-term reserves / matured / untracked borrows. It is NOT part of the
   * repay-instruction amount — it only inflates the debt that must be made available (flash-borrowed or swapped for).
   */
  earlyRepayPenaltyLamports: Decimal;
  /** Debt that must be made available to the repay step = principal + penalty. */
  repayFundingLamports: Decimal;
  flashRepayAmountLamports: Decimal;
} {
  const { currentSlot, currentLedgerInstant: normalizedLedgerInstant } = normalizeLedgerInstantArgument(
    currentSlotOrLedgerInstant,
    currentLedgerInstant,
    'calcRepayAmountWithSlippage'
  );
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

  // Fixed-term debt charges an early-repay penalty on top of the repay amount on-chain. It is additive funding only:
  // the flash-borrow / coll→debt swap must produce principal + penalty so the repay debit succeeds, while the repay
  // instruction amount stays the principal. Single funding-invariant helper (open-term / matured / variable → 0).
  const { penaltyLamports: earlyRepayPenaltyLamports, fundingLamports: repayFundingLamports } = debtReserve
    .getKind()
    .isFixedRate()
    ? obligation.calculateEarlyRepayFunding(
        debtReserve,
        repayAmountLamports,
        requireMatchingLedgerInstant(currentSlot, normalizedLedgerInstant, 'calcRepayAmountWithSlippage')
      )
    : { penaltyLamports: new Decimal(0), fundingLamports: repayAmountLamports };

  const { flashRepayAmountLamports } = calcFlashRepayAmount({
    reserve: debtReserve,
    referralFeeBps: kaminoMarket.state.referralFeeBps,
    hasReferral: isSome(referrer),
    flashBorrowAmountLamports: repayFundingLamports,
  });
  return {
    repayAmount,
    repayAmountLamports,
    earlyRepayPenaltyLamports,
    repayFundingLamports,
    flashRepayAmountLamports,
  };
}

/**
 * Single source of truth for the SC flash-loan-fee debit, in the lamport domain.
 *
 * Mirrors the on-chain flash repay (`handler_flash_repay_reserve_liquidity` / `lending_operations::flash_repay`):
 * the borrower must hold `flashBorrow + protocolFee + referrerFee` in the destination ATA when the flash-repay
 * instruction runs — the repay instruction's `liquidity_amount` is the bare borrow principal, and the SC adds the fee
 * on top. The fee is `reserve.calculateFlashLoanFees` (exclusive: `max(flashBorrow × rate, 1)` when the rate is > 0,
 * split into protocol/referrer). Use this everywhere instead of hand-rolling `mul(1 + flashLoanFee)`, which both
 * misses the 1-lamport minimum and silently drops the referrer split.
 *
 * @param flashBorrowAmountLamports the flash-borrow principal (integer lamports — ceil at the call site first).
 * @returns the protocol/referrer fee split and `flashRepayDebitLamports = flashBorrow + protocolFee + referrerFee`.
 */
export const calcFlashLoanFees = (props: {
  reserve: KaminoReserve;
  referralFeeBps: number;
  hasReferral: boolean;
  flashBorrowAmountLamports: Decimal;
}): {
  protocolFeeLamports: Decimal;
  referrerFeeLamports: Decimal;
  flashLoanFeeLamports: Decimal;
  flashRepayDebitLamports: Decimal;
} => {
  const { reserve, referralFeeBps, hasReferral, flashBorrowAmountLamports } = props;
  const { referrerFees, protocolFees } = reserve.calculateFlashLoanFees(
    flashBorrowAmountLamports,
    referralFeeBps,
    hasReferral
  );
  const flashLoanFeeLamports = protocolFees.add(referrerFees);
  return {
    protocolFeeLamports: protocolFees,
    referrerFeeLamports: referrerFees,
    flashLoanFeeLamports,
    flashRepayDebitLamports: flashBorrowAmountLamports.add(flashLoanFeeLamports),
  };
};

export const calcFlashRepayAmount = (props: {
  reserve: KaminoReserve;
  referralFeeBps: number;
  hasReferral: boolean;
  flashBorrowAmountLamports: Decimal;
}): {
  flashRepayAmountLamports: Decimal;
} => {
  return { flashRepayAmountLamports: calcFlashLoanFees(props).flashRepayDebitLamports };
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
  debtReserveAddress: Address;
  obligation: KaminoObligation;
  currentSlot: Slot;
}): Decimal {
  const {
    collAmount,
    priceDebtToColl,
    slippagePct,
    flashLoanFeePct,
    kaminoMarket,
    debtReserveAddress,
    obligation,
    currentSlot,
  } = props;
  const slippageMultiplier = new Decimal(1.0).add(slippagePct.div('100'));
  const flashLoanFeeMultiplier = new Decimal(1.0).add(flashLoanFeePct.div('100'));

  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);
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

/**
 * Calculates the coll-flash sizing for repay-with-collateral:
 *   1. Flash borrow `flashBorrowInCollLamports` of collateral.
 *   2. Swap that coll → debt; produces at least `repayAmountLamports` of debt after slippage.
 *   3. Repay the obligation debt with the swapped output.
 *   4. Withdraw `collWithdrawForFlashRepayLamports` (= flashBorrow + `calcFlashLoanFees` debit) of coll.
 *   5. Flash repay coll with the withdrawn amount.
 *
 * @returns the lamport-denominated sizing values for the coll-flash repay-with-coll path.
 * @throws if `swapPriceCollToDebt` is not finite and strictly positive.
 */
export function calcRepayWithCollCollFlashSwap(props: {
  repayAmountLamports: Decimal;
  swapPriceCollToDebt: Decimal;
  slippagePct: Decimal;
  collReserve: KaminoReserve;
  debtMintFactor: Decimal;
}): {
  flashBorrowInCollLamports: Decimal;
  collSwapInLamports: Decimal;
  debtMinOutLamports: Decimal;
  collWithdrawForFlashRepayLamports: Decimal;
} {
  const { repayAmountLamports, swapPriceCollToDebt, slippagePct, collReserve, debtMintFactor } = props;
  assertPositiveFiniteDecimal('calcRepayWithCollCollFlashSwap: swapPriceCollToDebt', swapPriceCollToDebt);
  // Size the coll swap-in by DIVIDING by the slippage factor `(1 - slippagePct/100)`, matching every other sizing
  // path in this refactor (debt-flash repay, swap-coll, swap-debt). At the buffer's worst-case fill
  // `price × (1 - s)` the swap output is `collSwapIn × price × (1 - s) = repay`, so the repay is exactly covered.
  // The previous `× (1 + s)` form undershot — its worst-case output was `repay × (1 - s²) < repay`.
  const slippageFactor = getSlippageFactor(slippagePct);
  // Convert debt repay amount to coll, padded for slippage so the swap output covers the repay.
  const debtToColl = repayAmountLamports.div(debtMintFactor).div(swapPriceCollToDebt).mul(collReserve.getMintFactor());
  const collSwapInLamports = debtToColl.div(slippageFactor).ceil();
  const flashBorrowInCollLamports = collSwapInLamports;
  // The withdraw must cover the exact SC flash-repay debit (fee via `calcFlashLoanFees`: 1-lamport minimum honoured;
  // the flash ixs in this flow carry no referrer and the fee total is referral-split-independent).
  const collWithdrawForFlashRepayLamports = calcFlashLoanFees({
    reserve: collReserve,
    referralFeeBps: 0,
    hasReferral: false,
    flashBorrowAmountLamports: flashBorrowInCollLamports,
  }).flashRepayDebitLamports.ceil();
  return {
    flashBorrowInCollLamports,
    collSwapInLamports,
    debtMinOutLamports: repayAmountLamports,
    collWithdrawForFlashRepayLamports,
  };
}

export function validateCollFlashWithdrawCap(props: {
  collWithdrawLamports: Decimal;
  maxCollateralWithdrawLamports: Decimal;
}): void {
  const { collWithdrawLamports, maxCollateralWithdrawLamports } = props;
  if (collWithdrawLamports.greaterThan(maxCollateralWithdrawLamports)) {
    throw new Error(
      `Coll-flash withdrawal ${collWithdrawLamports} exceeds max withdrawable collateral ${maxCollateralWithdrawLamports}`
    );
  }
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

export const getMaxWithdrawLtvCheck = (
  obligation: KaminoObligation,
  repayAmountLamports: Decimal,
  debtReserve: KaminoReserve,
  collWithdrawAmount: Decimal,
  collReserve: KaminoReserve
) => {
  const [finalLtv, finalMaxLtv] = calculatePostOperationLtv(
    obligation,
    repayAmountLamports,
    debtReserve,
    collWithdrawAmount,
    collReserve
  );

  if (finalLtv.lte(finalMaxLtv)) {
    return MaxWithdrawLtvCheck.MAX_LTV;
  }

  return obligation.refreshedStats.userTotalBorrowBorrowFactorAdjusted.gte(obligation.refreshedStats.borrowLimit)
    ? MaxWithdrawLtvCheck.LIQUIDATION_THRESHOLD
    : MaxWithdrawLtvCheck.MAX_LTV;
};

function calculatePostOperationLtv(
  obligation: KaminoObligation,
  repayAmountLamports: Decimal,
  debtReserve: KaminoReserve,
  collWithdrawAmount: Decimal,
  collReserve: KaminoReserve
): [Decimal, Decimal] {
  const repayValue = repayAmountLamports
    .div(debtReserve.getMintFactor())
    .mul(debtReserve.getOracleMarketPrice())
    .mul(debtReserve.getBorrowFactor());
  const collWithdrawValue = collWithdrawAmount.div(collReserve.getMintFactor()).mul(collReserve.getOracleMarketPrice());

  const newBorrowBfValue = Decimal.max(
    new Decimal(0),
    obligation.refreshedStats.userTotalBorrowBorrowFactorAdjusted.sub(repayValue)
  );
  const newDepositValue = Decimal.max(
    new Decimal(0),
    obligation.refreshedStats.userTotalDeposit.sub(collWithdrawValue)
  );

  const newMaxBorrowableValue = Decimal.max(
    new Decimal(0),
    obligation.refreshedStats.borrowLimit.sub(collWithdrawValue.mul(collReserve.stats.loanToValue))
  );

  const newMaxLtv = newMaxBorrowableValue.div(newDepositValue);

  return [newBorrowBfValue.div(newDepositValue), newMaxLtv];
}

export function getMaxCollateralFromRepayAmount(
  repayAmount: Decimal,
  debtReserve: KaminoReserve,
  collReserve: KaminoReserve
) {
  // sanity check: we have extra collateral to swap, but we want to ensure we don't quote for way more than needed and get a bad px
  return repayAmount
    .mul(debtReserve.getOracleMarketPrice())
    .div(collReserve.getOracleMarketPrice())
    .mul('1.1')
    .mul(collReserve.getMintFactor())
    .ceil();
}
