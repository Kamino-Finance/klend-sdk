import { Address } from '@solana/kit';
import Decimal from 'decimal.js';
import { FeeCalculation, KaminoMarket, KaminoObligation, KaminoReserve, toJson } from '../classes';
import {
  AdjustLeverageCalcsResult,
  AdjustDepositDebtFlashCalcsResult,
  AdjustWithdrawCollFlashCalcsResult,
  DepositLeverageCalcsResult,
  DepositLeverageDebtFlashCalcsResult,
  WithdrawLeverageCalcsResult,
  WithdrawLeverageCollFlashCalcsResult,
} from './types';
import { fuzzyEqual } from '../utils';
import { assertPositiveFiniteDecimal } from '../lending_operations/swap_calcs';
import { LedgerInstant } from '../utils/ledger';
import { calcFlashLoanFees } from '../lending_operations/repay_with_collateral_calcs';
import { bufferWithdrawForRedeemDrift } from '../lending_operations/redeem_drift';

const closingPositionDiffTolerance = 0.0001;

export enum LeverageOption {
  deposit = 'Deposit',
  withdraw = 'Withdraw',
  adjust = 'Adjust',
  close = 'Close',
}

export interface LeverageCalcsArgs {
  depositAmount: Decimal;
  withdrawAmount: Decimal;
  deposited: Decimal;
  borrowed: Decimal;
  debtTokenMint: Address;
  selectedTokenMint: Address;
  collTokenMint: Address;
  targetLeverage: Decimal;
  activeLeverageOption: LeverageOption;
  flashLoanFeeRatio: Decimal;
  /** Origination fee rate the debt reserve charges on top of a borrow, as a ratio (0.01 = 1%). */
  borrowFeeRatio: Decimal;
  slippagePct: Decimal;
  debtBorrowFactorPct: Decimal;
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
}

export interface LeverageCalcsResult {
  earned: Decimal;
  totalDeposited: Decimal;
  totalBorrowed: Decimal;
  netValue: Decimal;
  netValueUsd: Decimal;
  ltv: Decimal;
  /**
   * The origination fee charged by the debt reserve on the new borrow, in debt tokens.
   * Already included in `totalBorrowed` (and thus in `netValue`, `netValueUsd` and `ltv`). Zero for
   * operations that only repay.
   */
  borrowOriginationFeeAmount: Decimal;
}

export async function calculateMultiplyEffects(
  getPriceByTokenMintDecimal: (mint: Address) => Promise<Decimal>,
  {
    depositAmount,
    withdrawAmount,
    deposited,
    borrowed,
    debtTokenMint,
    selectedTokenMint,
    collTokenMint,
    targetLeverage,
    activeLeverageOption,
    flashLoanFeeRatio,
    borrowFeeRatio,
    slippagePct,
    debtBorrowFactorPct,
    priceCollToDebt,
    priceDebtToColl,
  }: LeverageCalcsArgs,
  logEstimations = false
): Promise<LeverageCalcsResult> {
  // calculate estimations for deposit operation
  const {
    adjustDepositPosition: depositModeEstimatedDepositAmount,
    adjustBorrowPosition: depositModeEstimatedBorrowAmount,
    borrowOriginationFeeAmount: depositModeEstimatedOriginationFee,
  } = estimateDepositMode({
    priceCollToDebt,
    priceDebtToColl,
    amount: depositAmount,
    targetLeverage,
    selectedTokenMint,
    collTokenMint: collTokenMint,
    flashLoanFee: flashLoanFeeRatio,
    borrowFee: borrowFeeRatio,
    slippagePct,
  });

  // calculate estimations for withdraw operation
  const {
    adjustDepositPosition: withdrawModeEstimatedDepositTokenWithdrawn,
    adjustBorrowPosition: withdrawModeEstimatedBorrowTokenWithdrawn,
  } = estimateWithdrawMode({
    priceCollToDebt,
    collTokenMint,
    selectedTokenMint,
    amount: withdrawAmount,
    deposited,
    borrowed,
  });

  // calculate estimations for adjust operation
  const {
    adjustDepositPosition: adjustModeEstimatedDepositAmount,
    adjustBorrowPosition: adjustModeEstimateBorrowAmount,
    borrowOriginationFeeAmount: adjustModeEstimatedOriginationFee,
  } = estimateAdjustMode(priceCollToDebt, {
    targetLeverage,
    debtTokenMint,
    collTokenMint,
    totalDeposited: deposited,
    totalBorrowed: borrowed,
    flashLoanFee: flashLoanFeeRatio, // TODO: is this the right flash borrow?
    borrowFee: borrowFeeRatio,
  });

  if (logEstimations) {
    console.log(
      'Estimations',
      toJson({
        activeLeverageOption,
        depositModeEstimatedDepositAmount,
        depositModeEstimatedBorrowAmount,
        withdrawModeEstimatedDepositTokenWithdrawn,
        withdrawModeEstimatedBorrowTokenWithdrawn,
        adjustModeEstimatedDepositAmount,
        adjustModeEstimateBorrowAmount,
      })
    );
  }

  let [isClosingPosition, totalDeposited, totalBorrowed, borrowOriginationFeeAmount] = [
    false,
    new Decimal(0),
    new Decimal(0),
    new Decimal(0),
  ];

  switch (activeLeverageOption) {
    case LeverageOption.deposit: {
      // Deposit and Adjust never clos the position
      isClosingPosition = false;
      totalDeposited = deposited.add(depositModeEstimatedDepositAmount);
      totalBorrowed = borrowed.add(depositModeEstimatedBorrowAmount);
      borrowOriginationFeeAmount = depositModeEstimatedOriginationFee;
      break;
    }
    case LeverageOption.close:
    case LeverageOption.withdraw: {
      isClosingPosition =
        (withdrawModeEstimatedDepositTokenWithdrawn.gte(deposited) ||
          withdrawModeEstimatedBorrowTokenWithdrawn.gte(borrowed) ||
          fuzzyEqual(withdrawModeEstimatedDepositTokenWithdrawn, deposited, closingPositionDiffTolerance) ||
          fuzzyEqual(withdrawModeEstimatedBorrowTokenWithdrawn, borrowed, closingPositionDiffTolerance)) &&
        !fuzzyEqual(withdrawModeEstimatedDepositTokenWithdrawn, new Decimal(0), closingPositionDiffTolerance);

      totalDeposited = isClosingPosition ? new Decimal(0) : deposited.sub(withdrawModeEstimatedDepositTokenWithdrawn);
      totalBorrowed = isClosingPosition ? new Decimal(0) : borrowed.sub(withdrawModeEstimatedBorrowTokenWithdrawn);
      // Withdrawing and closing repay debt, and a repay is charged no origination fee.
      break;
    }
    case LeverageOption.adjust: {
      // Deposit and Adjust never clos the position
      isClosingPosition = false;
      totalDeposited = deposited.add(adjustModeEstimatedDepositAmount);
      totalBorrowed = borrowed.add(adjustModeEstimateBorrowAmount);
      // Zero when the adjust is a deleverage: `calcAdjustAmounts` charges the increase only.
      borrowOriginationFeeAmount = adjustModeEstimatedOriginationFee;
      break;
    }
  }

  const borrowTokenPrice = await getPriceByTokenMintDecimal(debtTokenMint);
  const depositTokenPrice = await getPriceByTokenMintDecimal(collTokenMint);

  const totalDepositedUsd = depositTokenPrice.mul(totalDeposited);
  const totalBorrowedUsd = borrowTokenPrice.mul(totalBorrowed);
  const netValueUsd = totalDepositedUsd.minus(totalBorrowedUsd);
  // TODO marius this is bad, do not convert to sol as we don't only do leveraged loops only
  const netValueSol = netValueUsd.div(borrowTokenPrice);
  const ltv = totalBorrowedUsd.mul(debtBorrowFactorPct.div(100)).div(totalDepositedUsd);

  return {
    earned: new Decimal(0),
    totalDeposited,
    totalBorrowed,
    netValue: netValueSol,
    netValueUsd: netValueUsd,
    ltv,
    borrowOriginationFeeAmount,
  };
}

