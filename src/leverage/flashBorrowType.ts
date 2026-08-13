import type { Address, Option } from '@solana/kit';
import Decimal from 'decimal.js';

import { lamportsToNumberDecimal as fromLamports, type KaminoMarket, type KaminoObligation } from '../classes';
import {
  calcRepayAmountWithSlippage,
  calcRepayWithCollCollFlashSwap,
} from '../lending_operations/repay_with_collateral_calcs';
import { WRAPPED_SOL_MINT } from '../utils';
import { assertPositiveFiniteDecimal } from '../lending_operations/swap_calcs';
import {
  adjustDepositLeverageCalcsDebtFlash,
  adjustWithdrawLeverageCalcsCollFlash,
  calcAdjustAmounts,
  calcCollFlashLegLamports,
  depositLeverageCalcs,
  depositLeverageCalcsDebtFlash,
  withdrawLeverageCalcs,
  withdrawLeverageCalcsCollFlash,
} from './calcs';
import type { FlashBorrowType } from './types';
import { determineFlashBorrowType } from './utils';
import { normalizeLedgerInstantArgument, type LedgerInstantInput } from '../utils/ledger';

/**
 * Intent-level helpers that pick a viable `FlashBorrowType` for each leverage operation.
 *
 * Callers provide only the intent (amounts, target leverage, price); the SDK computes the
 * required-lamport size for each candidate flash side — AND the collateral redeemed in the same tx
 * for ops that have a redeem leg — then runs the `determineFlashBorrowType` viability check (flash
 * loans enabled + the reserve covers flash-borrow + redeem). Coll-flash is preferred when it is
 * genuinely viable; otherwise it falls back to debt-flash.
 *
 * Each helper throws with a diagnostic message if neither side is viable.
 */

/**
 * Picks a viable `FlashBorrowType` for a leveraged DEPOSIT (open / scale-into position).
 *
 *  - debt-flash flash-borrows the loan-side; coll-flash flash-borrows the collateral side.
 *  - Sizes are derived from `depositLeverageCalcs` (coll-flash) and `depositLeverageCalcsDebtFlash`
 *    (debt-flash), both at the requested target leverage and the provided price.
 *  - `selectedTokenMint` follows the operation's "I'm paying X with this token" convention.
 *
 * @throws if neither side is viable.
 */
export function determineDepositLeverageFlashBorrowType(props: {
  kaminoMarket: KaminoMarket;
  collReserveAddress: Address;
  debtReserveAddress: Address;
  /** Amount the user is depositing, in `selectedTokenMint` decimals (NOT lamports). */
  depositAmount: Decimal;
  /** Which token the user is paying with — must equal coll mint or debt mint (or SOL). */
  selectedTokenMint: Address;
  targetLeverage: Decimal;
  /** Price expressed as coll-per-debt, i.e. 1 unit of debt = `priceDebtToColl` units of coll. */
  priceDebtToColl: Decimal;
  /** Swap slippage tolerance, percent (e.g. 0.5 = 0.5%). */
  slippagePct: Decimal;
}): FlashBorrowType {
  const {
    kaminoMarket,
    collReserveAddress,
    debtReserveAddress,
    depositAmount,
    selectedTokenMint,
    targetLeverage,
    slippagePct,
  } = props;
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);

  const collTokenMint = collReserve.getLiquidityMint();
  const [solTokenReserve] = kaminoMarket.getReservesByMint(WRAPPED_SOL_MINT);
  const depositTokenIsCollToken = selectedTokenMint === collTokenMint;
  const depositTokenIsSol = solTokenReserve ? selectedTokenMint === solTokenReserve.getLiquidityMint() : false;

  // Coll-flash sizing.
  const collFlashCalcs = depositLeverageCalcs({
    depositAmount,
    depositTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl: props.priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee: collReserve.getFlashLoanFee(),
  });
  const requiredCollLamports = collFlashCalcs.flashBorrowInCollToken.mul(collReserve.getMintFactor()).ceil();

  // Debt-flash sizing.
  const debtFlashCalcs = depositLeverageCalcsDebtFlash({
    depositAmount,
    depositTokenIsCollToken,
    depositTokenIsSol,
    priceDebtToColl: props.priceDebtToColl,
    targetLeverage,
    slippagePct,
    flashLoanFee: debtReserve.getFlashLoanFee(),
  });
  const requiredDebtLamports = debtFlashCalcs.flashBorrowInDebtToken.mul(debtReserve.getMintFactor()).ceil();

  // A leveraged deposit/open deposits collateral; it never redeems from the collateral reserve.
  return determineFlashBorrowType(collReserve, debtReserve, requiredCollLamports, requiredDebtLamports, new Decimal(0));
}

