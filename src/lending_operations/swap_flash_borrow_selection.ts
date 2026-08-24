import Decimal from 'decimal.js';
import { KaminoMarket, KaminoObligation, KaminoReserve } from '../classes';
import { FeeCalculation } from '../classes/shared';
import { Address } from '@solana/kit';
import { isFlashLoanEnabled } from '../leverage/utils';
import { SwapCollFlashBorrowToken } from './swap_collateral_operations';
import { SwapDebtFlashBorrowToken } from './swap_debt_operations';
import { assertPositiveFiniteDecimal, getSlippageFactor } from './swap_calcs';
import { resolveSourceDebtRepayLamports } from './swap_debt_sizing';
import { LedgerInstant } from '../utils/ledger';

export type SwapCollLiquidityFlashBorrowToken = Extract<SwapCollFlashBorrowToken, 'sourceColl' | 'targetColl'>;

export interface DetermineSwapCollateralFlashBorrowTypeInputs {
  kaminoMarket: KaminoMarket;
  obligation: KaminoObligation;
  sourceCollReserveAddress: Address;
  targetCollReserveAddress: Address;
  /**
   * Amount of source collateral to swap, in source-collateral token units.
   */
  amount: Decimal;
  /**
   * Price of one source collateral token denominated in target collateral tokens.
   */
  priceSourceToTarget: Decimal;
  /**
   * Slippage percentage (e.g. `0.5` for 0.5%). Required.
   */
  slippagePct: Decimal;
}

export interface DetermineSwapDebtFlashBorrowTypeInputs {
  kaminoMarket: KaminoMarket;
  obligation: KaminoObligation;
  sourceDebtReserveAddress: Address;
  targetDebtReserveAddress: Address;
  /**
   * Amount of source debt to repay/replace, in source-debt token units. Ignored when `isClosingSourceDebt === true`
   * (the actual flow sizes around the full outstanding source-debt position instead).
   */
  amount: Decimal;
  /**
   * If true, the picker sizes liquidity around the obligation's current source-debt position (matching the close
   * path inside `getSwapDebtIxs`), instead of `amount`. Avoids picking a side that lacks liquidity for the
   * close-sized loan.
   */
  isClosingSourceDebt?: boolean;
  /**
   * Price of one source debt token denominated in target debt tokens.
   */
  priceSourceToTarget: Decimal;
  /**
   * Slippage percentage (e.g. `0.5` for 0.5%). Required.
   */
  slippagePct: Decimal;
  /** The ledger instant (slot + block time) the repay sizing is estimated at. */
  currentLedgerInstant: LedgerInstant;
}

export type DetermineSwapDebtFlashBorrowTypeParams = DetermineSwapDebtFlashBorrowTypeInputs;

export interface ChooseSwapDebtFlashBorrowTokenInputs {
  sourceDebtReserve: KaminoReserve;
  targetDebtReserve: KaminoReserve;
}

export interface ChooseSwapCollFlashBorrowTokenInputs {
  sourceCollReserve: KaminoReserve;
  targetCollReserve: KaminoReserve;
}

/**
 * Chooses the swap-debt flash-borrow side with the larger available liquidity value.
 *
 * Ties resolve to `targetDebt`, preserving the previous/default route preference.
 */
export function chooseSwapDebtFlashBorrowTokenByLiquidity(
  inputs: ChooseSwapDebtFlashBorrowTokenInputs
): SwapDebtFlashBorrowToken {
  return hasAtLeastAsMuchAvailableLiquidityValue(inputs.targetDebtReserve, inputs.sourceDebtReserve)
    ? 'targetDebt'
    : 'sourceDebt';
}

/**
 * Chooses the swap-collateral flash-borrow side with the larger available liquidity value.
 *
 * Ties resolve to `targetColl`, preserving the previous/default route preference.
 */
export function chooseSwapCollFlashBorrowTokenByLiquidity(
  inputs: ChooseSwapCollFlashBorrowTokenInputs
): SwapCollLiquidityFlashBorrowToken {
  return hasAtLeastAsMuchAvailableLiquidityValue(inputs.targetCollReserve, inputs.sourceCollReserve)
    ? 'targetColl'
    : 'sourceColl';
}