/**
 * returns how much borrowToken will be borrowed to reach leverage given initial collateral amount
 * @param depositTokenAmount
 * @param leverage
 * @param priceAToB
 * @param flashBorrowFee
 */
export const calcBorrowAmount = ({
  depositTokenAmount,
  targetLeverage,
  priceCollToDebt,
  flashLoanFeeRatio,
}: {
  depositTokenAmount: Decimal;
  targetLeverage: Decimal;
  priceCollToDebt: Decimal;
  flashLoanFeeRatio: Decimal;
}) => {
  const initialCollAmountInCollToken = depositTokenAmount;

  const finalCollAmountInCollToken = initialCollAmountInCollToken.mul(targetLeverage);
  const finalDebtAmountInCollToken = finalCollAmountInCollToken.sub(initialCollAmountInCollToken);
  const finalDebtAmountInDebtToken = finalDebtAmountInCollToken.mul(priceCollToDebt);

  const flashFeeFactor = new Decimal(1).add(flashLoanFeeRatio);
  const debtTokenToBorrow = finalDebtAmountInDebtToken.mul(flashFeeFactor);

  return debtTokenToBorrow;
};

interface UseEstimateWithdrawAmountsProps {
  priceCollToDebt: Decimal;
  amount: Decimal.Value;
  deposited: Decimal;
  borrowed: Decimal;
  collTokenMint: Address;
  selectedTokenMint: Address;
}

export const estimateWithdrawMode = (props: UseEstimateWithdrawAmountsProps) => {
  const { amount, collTokenMint, selectedTokenMint, deposited, borrowed, priceCollToDebt } = props;

  return calcWithdrawAmounts({
    selectedTokenMint,
    collTokenMint,
    withdrawAmount: new Decimal(amount),
    priceCollToDebt,
    currentBorrowPosition: borrowed,
    currentDepositPosition: deposited,
  });
};

export interface WithdrawParams {
  currentBorrowPosition: Decimal;
  currentDepositPosition: Decimal;
  priceCollToDebt: Decimal;
  withdrawAmount: Decimal;
  selectedTokenMint: Address;
  collTokenMint: Address;
}

interface WithdrawResult {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
}

export function calcWithdrawAmounts(params: WithdrawParams): WithdrawResult {
  const {
    currentBorrowPosition,
    currentDepositPosition,
    priceCollToDebt,
    withdrawAmount,
    selectedTokenMint,
    collTokenMint,
  } = params;

  assertPositiveFiniteDecimal('calcWithdrawAmounts: priceCollToDebt', priceCollToDebt);

  // MSOL/SOL
  const currentDepositInCollateralToken = currentDepositPosition;
  const currentDebtInCollateralToken = currentBorrowPosition.div(priceCollToDebt);
  const currentNetPositionInCollateralToken = currentDepositInCollateralToken.minus(currentDebtInCollateralToken);
  const targetLeverage = currentDepositInCollateralToken.div(currentNetPositionInCollateralToken);

  const initialDepositInCollateralToken = currentDepositPosition.minus(currentBorrowPosition.div(priceCollToDebt));

  const amountToWithdrawDepositToken =
    selectedTokenMint === collTokenMint ? withdrawAmount : withdrawAmount.div(priceCollToDebt);

  const targetDeposit = initialDepositInCollateralToken.minus(amountToWithdrawDepositToken).mul(targetLeverage);

  const targetBorrow = calcBorrowAmount({
    depositTokenAmount: initialDepositInCollateralToken.minus(amountToWithdrawDepositToken),
    priceCollToDebt,
    targetLeverage,
    flashLoanFeeRatio: new Decimal(0),
  });

  const adjustDepositPosition = currentDepositPosition.minus(targetDeposit);
  const adjustBorrowPosition = currentBorrowPosition.minus(targetBorrow);

  // TODO: add flashLoan fee here in final values
  return {
    adjustDepositPosition,
    adjustBorrowPosition,
  };
}

interface UseEstimateAdjustAmountsProps {
  targetLeverage: Decimal;
  debtTokenMint: Address;
  collTokenMint: Address;
  totalDeposited: Decimal;
  totalBorrowed: Decimal;
  flashLoanFee: Decimal;
  borrowFee: Decimal;
}

/**
 * Calculate how much token will be deposited or withdrawn in case of position adjustment
 * @param leverage
 * @param totalDeposited
 * @param totalBorrowed
 */
export const estimateAdjustMode = (
  priceCollToDebt: Decimal,
  { targetLeverage, totalDeposited, totalBorrowed, flashLoanFee, borrowFee }: UseEstimateAdjustAmountsProps
) => {
  return calcAdjustAmounts({
    currentBorrowPosition: totalBorrowed,
    currentDepositPosition: totalDeposited,
    priceCollToDebt,
    targetLeverage,
    flashLoanFee,
    borrowFee,
  });
};

export interface AdjustLeverageParams {
  targetLeverage: Decimal;
  currentBorrowPosition: Decimal;
  currentDepositPosition: Decimal;
  priceCollToDebt: Decimal;
  flashLoanFee: Decimal;
  borrowFee: Decimal;
}

