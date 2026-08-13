import { Address, Slot } from '@solana/kit';
import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve, toJson } from '../classes';
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
import { LedgerInstant, normalizeLedgerInstantArgument, requireMatchingLedgerInstant } from '../utils/ledger';
import { calcFlashLoanFees } from '../lending_operations/repay_with_collateral_calcs';

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
  } = estimateDepositMode({
    priceCollToDebt,
    priceDebtToColl,
    amount: depositAmount,
    targetLeverage,
    selectedTokenMint,
    collTokenMint: collTokenMint,
    flashLoanFee: flashLoanFeeRatio,
    slippagePct,
  });

  // calculate estimations for withdraw operation
  const {
    adjustDepositPosition: withdrawModeEstimatedDepositTokenWithdrawn,
    adjustBorrowPosition: withdrawModeEstimatedBorrowTokenWithdrawn,
  } = estimateWithdrawMode({
    priceCollToDebt: priceCollToDebt,
    collTokenMint,
    selectedTokenMint,
    amount: withdrawAmount,
    deposited: new Decimal(deposited),
    borrowed: new Decimal(borrowed),
  });

  // calculate estimations for adjust operation
  const {
    adjustDepositPosition: adjustModeEstimatedDepositAmount,
    adjustBorrowPosition: adjustModeEstimateBorrowAmount,
  } = estimateAdjustMode(priceCollToDebt, {
    targetLeverage,
    debtTokenMint,
    collTokenMint,
    totalDeposited: new Decimal(deposited),
    totalBorrowed: new Decimal(borrowed),
    flashLoanFee: flashLoanFeeRatio, // TODO: is this the right flash borrow?
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

  let [isClosingPosition, totalDeposited, totalBorrowed] = [false, new Decimal(0), new Decimal(0)];

  switch (activeLeverageOption) {
    case LeverageOption.deposit: {
      // Deposit and Adjust never clos the position
      isClosingPosition = false;
      totalDeposited = deposited.add(depositModeEstimatedDepositAmount);
      totalBorrowed = borrowed.add(depositModeEstimatedBorrowAmount);
      break;
    }
    case LeverageOption.close:
    case LeverageOption.withdraw: {
      isClosingPosition =
        (withdrawModeEstimatedDepositTokenWithdrawn.gte(new Decimal(deposited)) ||
          withdrawModeEstimatedBorrowTokenWithdrawn.gte(new Decimal(borrowed)) ||
          fuzzyEqual(
            withdrawModeEstimatedDepositTokenWithdrawn,
            new Decimal(deposited),
            closingPositionDiffTolerance
          ) ||
          fuzzyEqual(withdrawModeEstimatedBorrowTokenWithdrawn, new Decimal(borrowed), closingPositionDiffTolerance)) &&
        !fuzzyEqual(withdrawModeEstimatedDepositTokenWithdrawn, new Decimal(0), closingPositionDiffTolerance);

      totalDeposited = isClosingPosition ? new Decimal(0) : deposited.sub(withdrawModeEstimatedDepositTokenWithdrawn);
      totalBorrowed = isClosingPosition ? new Decimal(0) : borrowed.sub(withdrawModeEstimatedBorrowTokenWithdrawn);
      break;
    }
    case LeverageOption.adjust: {
      // Deposit and Adjust never clos the position
      isClosingPosition = false;
      totalDeposited = deposited.add(adjustModeEstimatedDepositAmount);
      totalBorrowed = borrowed.add(adjustModeEstimateBorrowAmount);
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
    priceCollToDebt: new Decimal(priceCollToDebt),
    targetLeverage: new Decimal(targetLeverage),
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
}

/**
 * Calculate how much token will be deposited or withdrawn in case of position adjustment
 * @param leverage
 * @param totalDeposited
 * @param totalBorrowed
 */
export const estimateAdjustMode = (
  priceCollToDebt: Decimal,
  { targetLeverage, totalDeposited, totalBorrowed, flashLoanFee }: UseEstimateAdjustAmountsProps
) => {
  return calcAdjustAmounts({
    currentBorrowPosition: totalBorrowed,
    currentDepositPosition: totalDeposited,
    priceCollToDebt,
    targetLeverage,
    flashLoanFee,
  });
};

export interface AdjustLeverageParams {
  targetLeverage: Decimal;
  currentBorrowPosition: Decimal;
  currentDepositPosition: Decimal;
  priceCollToDebt: Decimal;
  flashLoanFee: Decimal;
}

interface AdjustLeverageResult {
  adjustDepositPosition: Decimal;
  adjustBorrowPosition: Decimal;
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
}: AdjustLeverageParams): AdjustLeverageResult {
  assertPositiveFiniteDecimal('calcAdjustAmounts: priceCollToDebt', priceCollToDebt);
  const initialDeposit = currentDepositPosition.minus(currentBorrowPosition.div(priceCollToDebt));
  const targetDeposit = initialDeposit.mul(targetLeverage);

  const targetBorrow = calcBorrowAmount({
    depositTokenAmount: initialDeposit,
    priceCollToDebt: new Decimal(priceCollToDebt),
    targetLeverage: new Decimal(targetLeverage),
    flashLoanFeeRatio: flashLoanFee,
  });

  const adjustDepositPosition = targetDeposit.minus(currentDepositPosition);
  const adjustBorrowPosition = targetBorrow.minus(currentBorrowPosition);

  return {
    adjustDepositPosition,
    adjustBorrowPosition,
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
  slippagePct: Decimal;
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
  slippagePct,
}: UseTransactionInfoStats) => {
  const isDepositingCollToken = selectedTokenMint === collTokenMint;

  const finalCollTokenAmount = isDepositingCollToken
    ? new Decimal(amount).mul(targetLeverage).toNumber()
    : new Decimal(amount).mul(priceDebtToColl).mul(targetLeverage).toNumber();

  const depositCollTokenAmount = isDepositingCollToken ? amount : amount.mul(priceDebtToColl);
  const borrowAmount = calcBorrowAmount({
    depositTokenAmount: depositCollTokenAmount,
    targetLeverage: new Decimal(targetLeverage),
    priceCollToDebt: new Decimal(priceCollToDebt),
    flashLoanFeeRatio: new Decimal(flashLoanFee),
  });

  const slippageFactor = new Decimal(1).add(slippagePct.div(new Decimal(100)));
  const borrowAmountWithSlippage = borrowAmount.mul(slippageFactor);

  return {
    adjustDepositPosition: finalCollTokenAmount,
    adjustBorrowPosition: borrowAmountWithSlippage.toNumber(),
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
  } = props;
  const slippage = slippagePct.div('100');

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
  if (depositTokenIsCollToken) {
    const y = targetLeverage.mul(priceDebtToColl);
    const x = flashLoanFee.add('1').mul(slippage.add('1')).div(priceDebtToColl);
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
    const y = targetLeverage.mul(priceDebtToColl);
    const x = flashLoanFee.add('1').mul(slippage.add('1')).div(priceDebtToColl);
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

export function withdrawLeverageCalcs(
  market: KaminoMarket,
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  priceCollToDebt: Decimal,
  withdrawAmount: Decimal,
  deposited: Decimal,
  borrowed: Decimal,
  currentSlotOrLedgerInstant: Slot | LedgerInstant,
  isClosingPosition: boolean,
  selectedTokenIsCollToken: boolean,
  selectedTokenMint: Address,
  obligation: KaminoObligation,
  flashLoanFee: Decimal,
  slippagePct: Decimal,
  currentLedgerInstant?: LedgerInstant
): WithdrawLeverageCalcsResult {
  const { currentSlot, currentLedgerInstant: normalizedLedgerInstant } = normalizeLedgerInstantArgument(
    currentSlotOrLedgerInstant,
    currentLedgerInstant,
    'withdrawLeverageCalcs'
  );
  // Closing-position branch below divides by `priceCollToDebt` directly (bypassing `calcWithdrawAmounts`), so guard
  // here as well as in the leaf calc.
  assertPositiveFiniteDecimal('withdrawLeverageCalcs: priceCollToDebt', priceCollToDebt);
  // 1. Calculate coll_amount and debt_amount to repay such that we maintain leverage and we withdraw to
  // the wallet `amountInDepositTokenToWithdrawToWallet` amount of collateral token
  // We need to withdraw withdrawAmountInDepositToken coll tokens
  // and repay repayAmountInBorrowToken debt tokens
  const { adjustDepositPosition: withdrawAmountCalculated, adjustBorrowPosition: initialRepayAmount } =
    isClosingPosition
      ? { adjustDepositPosition: deposited, adjustBorrowPosition: borrowed }
      : calcWithdrawAmounts({
          collTokenMint: collReserve.getLiquidityMint(),
          priceCollToDebt: new Decimal(priceCollToDebt),
          currentDepositPosition: deposited,
          currentBorrowPosition: borrowed,
          withdrawAmount: new Decimal(withdrawAmount),
          selectedTokenMint: selectedTokenMint,
        });

  // Add slippage for the accrued interest rate amount
  const irSlippageBpsForDebt = obligation!
    .estimateObligationInterestRate(market, debtReserve!, obligation?.state.borrows[0]!, currentSlot)
    .toDecimalPlaces(debtReserve?.getMintDecimals()!, Decimal.ROUND_CEIL);
  // add 0.1 to irSlippageBpsForDebt because we don't want to estimate slightly less than SC and end up not repaying enough
  const repayAmount = initialRepayAmount
    .mul(irSlippageBpsForDebt.add('0.1').div('10_000').add('1'))
    .toDecimalPlaces(debtReserve?.getMintDecimals()!, Decimal.ROUND_CEIL);

  // Fixed-term debt charges an early-repay penalty on top of the repay. The flash-borrow / coll→debt swap must
  // produce repayAmount + penalty so the on-chain repay debit (`repay + penalty`) succeeds; the repay instruction
  // amount stays the principal (`repayAmount`). Open-term debt → penalty 0 → unchanged behaviour.
  const { earlyRepayPenaltyAmount, repayFundingAmount } = leverageEarlyRepayPenalty(
    obligation,
    debtReserve,
    repayAmount,
    currentSlot,
    normalizedLedgerInstant
  );

  // 6. Get swap ixs
  // 5. Get swap estimations to understand how much we need to borrow from borrow reserve
  // prevent withdrawing more then deposited if we close position
  const depositTokenWithdrawAmount = !isClosingPosition
    ? withdrawAmountCalculated.mul(new Decimal(1).plus(flashLoanFee))
    : withdrawAmountCalculated;

  // We are swapping debt token
  // When withdrawing coll, it means we just need to swap enough to pay for the flash borrow (sized on the funding
  // amount = principal + penalty)
  const swapAmountIfWithdrawingColl = repayFundingAmount
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(1).plus(slippagePct.div(100)))
    .div(priceCollToDebt);

  // When withdrawing debt, it means we need to swap just the collateral we are withdrwaing
  // enough to cover the debt we are repaying, leaving the remaining in the wallet
  const swapAmountIfWithdrawingDebt = withdrawAmountCalculated;

  const collTokenSwapIn = selectedTokenIsCollToken ? swapAmountIfWithdrawingColl : swapAmountIfWithdrawingDebt;
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
  currentSlot: Slot,
  currentLedgerInstant?: LedgerInstant
): { earlyRepayPenaltyAmount: Decimal; repayFundingAmount: Decimal } {
  // Variable-rate / open-term short-circuit (keeps the common path off the mint-factor + lamport round-trip).
  if (!debtReserve.getKind().isFixedRate()) {
    return { earlyRepayPenaltyAmount: new Decimal(0), repayFundingAmount: repayAmountTokens };
  }
  const ledgerInstant = requireMatchingLedgerInstant(currentSlot, currentLedgerInstant, 'leverageEarlyRepayPenalty');
  // Fixed-rate: thin token-unit wrapper over the single lamport-domain funding-invariant helper on KaminoObligation.
  // The leverage calcs work in token units, so convert principal to lamports, delegate, then convert the penalty back.
  const mintFactor = debtReserve.getMintFactor();
  const repayLamports = repayAmountTokens.mul(mintFactor).ceil();
  const { penaltyLamports } = obligation.calculateEarlyRepayFunding(debtReserve, repayLamports, ledgerInstant);
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
    .mul(new Decimal(new Decimal(1).add(slippagePct.div(100))))
    .toDecimalPlaces(debtReserve!.stats.decimals, Decimal.ROUND_UP);

  const borrowAmount = adjustDepositPosition
    .mul(new Decimal(1).plus(flashLoanFee))
    .mul(new Decimal(new Decimal(1).add(slippagePct.div(100))))
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
  currentSlotOrLedgerInstant?: Slot | LedgerInstant,
  currentLedgerInstant?: LedgerInstant
): AdjustLeverageCalcsResult {
  // Fixed-term debt charges an early-repay penalty on top of the repay. We flash-borrow the funding amount
  // (principal + penalty) and repay only the principal; the extra penalty cost is paid by withdrawing proportionally
  // more collateral (scaled by funding/principal). Open-term debt → penalty 0 → unchanged behaviour.
  const absRepay = Decimal.abs(adjustBorrowPosition);
  const normalizedLedger =
    currentSlotOrLedgerInstant === undefined
      ? undefined
      : normalizeLedgerInstantArgument(currentSlotOrLedgerInstant, currentLedgerInstant, 'adjustWithdrawLeverageCalcs');
  const { earlyRepayPenaltyAmount, repayFundingAmount } =
    obligation && debtReserve && normalizedLedger !== undefined
      ? leverageEarlyRepayPenalty(
          obligation,
          debtReserve,
          absRepay,
          normalizedLedger.currentSlot,
          normalizedLedger.currentLedgerInstant
        )
      : { earlyRepayPenaltyAmount: new Decimal(0), repayFundingAmount: absRepay };
  const fundingScale = absRepay.gt(0) ? repayFundingAmount.div(absRepay) : new Decimal(1);

  const withdrawAmountWithSlippageAndFlashLoanFee = Decimal.abs(adjustDepositPosition)
    .mul(new Decimal(1).plus(flashLoanFee))
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
}): DepositLeverageDebtFlashCalcsResult => {
  const {
    depositAmount,
    depositTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee,
  } = props;
  const slippage = slippagePct.div('100');
  const initDepositInSol = depositTokenIsSol ? depositAmount : new Decimal(0);

  assertPositiveFiniteDecimal('depositLeverageCalcsDebtFlash: priceDebtToColl', priceDebtToColl);

  if (depositTokenIsCollToken) {
    // User deposits coll. We flash borrow debt, swap to coll, deposit all, borrow debt to repay flash.
    //
    // Definitions:
    //   collTotal      = depositAmount + flashBorrowDebt * priceDebtToColl / (1 + slippage)
    //   debtToBorrow   = flashBorrowDebt * (1 + flashLoanFee)
    //   leverage       = collTotal / (collTotal - debtToBorrow * priceDebtToColl)
    //
    // Solving for flashBorrowDebt:
    //   flashBorrowDebt = depositAmount * (leverage - 1)
    //                     / (priceDebtToColl * (leverage * (1 + flashLoanFee) - (leverage - 1) / (1 + slippage)))
    const slippageFactor = slippage.add('1');
    const flashFeeFactor = flashLoanFee.add('1');

    const denominator = priceDebtToColl.mul(
      targetLeverage.mul(flashFeeFactor).sub(targetLeverage.sub('1').div(slippageFactor))
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
    //   leverage       = collTotal / (collTotal - debtToBorrow * priceDebtToColl)
    //
    // Solving for flashBorrowDebt:
    //   flashBorrowDebt = depositAmount * (leverage - 1)
    //                     / ((1 + slippage) * leverage * (1 + flashLoanFee) - (leverage - 1))
    const slippageFactor = slippage.add('1');
    const flashFeeFactor = flashLoanFee.add('1');

    const denominator = slippageFactor.mul(targetLeverage).mul(flashFeeFactor).sub(targetLeverage.sub('1'));
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
 */
export function withdrawLeverageCalcsCollFlash(
  market: KaminoMarket,
  collReserve: KaminoReserve,
  debtReserve: KaminoReserve,
  priceCollToDebt: Decimal,
  withdrawAmount: Decimal,
  deposited: Decimal,
  borrowed: Decimal,
  currentSlotOrLedgerInstant: Slot | LedgerInstant,
  isClosingPosition: boolean,
  selectedTokenIsCollToken: boolean,
  selectedTokenMint: Address,
  obligation: KaminoObligation,
  flashLoanFee: Decimal,
  slippagePct: Decimal,
  currentLedgerInstant?: LedgerInstant
): WithdrawLeverageCollFlashCalcsResult {
  const { currentSlot, currentLedgerInstant: normalizedLedgerInstant } = normalizeLedgerInstantArgument(
    currentSlotOrLedgerInstant,
    currentLedgerInstant,
    'withdrawLeverageCalcsCollFlash'
  );
  // 1. Calculate proportional withdraw/repay amounts (same as existing)
  const { adjustDepositPosition: withdrawAmountCalculated, adjustBorrowPosition: initialRepayAmount } =
    isClosingPosition
      ? { adjustDepositPosition: deposited, adjustBorrowPosition: borrowed }
      : calcWithdrawAmounts({
          collTokenMint: collReserve.getLiquidityMint(),
          priceCollToDebt: new Decimal(priceCollToDebt),
          currentDepositPosition: deposited,
          currentBorrowPosition: borrowed,
          withdrawAmount: new Decimal(withdrawAmount),
          selectedTokenMint: selectedTokenMint,
        });

  // 2. Add IR slippage to repay amount
  const irSlippageBpsForDebt = obligation!
    .estimateObligationInterestRate(market, debtReserve!, obligation?.state.borrows[0]!, currentSlot)
    .toDecimalPlaces(debtReserve?.getMintDecimals()!, Decimal.ROUND_CEIL);
  const repayAmount = initialRepayAmount
    .mul(irSlippageBpsForDebt.add('0.1').div('10_000').add('1'))
    .toDecimalPlaces(debtReserve?.getMintDecimals()!, Decimal.ROUND_CEIL);

  // Fixed-term debt charges an early-repay penalty on top of the repay; the coll→debt swap must produce
  // repayAmount + penalty so the on-chain repay debit succeeds. The repay instruction amount stays the principal.
  const { earlyRepayPenaltyAmount, repayFundingAmount } = leverageEarlyRepayPenalty(
    obligation,
    debtReserve,
    repayAmount,
    currentSlot,
    normalizedLedgerInstant
  );

  // 3. Calculate how much coll to flash borrow for the swap
  // When withdrawing coll: swap just enough coll->debt to cover the repayment (incl. penalty)
  // When withdrawing debt: swap all withdrawn coll to debt; user keeps surplus debt after repay
  assertPositiveFiniteDecimal('withdrawLeverageCalcsCollFlash: priceCollToDebt', priceCollToDebt);
  const swapAmountIfWithdrawingColl = repayFundingAmount
    .mul(new Decimal(1).add(slippagePct.div(100)))
    .div(priceCollToDebt);
  const swapAmountIfWithdrawingDebt = withdrawAmountCalculated;
  const collTokenSwapIn = selectedTokenIsCollToken ? swapAmountIfWithdrawingColl : swapAmountIfWithdrawingDebt;
  const debtTokenExpectedSwapOut = collTokenSwapIn.mul(priceCollToDebt).div(new Decimal(1).add(slippagePct.div(100)));

  // 4. Flash borrow amount = the EXACT collateral the swap spends (`collTokenSwapIn`), matching the lending-side
  // repay-with-coll pattern (`calcRepayWithCollCollFlashSwap`). The on-chain flash repay charges its fee on the borrowed
  // `liquidity_amount` (handler_flash_repay_reserve_liquidity / lending_operations::flash_repay_reserve_liquidity), so
  // the OLD `collSwapIn*(1+fee)` borrow made the SC compute fee on the inflated amount (an O(fee²) overage). Borrowing
  // exactly the spend keeps the flash fee `= fee(collSwapIn)`, funded by the withdraw leg below.
  const flashBorrowInCollToken = collTokenSwapIn;

  // 5. Collateral to withdraw from the obligation (token-domain base, WITHOUT the flash fee). The build/selector layers
  //    add `flashRepayDebit − flashBorrow = fee(collSwapIn)` lamports on top via the shared `calcFlashLoanFees` helper
  //    (so the 1-lamport minimum fee and the referrer split are honoured exactly as the SC computes them). Balance at
  //    flash-repay: ATA = flashBorrow − collSwapIn + (withdraw + fee) = withdraw + fee ≥ flashBorrow + fee = SC debit,
  //    and the user nets `withdraw − collSwapIn = withdrawAmountCalculated − collSwapIn`, identical to the fee==0 case.
  //    (For close position the build function passes U64_MAX, so this value is unused.)
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
  currentSlotOrLedgerInstant?: Slot | LedgerInstant,
  currentLedgerInstant?: LedgerInstant
): AdjustWithdrawCollFlashCalcsResult {
  const absDebtRepay = Decimal.abs(adjustBorrowPosition);
  const normalizedLedger =
    currentSlotOrLedgerInstant === undefined
      ? undefined
      : normalizeLedgerInstantArgument(
          currentSlotOrLedgerInstant,
          currentLedgerInstant,
          'adjustWithdrawLeverageCalcsCollFlash'
        );

  // Fixed-term debt charges an early-repay penalty on top of the repay; the coll→debt swap must produce
  // principal + penalty so the repay debit succeeds. The repay instruction amount stays the principal, and the extra
  // collateral needed is scaled proportionally (funding/principal). Open-term debt → penalty 0 → unchanged behaviour.
  const { earlyRepayPenaltyAmount, repayFundingAmount } =
    obligation && debtReserve && normalizedLedger !== undefined
      ? leverageEarlyRepayPenalty(
          obligation,
          debtReserve,
          absDebtRepay,
          normalizedLedger.currentSlot,
          normalizedLedger.currentLedgerInstant
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