/**
 * Determines which collateral side a swap-collateral caller should flash borrow when the FE only describes intent.
 *
 * The helper resolves reserves, mirrors the swap-collateral builder's lamport sizing, and delegates the final reserve
 * checks to `determineFlashBorrowType`: flash loans must be enabled and the reserve must have enough liquidity. When
 * both sides are viable it prefers `targetColl`, preserving the operation's default route.
 *
 * Throws when neither source nor target collateral can satisfy the required flash-borrow amount.
 */
export function determineSwapCollateralFlashBorrowType(
  props: DetermineSwapCollateralFlashBorrowTypeInputs
): SwapCollLiquidityFlashBorrowToken {
  const sourceCollReserve = props.kaminoMarket.getExistingReserveByAddress(
    props.sourceCollReserveAddress,
    'Source collateral'
  );
  const targetCollReserve = props.kaminoMarket.getExistingReserveByAddress(
    props.targetCollReserveAddress,
    'Target collateral'
  );
  if (sourceCollReserve.address === targetCollReserve.address) {
    throw new Error('Cannot swap from/to the same collateral');
  }
  if (props.amount.lte(0)) {
    throw new Error('amount must be positive');
  }
  assertPositiveFiniteDecimal('determineSwapCollateralFlashBorrowType: priceSourceToTarget', props.priceSourceToTarget);

  const slippageFactor = getSlippageFactor(props.slippagePct);
  const targetCollFlashRepayAmount = props.amount.mul(props.priceSourceToTarget).mul(slippageFactor);
  const targetCollFlashRepayLamports = targetCollFlashRepayAmount.mul(targetCollReserve.getMintFactor());
  const requiredTargetCollLamports = calculateInclusiveFlashBorrowLamports(
    props.kaminoMarket,
    targetCollReserve,
    targetCollFlashRepayLamports
  );

  const sourceCollFlashRepayLamports = props.amount.mul(sourceCollReserve.getMintFactor()).floor();
  const requiredSourceCollLamports = calculateInclusiveFlashBorrowLamports(
    props.kaminoMarket,
    sourceCollReserve,
    sourceCollFlashRepayLamports
  );

  try {
    return pickFlashBorrowSide({
      primary: { reserve: targetCollReserve, requiredLamports: requiredTargetCollLamports, label: 'targetColl' },
      secondary: { reserve: sourceCollReserve, requiredLamports: requiredSourceCollLamports, label: 'sourceColl' },
    });
  } catch (e) {
    throw new Error(`Unable to determine swap-collateral flash-borrow token: ${getErrorMessage(e)}`);
  }
}

/**
 * Determines which debt side a swap-debt caller should flash borrow when the FE only describes intent.
 *
 * The helper resolves reserves, mirrors the swap-debt builder's lamport sizing, and delegates the final reserve checks
 * to `pickFlashBorrowSide`: flash loans must be enabled and the reserve must have enough liquidity. When both
 * sides are viable it prefers `targetDebt`, preserving the operation's default route.
 *
 * Throws when neither source nor target debt can satisfy the required flash-borrow amount.
 */