interface AdjustLeverageResult {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
  /** Origination fee already included in `adjustBorrowPosition`, in debt token units. Zero on a decrease. */
  borrowOriginationFeeAmount: Decimal;
}

/**
 * Calculates the amounts of tokenA to deposit/withdraw and tokenB to borrow/repay proportionally to adjust the leverage of a position.
 *
 * @param {AdjustLeverageParams} params - Parameters for the calculation
 * @param {number} params.targetLeverage - The target leverage for the position
 * @param {Decimal} params.currentPositionTokenA - The current amount of tokenA in the position
 * @param {Decimal} params.currentPositionTokenB - The current amount of borrowed tokenB in the position
 * @param {number} params.priceAtoB - The conversion rate from tokenA to tokenB (tokenA price = tokenB price * priceAtoB)
 * @returns {AdjustLeverageResult} An object containing the amounts of tokenA to deposit/withdraw and tokenB to borrow/repay
 */
export function calcAdjustAmounts({
  targetLeverage,
  currentBorrowPosition,
  currentDepositPosition,
  priceCollToDebt,
  flashLoanFee,
  borrowFee,
}: AdjustLeverageParams): AdjustLeverageResult {
  assertPositiveFiniteDecimal('calcAdjustAmounts: priceCollToDebt', priceCollToDebt);
  const initialDeposit = currentDepositPosition.minus(currentBorrowPosition.div(priceCollToDebt));
  const targetDeposit = initialDeposit.mul(targetLeverage);

  // Target debt BEFORE the origination fee: the fee applies to the borrow delta only, so it is added below once the
  // direction (increase vs decrease) is known.
  // Decreases fund the flash fee in the withdrawal leg; adding it to remaining debt can reverse a tiny repay delta.
  const targetBorrow = calcBorrowAmount({
    depositTokenAmount: initialDeposit,
    priceCollToDebt,
    targetLeverage,
    flashLoanFeeRatio: targetDeposit.lt(currentDepositPosition) ? new Decimal(0) : flashLoanFee,
  });

  const adjustDepositPosition = targetDeposit.minus(currentDepositPosition);
  const borrowDelta = targetBorrow.minus(currentBorrowPosition);

  // Origination fee is only added on top of extra borrows. If we repay, no fees.
  const borrowOriginationFeeAmount = borrowDelta.gt(0) ? borrowDelta.mul(borrowFee) : new Decimal(0);
  const adjustBorrowPosition = borrowDelta.add(borrowOriginationFeeAmount);

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    borrowOriginationFeeAmount,
  };
}

interface UseTransactionInfoStats {
  priceCollToDebt: Decimal;
  priceDebtToColl: Decimal;
  amount: Decimal;
  targetLeverage: Decimal;
  selectedTokenMint: Address;
  collTokenMint: Address;
  flashLoanFee: Decimal;
  borrowFee: Decimal;
  slippagePct: Decimal;
}

interface DepositModeResult {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
  /** Origination fee already included in `adjustBorrowPosition`, in debt token units. */
  borrowOriginationFeeAmount: Decimal;
}

// Given a deposit amount of Deposit|Borrow token
// and a target leverage, calculate final { collateral, debt } value
export const estimateDepositMode = ({
  priceCollToDebt,
  priceDebtToColl,
  amount,
  targetLeverage,
  selectedTokenMint,
  collTokenMint,
  flashLoanFee,
  borrowFee,
  slippagePct,
}: UseTransactionInfoStats): DepositModeResult => {
  const isDepositingCollToken = selectedTokenMint === collTokenMint;

  const finalCollTokenAmount = isDepositingCollToken
    ? new Decimal(amount).mul(targetLeverage)
    : new Decimal(amount).mul(priceDebtToColl).mul(targetLeverage);

  const depositCollTokenAmount = isDepositingCollToken ? amount : amount.mul(priceDebtToColl);
  const borrowAmount = calcBorrowAmount({
    depositTokenAmount: depositCollTokenAmount,
    targetLeverage,
    priceCollToDebt,
    flashLoanFeeRatio: flashLoanFee,
  });

  const slippageFactor = new Decimal(1).add(slippagePct.div(new Decimal(100)));
  const borrowAmountWithSlippage = borrowAmount.mul(slippageFactor);
  const borrowOriginationFeeAmount = borrowAmountWithSlippage.mul(borrowFee);

  return {
    adjustDepositPosition: finalCollTokenAmount,
    adjustBorrowPosition: borrowAmountWithSlippage.add(borrowOriginationFeeAmount),
    borrowOriginationFeeAmount,
  };
};