/**
 * Picks a viable `FlashBorrowType` for a leveraged WITHDRAW (partial unwind or close-position).
 *
 *  - debt-flash flash-borrows the repay amount in debt lamports.
 *  - coll-flash flash-borrows the swap-in amount in coll lamports AND redeems collateral from the
 *    same reserve in the same tx, so coll-flash viability accounts for both legs (flash + redeem).
 *  - Sizes come from `withdrawLeverageCalcs` and `withdrawLeverageCalcsCollFlash`.
 *
 * @throws if neither side is viable.
 */
export function determineWithdrawLeverageFlashBorrowType(
  props: {
    kaminoMarket: KaminoMarket;
    obligation: KaminoObligation;
    collReserveAddress: Address;
    debtReserveAddress: Address;
    /** Withdraw amount in selectedToken decimals — ignored when `isClosingPosition=true`. */
    withdrawAmount: Decimal;
    /** Which token the user wants back — must equal coll mint or debt mint. */
    selectedTokenMint: Address;
    isClosingPosition: boolean;
    /** Price expressed as debt-per-coll. */
    priceCollToDebt: Decimal;
    /** Current obligation deposit (coll lamports decimal). Defaults to obligation's coll position. */
    depositedLamports?: Decimal;
    /** Current obligation borrow (debt lamports decimal). Defaults to obligation's debt position. */
    borrowedLamports?: Decimal;
    slippagePct: Decimal;
  } & LedgerInstantInput
): FlashBorrowType {
  const {
    kaminoMarket,
    obligation,
    collReserveAddress,
    debtReserveAddress,
    withdrawAmount,
    selectedTokenMint,
    isClosingPosition,
    priceCollToDebt,
    currentSlot: suppliedCurrentSlot,
    currentLedgerInstant,
    slippagePct,
  } = props;
  const slotOrInstant = suppliedCurrentSlot ?? currentLedgerInstant;
  if (slotOrInstant === undefined) {
    throw new Error('determineWithdrawLeverageFlashBorrowType: either currentSlot or currentLedgerInstant is required');
  }
  const { currentSlot } = normalizeLedgerInstantArgument(
    slotOrInstant,
    currentLedgerInstant,
    'determineWithdrawLeverageFlashBorrowType'
  );
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);

  const deposited =
    props.depositedLamports !== undefined
      ? fromLamports(props.depositedLamports, collReserve.stats.decimals)
      : fromLamports(
          obligation.getDepositByReserve(collReserveAddress)?.amount ?? new Decimal(0),
          collReserve.stats.decimals
        );
  const borrowed =
    props.borrowedLamports !== undefined
      ? fromLamports(props.borrowedLamports, debtReserve.stats.decimals)
      : fromLamports(
          obligation.getBorrowByReserve(debtReserveAddress)?.amount ?? new Decimal(0),
          debtReserve.stats.decimals
        );

  const selectedTokenIsCollToken = selectedTokenMint === collReserve.getLiquidityMint();

  // Debt-flash: flash borrow = repayAmount.
  const debtFlashCalcs = withdrawLeverageCalcs(
    kaminoMarket,
    collReserve,
    debtReserve,
    priceCollToDebt,
    withdrawAmount,
    deposited,
    borrowed,
    currentSlot,
    isClosingPosition,
    selectedTokenIsCollToken,
    selectedTokenMint,
    obligation,
    debtReserve.getFlashLoanFee(),
    slippagePct,
    currentLedgerInstant
  );
  // Size against the funding amount (principal + fixed-term early-repay penalty): debt-flash borrows the debt the
  // on-chain repay actually debits (`repay + penalty`), matching the build flow. Open-term debt → penalty 0 → funding
  // equals the principal `repayAmount`.
  const requiredDebtLamports = debtFlashCalcs.repayFundingAmount.mul(debtReserve.getMintFactor()).ceil();

  // Coll-flash: flash borrow = flashBorrowInCollToken.
  const collFlashCalcs = withdrawLeverageCalcsCollFlash(
    kaminoMarket,
    collReserve,
    debtReserve,
    priceCollToDebt,
    withdrawAmount,
    deposited,
    borrowed,
    currentSlot,
    isClosingPosition,
    selectedTokenIsCollToken,
    selectedTokenMint,
    obligation,
    collReserve.getFlashLoanFee(),
    slippagePct,
    currentLedgerInstant
  );
  // Coll-flash also redeems collateral from the SAME reserve in the same tx
  // (WithdrawObligationCollateralAndRedeemReserveCollateral), before the flash loan is repaid. On a close that's the
  // entire deposit; on a partial it's the canonical redeem (`depositTokenWithdrawAmount` + the flash fee) from
  // `calcCollFlashLegLamports` — the same sizing the build flow executes. Pass it so a thin collateral reserve that
  // can't cover flash-borrow + redeem falls back to debt-flash instead of self-colliding (6008).
  const collFlashLeg = calcCollFlashLegLamports({
    collReserve,
    flashBorrowCollTokens: collFlashCalcs.flashBorrowInCollToken,
    redeemBaseCollTokens: collFlashCalcs.depositTokenWithdrawAmount,
  });
  const redeemCollLamports = isClosingPosition
    ? deposited.mul(collReserve.getMintFactor()).ceil()
    : collFlashLeg.redeemCollLamports;

  return determineFlashBorrowType(
    collReserve,
    debtReserve,
    collFlashLeg.flashBorrowLamports,
    requiredDebtLamports,
    redeemCollLamports
  );
}