export function determineSwapDebtFlashBorrowType(
  props: DetermineSwapDebtFlashBorrowTypeParams
): SwapDebtFlashBorrowToken {
  const sourceDebtReserve = props.kaminoMarket.getExistingReserveByAddress(
    props.sourceDebtReserveAddress,
    'Source debt'
  );
  const targetDebtReserve = props.kaminoMarket.getExistingReserveByAddress(
    props.targetDebtReserveAddress,
    'Target debt'
  );
  if (sourceDebtReserve.address === targetDebtReserve.address) {
    throw new Error('Cannot swap from/to the same debt');
  }
  // A full close ignores `amount` entirely (the repay is sized from the full outstanding + interest buffer), matching
  // `getSwapDebtIxs` / `extractArgsAndContext`, where a close can be previewed AND built with `amount = 0`. Only reject
  // a non-positive amount for a PARTIAL swap, where it is the actual repay size.
  if (!props.isClosingSourceDebt && props.amount.lte(0)) {
    throw new Error('amount must be positive');
  }
  assertPositiveFiniteDecimal('determineSwapDebtFlashBorrowType: priceSourceToTarget', props.priceSourceToTarget);
  const currentLedgerInstant = props.currentLedgerInstant;

  // When closing the source debt, the actual flow in `getSwapDebtIxs` ignores `amount` and sizes the flash loan /
  // external swap around the full outstanding position (plus IR/buffer). Reuse the builder's canonical sizing
  // (`resolveSourceDebtRepayLamports`) so the picker checks liquidity against the exact close-sized loan the build
  // flow will request, and cannot drift from it.
  const sourceDebtRepayLamports = resolveSourceDebtRepayLamports({
    market: props.kaminoMarket,
    obligation: props.obligation,
    sourceDebtReserve,
    isClosingSourceDebt: props.isClosingSourceDebt ?? false,
    sourceDebtSwapAmount: props.amount,
    currentLedgerInstant,
  });
  // Fixed-term source debt is debited `principal + early-repay penalty` on-chain, so the build flow funds the penalty
  // too (flash-borrowed directly on the sourceDebt side, or swapped for on the targetDebt side). Size both candidates
  // against that funding so a reserve that covers only the principal — but not the penalty — is not greenlit. Open-term
  // / variable source debt → penalty 0 → funding equals the principal (unchanged behaviour).
  const sourceFundingLamports = sourceDebtReserve.getKind().isFixedRate()
    ? props.obligation.calculateEarlyRepayFunding(sourceDebtReserve, sourceDebtRepayLamports, currentLedgerInstant)
        .fundingLamports
    : sourceDebtRepayLamports;
  const slippageFactor = getSlippageFactor(props.slippagePct);
  const requiredTargetDebtLamports = sourceFundingLamports
    .div(sourceDebtReserve.getMintFactor())
    .mul(props.priceSourceToTarget)
    .div(slippageFactor)
    .mul(targetDebtReserve.getMintFactor())
    .ceil();

  try {
    return pickFlashBorrowSide({
      primary: { reserve: targetDebtReserve, requiredLamports: requiredTargetDebtLamports, label: 'targetDebt' },
      secondary: { reserve: sourceDebtReserve, requiredLamports: sourceFundingLamports, label: 'sourceDebt' },
    });
  } catch (e) {
    throw new Error(`Unable to determine swap-debt flash-borrow token: ${getErrorMessage(e)}`);
  }
}

interface FlashBorrowSideCandidate<L extends string> {
  reserve: KaminoReserve;
  requiredLamports: Decimal;
  label: L;
}

/**
 * Chooses between two candidate flash-borrow sides. Returns the `primary` label when both sides are viable
 * (preserving caller-defined default routing); otherwise returns whichever side is viable. Throws when neither is.
 */
function pickFlashBorrowSide<P extends string, S extends string>(opts: {
  primary: FlashBorrowSideCandidate<P>;
  secondary: FlashBorrowSideCandidate<S>;
}): P | S {
  const primaryViable = isSideViable(opts.primary);
  const secondaryViable = isSideViable(opts.secondary);

  if (primaryViable) return opts.primary.label;
  if (secondaryViable) return opts.secondary.label;

  throw new Error(
    `Neither side supports flash borrowing the required amount. ` +
      describeSide(opts.primary) +
      ' ' +
      describeSide(opts.secondary)
  );
}

function isSideViable<L extends string>(side: FlashBorrowSideCandidate<L>): boolean {
  return isFlashLoanEnabled(side.reserve) && side.reserve.getLiquidityAvailableAmount().gte(side.requiredLamports);
}

function describeSide<L extends string>(side: FlashBorrowSideCandidate<L>): string {
  return `${side.label}: enabled=${isFlashLoanEnabled(
    side.reserve
  )}, available=${side.reserve.getLiquidityAvailableAmount()}, required=${side.requiredLamports}.`;
}

function hasAtLeastAsMuchAvailableLiquidityValue(left: KaminoReserve, right: KaminoReserve): boolean {
  return getAvailableLiquidityValue(left).gte(getAvailableLiquidityValue(right));
}

function getAvailableLiquidityValue(reserve: KaminoReserve): Decimal {
  return reserve.getLiquidityAvailableAmount().div(reserve.getMintFactor()).mul(reserve.getOracleMarketPrice());
}

function calculateInclusiveFlashBorrowLamports(
  kaminoMarket: KaminoMarket,
  reserve: KaminoReserve,
  flashRepayLamports: Decimal
): Decimal {
  const { protocolFees, referrerFees } = reserve.calculateFees(
    flashRepayLamports,
    reserve.getFlashLoanFee(),
    FeeCalculation.Inclusive,
    kaminoMarket.state.referralFeeBps,
    false
  );
  return flashRepayLamports.sub(protocolFees).sub(referrerFees).floor();
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