export const depositLeverageCalcs = (props: {
  depositAmount: Decimal;
  depositTokenIsCollToken: boolean;
  depositTokenIsSol: boolean;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  slippagePct: Decimal;
  flashLoanFee: Decimal;
  borrowFee: Decimal;
}): DepositLeverageCalcsResult => {
  // Initialize local variables from the props object
  const {
    depositAmount,
    depositTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
    borrowFee,
  } = props;
  const slippage = slippagePct.div('100');
  const borrowFeeFactor = new Decimal(1).add(borrowFee);

  const initDepositInSol = depositTokenIsSol ? depositAmount : new Decimal(0);

  // `priceDebtToColl` is a divisor in `x` below; guard against 0/negative/NaN/Infinity producing bad sizing.
  assertPositiveFiniteDecimal('depositLeverageCalcs: priceDebtToColl', priceDebtToColl);

  // Core logic
  // Flow: flashBorrow(coll) → deposit(finalColl) → borrow(debt) → swap(debt→coll) → flashRepay(flashBorrow + SC fee).
  // Coll ATA balance at flash-repay = depositAmount + flashBorrow − finalColl + swapOut − (flashBorrow + fee(flashBorrow))
  //                                 = depositAmount − finalColl + swapOut − fee(flashBorrow).
  // The flash borrow is therefore the EXACT collateral the deposit needs to bridge (the gap the user's own deposit does
  // not cover), NOT `spend·(1 + fee)`: the fee is funded by the swap, whose input (the `debt` borrow / `swapDebtTokenIn`)
  // is sized with the `(1 + flashLoanFee)` factor baked into `x`, so the swap delivers `spend·(1 + fee)` coll — exactly
  // `flashBorrow + fee(flashBorrow)` when the SC fee is `flashBorrow·rate ≥ 1 lamport`. The old `spend·(1 + fee)` flash
  // borrow caused the SC to charge fee on the inflated amount, leaving the ATA short by `O(fee²)` (dust-reliant). See
  // `fixed_rate_penalty_sizing_units.test.ts` for the SC-debit invariant.
  //
  // The debt reserve charges its origination fee on top of the borrow, so the obligation owes
  // `debt · (1 + originationFee)`. Leverage is measured against what is owed, hence the fee factor in `y`:
  //   L = finalColl / (finalColl − debt · (1 + originationFee) · priceDebtToColl)
  // `debt` itself stays the borrow-instruction amount, which is what funds the swap.
  const y = targetLeverage.mul(priceDebtToColl).mul(borrowFeeFactor);
  const x = flashLoanFee.add('1').mul(slippage.add('1')).div(priceDebtToColl);
  if (depositTokenIsCollToken) {
    const finalColl = depositAmount.mul(x).div(x.sub(targetLeverage.sub('1').div(y)));
    const debt = finalColl.sub(depositAmount).mul(x);
    // Exact spend: the collateral the flash loan bridges = finalColl − depositAmount (user supplies depositAmount).
    const flashBorrowColl = finalColl.sub(depositAmount);

    return {
      flashBorrowInCollToken: flashBorrowColl,
      initDepositInSol,
      debtTokenToBorrow: debt,
      collTokenToDeposit: finalColl,
      swapDebtTokenIn: debt,
      swapCollTokenExpectedOut: finalColl.sub(depositAmount),
    };
  } else {
    const finalColl = depositAmount.div(x.sub(targetLeverage.sub('1').div(y)));
    // Exact spend: the user pays in debt token, so the flash loan bridges the ENTIRE collateral deposit (finalColl).
    const flashBorrowColl = finalColl;
    const debt = targetLeverage.sub('1').mul(finalColl).div(y);

    return {
      flashBorrowInCollToken: flashBorrowColl,
      initDepositInSol,
      debtTokenToBorrow: debt,
      collTokenToDeposit: finalColl,
      swapDebtTokenIn: debt.add(depositAmount),
      swapCollTokenExpectedOut: finalColl,
    };
  }
};

/** @throws {PartialWithdrawalSizingError} When a partial payout cannot be sized while preserving remaining LTV. */
export function withdrawLeverageCalcs(
  market: KaminoMarket,
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  priceCollToDebt: Decimal,
  withdrawAmount: Decimal,
  deposited: Decimal,
  /** Current debt in token units, including accrued interest from the same snapshot as `currentLedgerInstant`. */
  borrowed: Decimal,
  currentLedgerInstant: LedgerInstant,
  isClosingPosition: boolean,
  selectedTokenIsCollToken: boolean,
  // Retained for positional API compatibility; selectedTokenIsCollToken determines the payout token.
  selectedTokenMint: Address,
  obligation: KaminoObligation,
  // Retained for positional API compatibility; canonical fees come from debtReserve.
  flashLoanFee: Decimal,
  slippagePct: Decimal
): WithdrawLeverageCalcsResult {
  assertPositiveFiniteDecimal('withdrawLeverageCalcs: priceCollToDebt', priceCollToDebt);
  if (!isClosingPosition) {
    const result = partialWithdrawalCalcs(
      collReserve,
      debtReserve,
      priceCollToDebt,
      withdrawAmount,
      deposited,
      borrowed,
      currentLedgerInstant,
      selectedTokenIsCollToken ? 'coll' : 'debt',
      obligation,
      slippagePct,
      'debt'
    );
    return result;
  }

  const withdrawAmountCalculated = deposited;
  const repayAmount = fullRepayAmount(market, obligation, debtReserve, currentLedgerInstant);

  // Fixed-term debt charges an early-repay penalty on top of the repay. The flash-borrow / coll→debt swap must
  // produce repayAmount + penalty so the on-chain repay debit (`repay + penalty`) succeeds; the repay instruction
  // amount stays the principal (`repayAmount`). Open-term debt → penalty 0 → unchanged behaviour.
  const { earlyRepayPenaltyAmount, repayFundingAmount } = leverageEarlyRepayPenalty(
    obligation,
    debtReserve,
    repayAmount,
    currentLedgerInstant
  );

  const flashRepayDebtTokens = flashRepayTokenAmount(repayFundingAmount, debtReserve);
  const collTokenSwapIn = selectedTokenIsCollToken
    ? flashRepayDebtTokens.mul(new Decimal(1).add(slippagePct.div(100))).div(priceCollToDebt)
    : withdrawAmountCalculated;
  const depositTokenWithdrawAmount = deposited;
  const debtTokenExpectedSwapOut = collTokenSwapIn.mul(priceCollToDebt).div(new Decimal(1).add(slippagePct.div(100)));

  return {
    withdrawAmount: withdrawAmountCalculated,
    repayAmount,
    earlyRepayPenaltyAmount,
    repayFundingAmount,
    collTokenSwapIn,
    debtTokenExpectedSwapOut,
    depositTokenWithdrawAmount,
  };
}

/**
 * Canonical lamport-domain sizing of the coll-flash loan leg, shared by the flash-borrow-type selectors
 * (`determineWithdrawLeverageFlashBorrowType` / `determineAdjustLeverageFlashBorrowType`) and the transaction
 * builders so selector viability can never drift from what the builder executes:
 *
 *  - `flashBorrowLamports`: flash borrow in coll **lamports** (`flashBorrowCollTokens * mintFactor`, ceiled; funds a
 *    ceil-sized exact-in swap).
 *  - `flashFeeLamports`: the SC flash fee on that borrow via `calcFlashLoanFees` (1-lamport minimum honoured; the
 *    flash ixs in these flows carry no referrer and the fee total is referral-split-independent), ceiled to whole
 *    lamports.
 *  - `flashRepayDebitLamports`: the exact ATA debit at flash-repay (`flashBorrow + fee`), in lamports.
 *  - `redeemCollLamports`: the withdraw that must fund the debit — fee-exclusive base (token→lamports, ceiled) + fee.
 */
export function calcCollFlashLegLamports(params: {
  collReserve: KaminoReserve;
  /** Flash-borrow size, in coll TOKEN units. */
  flashBorrowCollTokens: Decimal;
  /** Fee-exclusive withdraw base, in coll TOKEN units (`depositTokenWithdrawAmount`). */
  redeemBaseCollTokens: Decimal;
}): {
  flashBorrowLamports: Decimal;
  flashFeeLamports: Decimal;
  flashRepayDebitLamports: Decimal;
  redeemCollLamports: Decimal;
} {
  const { collReserve, flashBorrowCollTokens, redeemBaseCollTokens } = params;
  const flashBorrowLamports = flashBorrowCollTokens.mul(collReserve.getMintFactor()).ceil();
  const flashFeeLamports = calcFlashLoanFees({
    reserve: collReserve,
    referralFeeBps: 0,
    hasReferral: false,
    flashBorrowAmountLamports: flashBorrowLamports,
  }).flashLoanFeeLamports.ceil();
  return {
    flashBorrowLamports,
    flashFeeLamports,
    flashRepayDebitLamports: flashBorrowLamports.add(flashFeeLamports),
    redeemCollLamports: redeemBaseCollTokens.mul(collReserve.getMintFactor()).ceil().add(flashFeeLamports),
  };
}