/**
 * Picks a viable `FlashBorrowType` for a leveraged ADJUST (increase or decrease).
 *
 * Auto-detects increase vs decrease from the sign of the position deltas returned by
 * `calcAdjustAmounts`:
 *  - increase (current < target): coll-flash borrows `adjustDepositPosition` coll lamports,
 *    debt-flash borrows `flashBorrowInDebtToken` debt lamports; deposits collateral, so no redeem;
 *  - decrease (current > target): debt-flash borrows |`adjustBorrowPosition`| debt lamports,
 *    coll-flash borrows `flashBorrowInCollToken` coll lamports AND withdraws
 *    `depositTokenWithdrawAmount` coll from the same reserve to repay the flash loan — a redeem leg
 *    the coll-flash viability check accounts for (thin reserve: flash + redeem can self-collide).
 *
 * @throws if neither side is viable, or if `targetLeverage` equals the current leverage exactly
 *   (nothing to adjust — caller should skip the op).
 */
export function determineAdjustLeverageFlashBorrowType(
  props: {
    kaminoMarket: KaminoMarket;
    obligation: KaminoObligation;
    collReserveAddress: Address;
    debtReserveAddress: Address;
    targetLeverage: Decimal;
    /** Price expressed as debt-per-coll. */
    priceCollToDebt: Decimal;
    /** Price expressed as coll-per-debt. */
    priceDebtToColl: Decimal;
    slippagePct: Decimal;
  } & LedgerInstantInput
): FlashBorrowType {
  const {
    kaminoMarket,
    obligation,
    collReserveAddress,
    debtReserveAddress,
    targetLeverage,
    priceCollToDebt,
    currentSlot: suppliedCurrentSlot,
    currentLedgerInstant,
    slippagePct,
  } = props;
  const slotOrInstant = suppliedCurrentSlot ?? currentLedgerInstant;
  if (slotOrInstant === undefined) {
    throw new Error('determineAdjustLeverageFlashBorrowType: either currentSlot or currentLedgerInstant is required');
  }
  const { currentSlot } = normalizeLedgerInstantArgument(
    slotOrInstant,
    currentLedgerInstant,
    'determineAdjustLeverageFlashBorrowType'
  );
  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);

  const deposited = fromLamports(
    obligation.getDepositByReserve(collReserveAddress)?.amount ?? new Decimal(0),
    collReserve.stats.decimals
  );
  const borrowed = fromLamports(
    obligation.getBorrowByReserve(debtReserveAddress)?.amount ?? new Decimal(0),
    debtReserve.stats.decimals
  );

  // Direction is determined by the sign of the position deltas — the flash-loan-fee on this call
  // is a tiny perturbation that won't flip the sign; using the coll fee here is incidental.
  const { adjustDepositPosition, adjustBorrowPosition } = calcAdjustAmounts({
    currentDepositPosition: deposited,
    currentBorrowPosition: borrowed,
    targetLeverage,
    priceCollToDebt,
    flashLoanFee: new Decimal(collReserve.getFlashLoanFee()),
  });
  const isIncrease = adjustDepositPosition.gte(0) && adjustBorrowPosition.gte(0);
  const isDecrease = adjustDepositPosition.lte(0) && adjustBorrowPosition.lte(0);
  if (!isIncrease && !isDecrease) {
    throw new Error(
      'determineAdjustLeverageFlashBorrowType: ambiguous direction (deposit/borrow deltas have opposite signs)'
    );
  }
  if (adjustDepositPosition.isZero() && adjustBorrowPosition.isZero()) {
    throw new Error('determineAdjustLeverageFlashBorrowType: nothing to adjust — current leverage matches target');
  }

  let requiredCollLamports: Decimal;
  let requiredDebtLamports: Decimal;
  // Increase (leverage-up) deposits collateral — no redeem. Decrease (deleverage) coll-flash
  // withdraws collateral from the same reserve to repay the flash loan, so it has a redeem leg.
  let redeemCollLamports = new Decimal(0);

  if (isIncrease) {
    // Coll-flash borrows enough coll to deposit; debt-flash borrows the debt-side calc.
    requiredCollLamports = adjustDepositPosition.mul(collReserve.getMintFactor()).ceil();
    const debtFlashCalcs = adjustDepositLeverageCalcsDebtFlash(
      debtReserve,
      adjustDepositPosition,
      adjustBorrowPosition,
      props.priceDebtToColl,
      debtReserve.getFlashLoanFee(),
      slippagePct
    );
    requiredDebtLamports = debtFlashCalcs.flashBorrowInDebtToken.mul(debtReserve.getMintFactor()).ceil();
  } else {
    // Decrease (deleverage): both sides repay the absolute borrow delta. Fold in the fixed-term early-repay penalty so
    // the selector sizes against the funding amount the build flow uses (`repay + penalty`), not the bare principal —
    // otherwise a reserve that only covers the principal could be wrongly greenlit. The coll-flash calc returns the
    // penalty-inflated `repayFundingAmount` (= |borrow delta| + penalty); for open-term debt the penalty is 0.
    const collFlashCalcs = adjustWithdrawLeverageCalcsCollFlash(
      adjustDepositPosition,
      adjustBorrowPosition,
      priceCollToDebt,
      collReserve.getFlashLoanFee(),
      slippagePct,
      obligation,
      debtReserve,
      currentSlot,
      currentLedgerInstant
    );
    requiredDebtLamports = collFlashCalcs.repayFundingAmount.mul(debtReserve.getMintFactor()).ceil();
    // Canonical coll-flash leg (`calcCollFlashLegLamports`): the same flash-borrow + fee + redeem sizing the build
    // flow executes, so the viability check accounts for the exact redeem leg. fee==0 → unchanged.
    const collFlashLeg = calcCollFlashLegLamports({
      collReserve,
      flashBorrowCollTokens: collFlashCalcs.flashBorrowInCollToken,
      redeemBaseCollTokens: collFlashCalcs.depositTokenWithdrawAmount,
    });
    requiredCollLamports = collFlashLeg.flashBorrowLamports;
    redeemCollLamports = collFlashLeg.redeemCollLamports;
  }

  return determineFlashBorrowType(
    collReserve,
    debtReserve,
    requiredCollLamports,
    requiredDebtLamports,
    redeemCollLamports
  );
}

