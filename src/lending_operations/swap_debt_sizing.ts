import Decimal from 'decimal.js';
import { Slot } from '@solana/kit';
import { KaminoMarket, KaminoObligation, KaminoReserve } from '../classes';
import { LedgerInstant, requireMatchingLedgerInstant } from '../utils/ledger';

// Leaf module (imports only classes/kit/decimal) so both `swap_debt_operations` and
// `swap_flash_borrow_selection` can share the repay sizing without a runtime import cycle
// (the two import each other; sizing used to live inside `swap_debt_operations`).

/**
 * Single source of truth for the old-debt repay sizing, shared by the debt-swap flows, the flash-borrow-side
 * selector and the FE preview so the previewed, selected and executed repay amounts always agree. Takes explicit
 * fields (rather than the internal args/context) so the preview, which has no full `SwapDebtContext`, can call it
 * directly.
 *
 * - Full close (`isClosingSourceDebt`): the full outstanding source debt, grown by estimated interest accrual plus a
 *   small safety buffer so the amount covers the actual debt that exists at the moment of the on-chain repay.
 * - Partial: exactly `sourceDebtSwapAmount` in **token units** (converted to lamports via the reserve mint factor).
 *   The on-chain repay is capped at the outstanding amount, and the caller is validated against the outstanding
 *   debt in `extractArgsAndContext`.
 */
export function resolveSourceDebtRepayLamports(params: {
  market: KaminoMarket;
  obligation: KaminoObligation;
  sourceDebtReserve: KaminoReserve;
  isClosingSourceDebt: boolean;
  /** Partial-close size in source-debt **token units** (not lamports). Ignored when `isClosingSourceDebt`. */
  sourceDebtSwapAmount: Decimal;
  currentSlot: Slot;
}): Decimal {
  const { market, obligation, sourceDebtReserve, isClosingSourceDebt, sourceDebtSwapAmount, currentSlot } = params;
  if (isClosingSourceDebt) {
    const debtLiquidity = obligation.state.borrows.find((b) => b.borrowReserve === sourceDebtReserve.address)!;
    const irRatio = obligation
      .estimateObligationInterestRate(market, sourceDebtReserve, debtLiquidity, currentSlot)
      .toDecimalPlaces(sourceDebtReserve.state.liquidity.mintDecimals.toNumber(), Decimal.ROUND_CEIL);
    const irMultiplier = irRatio.lte(0) ? new Decimal('1.001') : irRatio.mul(new Decimal('1.001'));
    return obligation
      .getBorrowAmountByReserve(sourceDebtReserve)
      .mul(sourceDebtReserve.getMintFactor())
      .mul(irMultiplier)
      .toDecimalPlaces(0, Decimal.ROUND_CEIL);
  }
  return sourceDebtSwapAmount.mul(sourceDebtReserve.getMintFactor()).ceil();
}

/**
 * Early-repay penalty (in source-debt-reserve lamports) charged on-chain *in addition* to the repay amount when
 * repaying a fixed-term borrow before maturity (`Obligation::calculate_early_repay_penalty`, obligation.rs:993;
 * applied as `repay_amount + penalty` in lending_operations.rs:766). Returns 0 for open-term reserves,
 * untracked/legacy borrows, and matured debt.
 *
 * The penalty is NOT principal: it must inflate only the amount of source debt that the flash loan / external swap
 * must make available (so the repay step's debit of `repay + penalty` succeeds), and must NOT change the
 * repay-instruction `liquidity_amount`, the migration collateral fraction, or any LTV/health projection.
 *
 * `repayPrincipalLamports` is the settled principal the penalty is charged on (the outstanding for a full close, or
 * the partial repay amount). `currentLedgerInstant` pins the interest slot and term-decay timestamp to one ledger
 * snapshot at the same commitment as the loaded reserve and obligation state.
 */
export function resolveSourceDebtEarlyRepayPenaltyLamports(params: {
  obligation: KaminoObligation;
  sourceDebtReserve: KaminoReserve;
  repayPrincipalLamports: Decimal;
  currentSlot: Slot;
  currentLedgerInstant?: LedgerInstant;
}): Decimal {
  const { obligation, sourceDebtReserve, repayPrincipalLamports, currentSlot, currentLedgerInstant } = params;
  // Delegates to the single funding-invariant helper on KaminoObligation (open-term / matured / variable → 0).
  return sourceDebtReserve.getKind().isFixedRate()
    ? obligation.calculateEarlyRepayFunding(
        sourceDebtReserve,
        repayPrincipalLamports,
        requireMatchingLedgerInstant(currentSlot, currentLedgerInstant, 'resolveSourceDebtEarlyRepayPenaltyLamports')
      ).penaltyLamports
    : new Decimal(0);
}