/**
 * Fixed-term early-repay penalty for a leverage decrease/close, in DEBT TOKEN units (the leverage calcs work in token
 * units, not lamports). Mirrors `Obligation::calculate_early_repay_penalty`; returns `{ penalty: 0, funding: repay }`
 * for open-term reserves / matured / untracked borrows. The penalty is additive funding only — it inflates the
 * flash-borrow / swap, never the repay-instruction amount. Fixed-term paths require slot and block time from the same
 * ledger instant.
 */
function leverageEarlyRepayPenalty(
  obligation: KaminoObligation,
  debtReserve: KaminoReserve,
  repayAmountTokens: Decimal,
  currentLedgerInstant: LedgerInstant
): { earlyRepayPenaltyAmount: Decimal; repayFundingAmount: Decimal } {
  // Variable-rate / open-term short-circuit (keeps the common path off the mint-factor + lamport round-trip).
  if (!debtReserve.getKind().isFixedRate()) {
    return { earlyRepayPenaltyAmount: new Decimal(0), repayFundingAmount: repayAmountTokens };
  }
  // Fixed-rate: thin token-unit wrapper over the single lamport-domain funding-invariant helper on KaminoObligation.
  // The leverage calcs work in token units, so convert principal to lamports, delegate, then convert the penalty back.
  const mintFactor = debtReserve.getMintFactor();
  const repayLamports = repayAmountTokens.mul(mintFactor).ceil();
  const { penaltyLamports } = obligation.calculateEarlyRepayFunding(debtReserve, repayLamports, currentLedgerInstant);
  const earlyRepayPenaltyAmount = penaltyLamports.div(mintFactor);
  return { earlyRepayPenaltyAmount, repayFundingAmount: repayAmountTokens.add(earlyRepayPenaltyAmount) };
}

export function adjustDepositLeverageCalcs(
  debtReserve: KaminoReserve,
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  priceDebtToColl: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal
): AdjustLeverageCalcsResult {
  assertPositiveFiniteDecimal('adjustDepositLeverageCalcs: priceDebtToColl', priceDebtToColl);
  const amountToFlashBorrowDebt = adjustDepositPosition
    .div(priceDebtToColl)
    .mul(new Decimal(1).add(slippagePct.div(100)))
    .toDecimalPlaces(debtReserve!.stats.decimals, Decimal.ROUND_UP);

  const borrowAmount = adjustDepositPosition
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1).add(slippagePct.div(100)))
    .div(priceDebtToColl);

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    amountToFlashBorrowDebt,
    borrowAmount,
    withdrawAmountWithSlippageAndFlashLoanFee: new Decimal(0),
    // Increase borrows (no repay) → no early-repay penalty.
    earlyRepayPenaltyAmount: new Decimal(0),
    repayFundingAmount: new Decimal(0),
  };
}

export function adjustWithdrawLeverageCalcs(
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal,
  // Optional for pure calculation callers. Production builders and flash-borrow selectors provide the obligation,
  // reserve, and ledger instant so the fixed-term early-repay penalty is folded into the sizing.
  obligation?: KaminoObligation,
  debtReserve?: KaminoReserve,
  currentLedgerInstant?: LedgerInstant
): AdjustLeverageCalcsResult {
  // Fixed-term debt charges an early-repay penalty on top of the repay. We flash-borrow the funding amount
  // (principal + penalty) and repay only the principal; the extra penalty cost is paid by withdrawing proportionally
  // more collateral, including rounded flash fees and the full-repayment cushion.
  const absRepay = Decimal.abs(adjustBorrowPosition);
  const { earlyRepayPenaltyAmount, repayFundingAmount } =
    obligation && debtReserve && currentLedgerInstant !== undefined
      ? leverageEarlyRepayPenalty(
          obligation,
          debtReserve,
          absRepay.gte(obligation.getBorrowAmountByReserve(debtReserve))
            ? fullRepayAmount(obligation.market, obligation, debtReserve, currentLedgerInstant)
            : absRepay,
          currentLedgerInstant
        )
      : { earlyRepayPenaltyAmount: new Decimal(0), repayFundingAmount: absRepay };
  const flashRepayAmount = debtReserve
    ? flashRepayTokenAmount(repayFundingAmount, debtReserve)
    : repayFundingAmount.mul(new Decimal(1).add(flashLoanFee));
  const fundingScale = absRepay.gt(0) ? flashRepayAmount.div(absRepay) : new Decimal(1);
  const withdrawAmountWithSlippageAndFlashLoanFee = Decimal.abs(adjustDepositPosition)
    .mul(new Decimal(1).add(slippagePct.div(100)))
    .mul(fundingScale);

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    amountToFlashBorrowDebt: new Decimal(0),
    borrowAmount: new Decimal(0),
    withdrawAmountWithSlippageAndFlashLoanFee,
    earlyRepayPenaltyAmount,
    repayFundingAmount,
  };
}

/**
 * Deposit with flash borrow DEBT token.
 * Flow: flash borrow debt -> swap debt->coll -> deposit coll -> borrow debt -> flash repay debt
 *
 * The user deposits collateral (or debt token). We flash borrow debt, swap it to coll,
 * deposit all coll, borrow debt to repay the flash loan (principal + fee).
 */