/**
 * Picks a viable `FlashBorrowType` for a repay-with-collateral op given only the client-level intent
 * (which obligation, which reserves, how much debt to repay, the swap price). The SDK computes
 * the per-side required lamports internally — the caller does NOT need to size the flash borrow.
 *
 * Semantics (matches the build flows):
 *  - debt-flash needs to flash borrow the IR-adjusted debt repay amount in debt lamports;
 *  - coll-flash needs to flash borrow enough coll to swap into that same IR-adjusted repay amount,
 *    then withdraws `collWithdrawForFlashRepayLamports` coll from the reserve to repay the flash loan.
 *
 * Both sides are then validated against `isFlashLoanEnabled(reserve)` and against the reserve's
 * available liquidity by `determineFlashBorrowType` — coll-flash must cover flash-borrow + that
 * redeem leg. Coll-flash is preferred when genuinely viable; otherwise it falls back to debt-flash.
 *
 * @throws if neither reserve supports flash borrowing the required amount.
 */
export function determineRepayWithCollFlashBorrowType(
  props: {
    kaminoMarket: KaminoMarket;
    obligation: KaminoObligation;
    debtReserveAddress: Address;
    collReserveAddress: Address;
    /** Debt-token-denominated repay amount (decimal — not lamports). */
    repayAmount: Decimal;
    /** Price expressed as debt-per-coll, i.e. 1 unit of coll = `priceCollToDebt` units of debt. */
    priceCollToDebt: Decimal;
    /** Swap slippage tolerance for the coll→debt swap, percent (e.g. `0.5` = 0.5%). */
    slippagePct: Decimal;
    referrer: Option<Address>;
  } & LedgerInstantInput
): FlashBorrowType {
  const {
    kaminoMarket,
    obligation,
    debtReserveAddress,
    collReserveAddress,
    repayAmount,
    priceCollToDebt,
    currentSlot: suppliedCurrentSlot,
    currentLedgerInstant,
    referrer,
    slippagePct,
  } = props;
  const slotOrInstant = suppliedCurrentSlot ?? currentLedgerInstant;
  if (slotOrInstant === undefined) {
    throw new Error('determineRepayWithCollFlashBorrowType: either currentSlot or currentLedgerInstant is required');
  }
  const { currentSlot } = normalizeLedgerInstantArgument(
    slotOrInstant,
    currentLedgerInstant,
    'determineRepayWithCollFlashBorrowType'
  );

  const collReserve = kaminoMarket.getExistingReserveByAddress(collReserveAddress);
  const debtReserve = kaminoMarket.getExistingReserveByAddress(debtReserveAddress);

  assertPositiveFiniteDecimal('determineRepayWithCollFlashBorrowType: priceCollToDebt', priceCollToDebt);

  const { repayFundingLamports } = calcRepayAmountWithSlippage(
    kaminoMarket,
    debtReserve,
    currentSlot,
    obligation,
    repayAmount,
    referrer,
    currentLedgerInstant
  );

  // Size against the FUNDING amount (principal + fixed-term early-repay penalty), NOT the bare principal: the on-chain
  // repay debits `repay + penalty`, so the transaction builder flash-borrows / swaps for `repayFundingLamports` (see
  // `repay_with_collateral_operations.ts`). The selector must mirror that or it could greenlight a reserve that only
  // covers the principal but not the penalty. For open-term debt the penalty is 0 → `repayFundingLamports == principal`.
  const requiredDebtLamports = repayFundingLamports;

  // Coll-flash repays the debt by swapping flash-borrowed coll, then withdraws collateral from the
  // same reserve to repay the flash loan — `collWithdrawForFlashRepayLamports` is that redeem leg.
  const { flashBorrowInCollLamports: requiredCollLamports, collWithdrawForFlashRepayLamports } =
    calcRepayWithCollCollFlashSwap({
      repayAmountLamports: repayFundingLamports,
      swapPriceCollToDebt: priceCollToDebt,
      slippagePct,
      collReserve,
      debtMintFactor: debtReserve.getMintFactor(),
    });

  return determineFlashBorrowType(
    collReserve,
    debtReserve,
    requiredCollLamports,
    requiredDebtLamports,
    collWithdrawForFlashRepayLamports
  );
}