export const depositLeverageCalcsDebtFlash = (props: {
  depositAmount: Decimal;
  depositTokenIsCollToken: boolean;
  depositTokenIsSol: boolean;
  priceDebtToColl: Decimal;
  targetLeverage: Decimal;
  slippagePct: Decimal;
  flashLoanFee: Decimal;
  borrowFee: Decimal;
}): DepositLeverageDebtFlashCalcsResult => {
  const {
    depositAmount,
    depositTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
    borrowFee,
  } = props;
  const slippage = slippagePct.div('100');
  const initDepositInSol = depositTokenIsSol ? depositAmount : new Decimal(0);

  assertPositiveFiniteDecimal('depositLeverageCalcsDebtFlash: priceDebtToColl', priceDebtToColl);

  const slippageFactor = slippage.add('1');
  const flashFeeFactor = flashLoanFee.add('1');
  const borrowFeeFactor = borrowFee.add('1');

  if (depositTokenIsCollToken) {
    // User deposits coll. We flash borrow debt, swap to coll, deposit all, borrow debt to repay flash.
    //
    // Definitions:
    //   collTotal      = depositAmount + flashBorrowDebt * priceDebtToColl / (1 + slippage)
    //   debtToBorrow   = flashBorrowDebt * (1 + flashLoanFee)
    //   debtOwed       = debtToBorrow * (1 + originationFee)
    //   leverage       = collTotal / (collTotal - debtOwed * priceDebtToColl)
    //
    // Solving for flashBorrowDebt, with feeFactors = (1 + flashLoanFee) * (1 + originationFee):
    //   flashBorrowDebt = depositAmount * (leverage - 1)
    //                     / (priceDebtToColl * (leverage * feeFactors - (leverage - 1) / (1 + slippage)))
    const denominator = priceDebtToColl.mul(
      targetLeverage.mul(flashFeeFactor).mul(borrowFeeFactor).sub(targetLeverage.sub('1').div(slippageFactor))
    );
    const flashBorrowDebt = depositAmount.mul(targetLeverage.sub('1')).div(denominator);

    const collFromSwap = flashBorrowDebt.mul(priceDebtToColl).div(slippageFactor);
    const collTokenToDeposit = depositAmount.add(collFromSwap);
    const debtTokenToBorrow = flashBorrowDebt.mul(flashFeeFactor);

    return {
      flashBorrowInDebtToken: flashBorrowDebt,
      initDepositInSol,
      debtTokenToBorrow,
      collTokenToDeposit,
      swapDebtTokenIn: flashBorrowDebt,
      swapCollTokenExpectedOut: collFromSwap,
    };
  } else {
    // User deposits debt token. The user's deposit + flash borrowed debt both go into the swap.
    // Flow: flash borrow flashBorrowDebt debt -> swap (depositAmount + flashBorrowDebt) debt -> coll
    //       -> deposit collTotal coll -> borrow debtToBorrow debt -> flash repay flashBorrowDebt * (1 + flashLoanFee)
    //
    // Definitions:
    //   collTotal      = (depositAmount + flashBorrowDebt) * priceDebtToColl / (1 + slippage)
    //   debtToBorrow   = flashBorrowDebt * (1 + flashLoanFee)
    //   debtOwed       = debtToBorrow * (1 + originationFee)
    //   leverage       = collTotal / (collTotal - debtOwed * priceDebtToColl)
    //
    // Solving for flashBorrowDebt:
    //   flashBorrowDebt = depositAmount * (leverage - 1)
    //                     / ((1 + slippage) * leverage * (1 + flashLoanFee) * (1 + originationFee) - (leverage - 1))
    const denominator = slippageFactor
      .mul(targetLeverage)
      .mul(flashFeeFactor)
      .mul(borrowFeeFactor)
      .sub(targetLeverage.sub('1'));
    if (denominator.isZero()) {
      throw new Error(
        'depositLeverageCalcsDebtFlash: denominator is zero — check targetLeverage, slippage, and flashLoanFee'
      );
    }
    const flashBorrowDebt = depositAmount.mul(targetLeverage.sub('1')).div(denominator);

    const totalDebtToSwap = depositAmount.add(flashBorrowDebt);
    const collFromSwap = totalDebtToSwap.mul(priceDebtToColl).div(slippageFactor);
    const collTokenToDeposit = collFromSwap;
    const debtTokenToBorrow = flashBorrowDebt.mul(flashFeeFactor);

    return {
      flashBorrowInDebtToken: flashBorrowDebt,
      initDepositInSol,
      debtTokenToBorrow,
      collTokenToDeposit,
      swapDebtTokenIn: totalDebtToSwap,
      swapCollTokenExpectedOut: collFromSwap,
    };
  }
};

/**
 * Withdraw with flash borrow COLLATERAL token.
 * Flow: flash borrow coll -> swap coll->debt -> repay debt -> withdraw coll -> flash repay coll
 *
 * We flash borrow enough coll to swap for the debt repayment amount,
 * then repay debt, withdraw coll, and use the withdrawn coll to repay the flash loan.
 *
 * @throws {PartialWithdrawalSizingError} When a partial payout cannot be sized while preserving remaining LTV.
 */
export function withdrawLeverageCalcsCollFlash(
  market: KaminoMarket,
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  priceCollToDebt: Decimal,
  withdrawAmount: Decimal,
  deposited: Decimal,
  /** Current debt in token units, including accrued interest from the same snapshot as `currentLedgerInstant`. */
  borrowed: Decimal,
  currentLedgerInstant: LedgerInstant,
  isClosingPosition: boolean,
  selectedTokenIsCollToken: boolean,
  // Retained for positional API compatibility; selectedTokenIsCollToken determines the payout token.
  selectedTokenMint: Address,
  obligation: KaminoObligation,
  // Used by close-to-debt sizing; partial withdrawals read canonical fees from collReserve.
  flashLoanFee: Decimal,
  slippagePct: Decimal
): WithdrawLeverageCollFlashCalcsResult {
  assertPositiveFiniteDecimal('withdrawLeverageCalcsCollFlash: priceCollToDebt', priceCollToDebt);
  if (!isClosingPosition) {
    const result = partialWithdrawalCalcs(
      collReserve,
      debtReserve,
      priceCollToDebt,
      withdrawAmount,
      deposited,
      borrowed,
      currentLedgerInstant,
      selectedTokenIsCollToken ? 'coll' : 'debt',
      obligation,
      slippagePct,
      'coll'
    );
    return { ...result, flashBorrowInCollToken: result.collTokenSwapIn };
  }

  const withdrawAmountCalculated = deposited;
  const repayAmount = fullRepayAmount(market, obligation, debtReserve, currentLedgerInstant);

  // Fixed-term debt charges an early-repay penalty on top of the repay; the coll→debt swap must produce
  // repayAmount + penalty so the on-chain repay debit succeeds. The repay instruction amount stays the principal.
  const { earlyRepayPenaltyAmount, repayFundingAmount } = leverageEarlyRepayPenalty(
    obligation,
    debtReserve,
    repayAmount,
    currentLedgerInstant
  );

  // 3. Calculate how much coll to flash borrow for the swap
  // When withdrawing coll: swap just enough coll->debt to cover the repayment (incl. penalty)
  // When withdrawing debt: swap all withdrawn coll to debt; user keeps surplus debt after repay
  const swapAmountIfWithdrawingColl = repayFundingAmount
    .mul(new Decimal(1).add(slippagePct.div(100)))
    .div(priceCollToDebt);
  let swapAmountIfWithdrawingDebt = withdrawAmountCalculated;
  if (!selectedTokenIsCollToken) {
    const collateralLamports = deposited.mul(collReserve.getMintFactor()).floor();
    const fees = collReserve.calculateFees(collateralLamports, flashLoanFee, FeeCalculation.Inclusive, 0, false);
    swapAmountIfWithdrawingDebt = collateralLamports
      .sub(fees.protocolFees)
      .sub(fees.referrerFees)
      .floor()
      .div(collReserve.getMintFactor());
  }
  const collTokenSwapIn = selectedTokenIsCollToken ? swapAmountIfWithdrawingColl : swapAmountIfWithdrawingDebt;
  const debtTokenExpectedSwapOut = collTokenSwapIn.mul(priceCollToDebt).div(new Decimal(1).add(slippagePct.div(100)));

  // 4. Flash borrow amount = the EXACT collateral the swap spends (`collTokenSwapIn`), matching the lending-side
  // repay-with-coll pattern (`calcRepayWithCollCollFlashSwap`). The on-chain flash repay charges its fee on the borrowed
  // `liquidity_amount` (handler_flash_repay_reserve_liquidity / lending_operations::flash_repay_reserve_liquidity), so
  // the OLD `collSwapIn*(1+fee)` borrow made the SC compute fee on the inflated amount (an O(fee²) overage). Borrowing
  // exactly the spend keeps the flash fee `= fee(collSwapIn)`, funded by the withdraw leg below.
  const flashBorrowInCollToken = collTokenSwapIn;

  // Collateral-flash fees are added in atomic units by calcCollFlashLegLamports.
  const depositTokenWithdrawAmount = withdrawAmountCalculated;

  return {
    flashBorrowInCollToken,
    withdrawAmount: withdrawAmountCalculated,
    repayAmount,
    earlyRepayPenaltyAmount,
    repayFundingAmount,
    collTokenSwapIn,
    debtTokenExpectedSwapOut,
    depositTokenWithdrawAmount,
  };
}

/**
 * Adjust (increase leverage) with flash borrow DEBT token.
 * Flow: flash borrow debt -> swap debt->coll -> deposit coll -> borrow debt -> flash repay debt
 */
export function adjustDepositLeverageCalcsDebtFlash(
  debtReserve: KaminoReserve,
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  priceDebtToColl: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal
): AdjustDepositDebtFlashCalcsResult {
  // We need to deposit `adjustDepositPosition` more coll.
  // Flash borrow debt, swap to coll, deposit coll, borrow debt to repay flash.
  // flashBorrowDebt: enough debt to swap for adjustDepositPosition coll (with slippage)
  assertPositiveFiniteDecimal('adjustDepositLeverageCalcsDebtFlash: priceDebtToColl', priceDebtToColl);
  const flashBorrowDebt = adjustDepositPosition
    .mul(new Decimal(1).add(slippagePct.div(100)))
    .div(priceDebtToColl)
    .toDecimalPlaces(debtReserve.stats.decimals, Decimal.ROUND_UP);

  // We borrow enough debt from klend to repay flash loan + fee
  const debtTokenToBorrow = flashBorrowDebt.mul(new Decimal(1).add(flashLoanFee));

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    flashBorrowInDebtToken: flashBorrowDebt,
    debtTokenToBorrow,
    swapDebtTokenIn: flashBorrowDebt,
    swapCollTokenExpectedOut: adjustDepositPosition,
  };
}

/**
 * Adjust (decrease leverage) with flash borrow COLLATERAL token.
 * Flow: flash borrow coll -> swap coll->debt -> repay debt -> withdraw coll -> flash repay coll
 */
export function adjustWithdrawLeverageCalcsCollFlash(
  adjustDepositPosition: Decimal,
  adjustBorrowPosition: Decimal,
  priceCollToDebt: Decimal,
  flashLoanFee: Decimal,
  slippagePct: Decimal,
  // Optional for pure calculation callers. Production builders and flash-borrow selectors provide the obligation,
  // reserve, and ledger instant so the fixed-term early-repay penalty is folded into the sizing.
  obligation?: KaminoObligation,
  debtReserve?: KaminoReserve,
  currentLedgerInstant?: LedgerInstant
): AdjustWithdrawCollFlashCalcsResult {
  const absDebtRepay = Decimal.abs(adjustBorrowPosition);

  // Fixed-term debt charges an early-repay penalty on top of the repay; the coll→debt swap must produce
  // principal + penalty so the repay debit succeeds. The repay instruction amount stays the principal, and the extra
  // collateral needed is scaled proportionally, including the full-repayment cushion.
  const { earlyRepayPenaltyAmount, repayFundingAmount } =
    obligation && debtReserve && currentLedgerInstant !== undefined
      ? leverageEarlyRepayPenalty(
          obligation,
          debtReserve,
          absDebtRepay.gte(obligation.getBorrowAmountByReserve(debtReserve))
            ? fullRepayAmount(obligation.market, obligation, debtReserve, currentLedgerInstant)
            : absDebtRepay,
          currentLedgerInstant
        )
      : { earlyRepayPenaltyAmount: new Decimal(0), repayFundingAmount: absDebtRepay };

  // Flash borrow coll to swap for debt repayment (incl. penalty)
  // collSwapIn * priceCollToDebt / (1 + slippage) >= repayFundingAmount
  assertPositiveFiniteDecimal('adjustWithdrawLeverageCalcsCollFlash: priceCollToDebt', priceCollToDebt);
  const collTokenSwapIn = repayFundingAmount.mul(new Decimal(1).add(slippagePct.div(100))).div(priceCollToDebt);
  const debtTokenExpectedSwapOut = collTokenSwapIn.mul(priceCollToDebt).div(new Decimal(1).add(slippagePct.div(100)));

  // Flash borrow = the EXACT collateral the swap spends (`collTokenSwapIn`); the SC charges its fee on the borrowed
  // `liquidity_amount`, so borrowing the bare spend keeps the fee `= fee(collSwapIn)` (the old `collSwapIn*(1+fee)`
  // borrow inflated the fee base — an O(fee²) overage). The fee is funded by the withdraw leg below.
  const flashBorrowInCollToken = collTokenSwapIn;

  // Collateral to withdraw from the obligation (token-domain base, WITHOUT the flash fee). The build/selector layers add
  // `flashRepayDebit − flashBorrow = fee(collSwapIn)` lamports on top via the shared `calcFlashLoanFees` helper (1-lamport
  // minimum + referrer split honoured exactly). Coll balance at flash-repay = flashBorrow − collSwapIn + (collSwapIn +
  // fee) = collSwapIn + fee = SC debit (net 0 — a deleverage pays nothing out). Because `collTokenSwapIn` is sized from
  // `repayFundingAmount` (principal + fixed-term early-repay penalty), the withdrawal already covers the penalty.
  const depositTokenWithdrawAmount = collTokenSwapIn;

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
    flashBorrowInCollToken,
    collTokenSwapIn,
    debtTokenExpectedSwapOut,
    depositTokenWithdrawAmount,
    earlyRepayPenaltyAmount,
    repayFundingAmount,
  };
}

/**
 * A partial payout has no verified sizing that preserves the remaining position’s LTV.
 * Callers can reduce the payout or explicitly close the position. Atomic rounding can also
 * refuse a boundary-sized payout whose remaining position would be dust.
 */
export class PartialWithdrawalSizingError extends Error {
  constructor() {
    super('Cannot size this partial withdrawal while preserving leverage; reduce the amount or close the position');
    this.name = 'PartialWithdrawalSizingError';
  }
}

function partialWithdrawalCalcs(
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  priceCollToDebt: Decimal,
  withdrawAmount: Decimal,
  deposited: Decimal,
  borrowed: Decimal,
  currentLedgerInstant: LedgerInstant,
  selectedToken: 'coll' | 'debt',
  obligation: KaminoObligation,
  slippagePct: Decimal,
  flash: 'coll' | 'debt'
): WithdrawLeverageCalcsResult {
  const collFactor = collReserve.getMintFactor();
  const debtFactor = debtReserve.getMintFactor();
  const slippageFactor = new Decimal(1).add(slippagePct.div(100));
  const payoutFactor = selectedToken === 'coll' ? collFactor : debtFactor;
  const payout = withdrawAmount.mul(payoutFactor).ceil().div(payoutFactor);
  // A nonzero flash fee has a one-lamport minimum; the canonical fee calculator requires principal > fee.
  const minimumSwapLamports = flash === 'coll' && collReserve.getFlashLoanFee().gt(0) ? 2 : 1;
  const evaluate = (repayLamports: Decimal) => {
    const repayAmount = repayLamports.div(debtFactor);
    const { earlyRepayPenaltyAmount, repayFundingAmount } = leverageEarlyRepayPenalty(
      obligation,
      debtReserve,
      repayAmount,
      currentLedgerInstant
    );
    const debtDebit = flash === 'debt' ? flashRepayTokenAmount(repayFundingAmount, debtReserve) : repayFundingAmount;
    const requiredOutput = selectedToken === 'coll' ? debtDebit : debtDebit.add(payout);
    const swapLamports = Decimal.max(
      requiredOutput.mul(slippageFactor).div(priceCollToDebt).mul(collFactor).ceil(),
      minimumSwapLamports
    );
    const collTokenSwapIn = swapLamports.div(collFactor);
    const depositTokenWithdrawAmount = selectedToken === 'coll' ? collTokenSwapIn.add(payout) : collTokenSwapIn;
    const redeemLamports =
      flash === 'coll'
        ? calcCollFlashLegLamports({
            collReserve,
            flashBorrowCollTokens: collTokenSwapIn,
            redeemBaseCollTokens: depositTokenWithdrawAmount,
          }).redeemCollLamports
        : depositTokenWithdrawAmount.mul(collFactor).ceil();
    const totalWithdraw = bufferWithdrawForRedeemDrift(redeemLamports).div(collFactor);
    return {
      withdrawAmount: totalWithdraw,
      repayAmount,
      earlyRepayPenaltyAmount,
      repayFundingAmount,
      collTokenSwapIn,
      debtTokenExpectedSwapOut: collTokenSwapIn.mul(priceCollToDebt).div(slippageFactor),
      depositTokenWithdrawAmount,
    };
  };
  const preservesLeverage = (result: WithdrawLeverageCalcsResult) =>
    result.withdrawAmount.lt(deposited) && result.repayAmount.mul(deposited).gte(borrowed.mul(result.withdrawAmount));
  // The debt-flash route has the same two-lamport minimum when its fee is nonzero.
  let low = new Decimal(flash === 'debt' && debtReserve.getFlashLoanFee().gt(0) ? 2 : 1);
  let high = borrowed.mul(debtFactor).ceil().sub(1);
  if (high.lt(low)) throw new PartialWithdrawalSizingError();
  let result = evaluate(high);
  // Atomic fee/redemption jumps can make a boundary-sized request infeasible at this endpoint.
  // Keep a verified feasible upper bound; callers can reduce a refused partial amount or close explicitly.
  if (!preservesLeverage(result)) throw new PartialWithdrawalSizingError();
  while (low.lt(high)) {
    const mid = low.add(high).div(2).floor();
    const candidate = evaluate(mid);
    if (preservesLeverage(candidate)) {
      high = mid;
      result = candidate;
    } else {
      low = mid.add(1);
    }
  }
  return result;
}

function fullRepayAmount(
  market: KaminoMarket,
  obligation: KaminoObligation,
  debtReserve: KaminoReserve,
  currentLedgerInstant: LedgerInstant
): Decimal {
  const borrow = obligation.state.borrows.find((position) => position.borrowReserve === debtReserve.address);
  if (!borrow) {
    throw new Error(`Unable to find obligation borrow to repay for reserve ${debtReserve.address}`);
  }
  // The estimate is at least 1, so a stale reserve projection never sizes the repay below the stored debt.
  const debt = KaminoObligation.getBorrowAmount(borrow)
    .mul(obligation.estimateObligationInterestRate(market, debtReserve, borrow, currentLedgerInstant))
    .div(debtReserve.getMintFactor());
  return bufferRepayAmount(debt, debtReserve);
}

// 1.1 bps covers interest accrued after sizing: about 58 minutes at 100% APR.
function bufferRepayAmount(amount: Decimal, debtReserve: KaminoReserve): Decimal {
  return amount.mul('1.00011').toDecimalPlaces(debtReserve.getMintDecimals(), Decimal.ROUND_CEIL);
}

export function flashRepayTokenAmount(amount: Decimal, reserve: KaminoReserve): Decimal {
  return calcFlashLoanFees({
    reserve,
    referralFeeBps: 0,
    hasReferral: false,
    flashBorrowAmountLamports: amount.mul(reserve.getMintFactor()).ceil(),
  })
    .flashRepayDebitLamports.ceil()
    .div(reserve.getMintFactor());
}
