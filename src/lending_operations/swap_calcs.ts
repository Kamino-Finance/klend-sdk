import Decimal from 'decimal.js';
import { KaminoReserve } from '../classes';

/**
 * Expected output details when swapping source collateral into target collateral.
 */
export interface SwapCollExpectedOutput {
  /**
   * Target collateral amount that will be deposited into the obligation, in token units (not lamports).
   */
  expectedTargetCollAmount: Decimal;

  /**
   * Flash-loan fee amount in units of the flash-borrowed token.
   */
  flashLoanFeeAmount: Decimal;

  /**
   * For the 'debt' flash-borrow flow, the net increase in the obligation's debt position vs. the starting
   * outstanding amount, in debt-token units. Includes both the flash-loan fee AND the target debt reserve's
   * origination/borrow fee on the re-borrow (matches `getDebtWithFeesForBorrowAmount` semantics used on-chain).
   * 0 for the coll-side flash-borrow flows.
   */
  additionalDebtFromFee: Decimal;
}

/**
 * Inputs shared by every flow.
 */
interface BaseCalculateSwapCollExpectedOutputInputs {
  sourceCollAmount: Decimal;
  sourceCollReserve: KaminoReserve;
  targetCollReserve: KaminoReserve;
  /**
   * Price of 1 source coll denominated in target coll (e.g. 20 USDC = 1 MSOL → price = 1/20 = 0.05 when source=USDC,
   * target=MSOL).
   */
  priceSourceCollToTargetColl: Decimal;
  slippagePct: Decimal;
}

/**
 * Inputs for the coll-side flash-borrow flows ('targetColl' default, or 'sourceColl').
 */
export interface CalculateSwapCollExpectedOutputInputsCollFlow extends BaseCalculateSwapCollExpectedOutputInputs {
  flashBorrowToken?: 'sourceColl' | 'targetColl';
}

/**
 * Inputs for the 'debt' flash-borrow flow; both `debtReserve` and `outstandingDebtAmount` are required so that the
 * resulting flash-loan fee (paid as additional debt) can be computed.
 */
export interface CalculateSwapCollExpectedOutputInputsDebtFlow extends BaseCalculateSwapCollExpectedOutputInputs {
  flashBorrowToken: 'debt';
  debtReserve: KaminoReserve;
  /**
   * Outstanding debt amount (token units) of the user in the debt reserve. Used to estimate the flash-borrow size
   * (and thus the resulting fee).
   */
  outstandingDebtAmount: Decimal;
}

export type CalculateSwapCollExpectedOutputInputs =
  | CalculateSwapCollExpectedOutputInputsCollFlow
  | CalculateSwapCollExpectedOutputInputsDebtFlow;

/**
 * The slippage retention factor `1 - slippagePct/100` — the fraction of value that survives slippage.
 *
 * Shared by every flash-loan/swap sizing path: as a multiplier when scaling an expected swap output DOWN
 * (e.g. `out = in × price × factor`), and as a divisor when sizing a swap input UP so the worst-case fill
 * still covers the target (`in = target / price / factor`). Guards `0 <= slippagePct < 100` so the factor
 * is always in `(0, 1]` and the divisor can never be zero or negative.
 *
 * NOTE: we deliberately do not cap below 100 here. A pathological-but-in-range buffer (e.g. 99 → a ~100× sizing)
 * fails safe downstream — the inflated borrow is rejected by the reserve liquidity / LTV checks rather than
 * mis-executing — and existing tests intentionally exercise large buffers (the coll-flash "exceeds max
 * withdrawable" path). A hypothetical sub-100 cap (a `MAX_SIZING_BUFFER_PCT` constant) would be a reasonable future
 * ergonomic improvement but would forbid those flows, so it is left to the reserve owner / a follow-up, not here.
 */
export function getSlippageFactor(slippagePct: Decimal): Decimal {
  if (!slippagePct.isFinite() || slippagePct.lt(0) || slippagePct.gte(100)) {
    throw new Error(`slippagePct must be >= 0 and < 100; got ${slippagePct.toString()}`);
  }
  return new Decimal(1).sub(slippagePct.div(100));
}

/**
 * Fail-fast guard for prices (oracle or swap-quote `priceAInB`) that are about to be used as a divisor when sizing a
 * flash loan / swap in lamports. A non-positive or non-finite price (`0`, negative, `NaN`, `Infinity`) would otherwise
 * silently produce `Infinity`/`NaN`/negative lamports — a value the downstream `BN`/`floor`/`ceil` conversions either
 * throw on opaquely or, worse, turn into a malformed on-chain amount. Throwing here surfaces the bad input at the
 * boundary with a clear, intentional message instead. Mirrors the inline check in {@link sizeViaDebtFlashBorrow}.
 *
 * @param name human-readable name of the value (used in the error message).
 * @param value the price (or any quantity) that must be finite and strictly `> 0`.
 * @throws if `value` is not finite or is `<= 0`.
 */
export function assertPositiveFiniteDecimal(name: string, value: Decimal): void {
  if (!value.isFinite() || value.lte(0)) {
    throw new Error(`${name} must be finite and > 0; got ${value.toString()}`);
  }
}

/**
 * Default multiplier applied to the market's minimum-net-value when sizing the debt "dust" the via-debt
 * swap-collateral flow deliberately leaves alive. `> 1` so the surviving position stays clear of the on-chain
 * `(0, min_net_value)` reject band even if the debt price drifts down between build and execution. The dust is
 * re-borrowed within the same flow, so a generous margin costs nothing.
 */
export const VIA_DEBT_DUST_SAFETY_FACTOR = new Decimal(2);

export interface ViaDebtFlashBorrowSizing {
  /** Amount to flash-borrow and repay; leaves `>= dustLamports` of debt alive after the on-chain repay. */
  flashBorrowDebtLamports: Decimal;
  /** Lower bound on the debt lamports deliberately kept alive (its market value clears `min_net_value`). */
  dustLamports: Decimal;
}

/**
 * Sizes the via-debt swap-collateral flash borrow so the deliberately-retained debt "dust" position clears the
 * on-chain post-repay invariant. KLend's `post_repay_obligation_invariants` rejects (NetValueRemainingTooSmall,
 * #6092) a remaining position whose market value lands in the open band `(0, min_net_value_in_obligation)`. The flow
 * repays `flashBorrowDebtLamports` (capped on-chain at the live outstanding) to keep the borrow reserve in the
 * obligation's list, so the leftover must be EITHER zero OR worth `>= min_net_value`.
 *
 * Sizing:
 *  - `dustLamports = max(ceil(min_net_value · mintFactor / price · safetyFactor), 1)` — the debt lamports whose market
 *    value clears the threshold (with margin for price drift), never below one whole lamport.
 *  - `flashBorrow = floor(outstanding) - dustLamports` — THROWS when that is `< 1` (the outstanding debt is too
 *    small to flash-borrow at least 1 lamport while still leaving the dust alive).
 *
 * Because the on-chain repay caps at the live outstanding — interest only GROWS it between build and execution, so it
 * is `>= floor(outstanding)` here — the leftover `= live_outstanding - flashBorrow >= dustLamports`. Flooring the
 * outstanding is what makes this hold: a `ceil(outstanding) - 1` sizing can leave a SUB-LAMPORT leftover whose value
 * falls inside the reject band, a flaky failure that only surfaces once a little interest has accrued.
 *
 * @param outstandingDebtLamports current outstanding debt in lamports (need not be integral).
 * @param minNetValueUsd market minimum net value per position (`KaminoMarket.getMinNetValueObligation()`).
 * @param debtMintFactor `10^decimals` of the debt mint (`KaminoReserve.getMintFactor()`).
 * @param debtPriceUsd debt oracle market price (`KaminoReserve.getOracleMarketPrice()`); must be finite and `> 0`.
 * @param safetyFactor margin on the dust; defaults to {@link VIA_DEBT_DUST_SAFETY_FACTOR}.
 */
export function sizeViaDebtFlashBorrow(params: {
  outstandingDebtLamports: Decimal;
  minNetValueUsd: Decimal;
  debtMintFactor: Decimal;
  debtPriceUsd: Decimal;
  safetyFactor?: Decimal;
}): ViaDebtFlashBorrowSizing {
  const { outstandingDebtLamports, minNetValueUsd, debtMintFactor, debtPriceUsd } = params;
  const safetyFactor = params.safetyFactor ?? VIA_DEBT_DUST_SAFETY_FACTOR;
  if (!debtPriceUsd.isFinite() || debtPriceUsd.lte(0)) {
    throw new Error(`debtPriceUsd must be finite and > 0; got ${debtPriceUsd.toString()}`);
  }
  const minNetValueDebtLamports = minNetValueUsd.mul(debtMintFactor).div(debtPriceUsd);
  const dustLamports = Decimal.max(minNetValueDebtLamports.mul(safetyFactor).ceil(), new Decimal(1));
  const flashBorrowDebtLamports = outstandingDebtLamports.floor().sub(dustLamports);
  if (flashBorrowDebtLamports.lt(1)) {
    // Too small for the via-debt flow: it must flash-borrow >= 1 lamport AND leave >= dustLamports of debt alive so
    // the retained borrow position clears the on-chain post-repay invariant (NetValueRemainingTooSmall, #6092) and
    // keeps the debt reserve in the obligation's borrow list for the re-borrow step. Flooring to 1 (the previous
    // behaviour) would either close the reserve (leftover 0) or leave a sub-dust leftover inside the reject band.
    // Reject upfront so the caller can resize or fall back — matching the removed `calculateViaDebtFlashBorrowLamports`.
    throw new Error(
      `Outstanding debt (${outstandingDebtLamports} lamports) is too small for the via-debt swap-collateral flow ` +
        `while leaving the market minimum debt value (need floor(outstanding) >= ${dustLamports.add(1)} lamports)`
    );
  }
  return { flashBorrowDebtLamports, dustLamports };
}

/**
 * Calculates the expected amount of target collateral that will end up in the obligation after a swap, taking into
 * account the flash-loan fee and slippage. For the 'debt' flash-borrow flow, also reports the (small) additional debt
 * the user will incur as a consequence of the flash-loan fee.
 *
 * Note: this is an estimate only; the actual on-chain result is subject to real DEX slippage.
 */
export function calculateSwapCollExpectedOutput(inputs: CalculateSwapCollExpectedOutputInputs): SwapCollExpectedOutput {
  const { sourceCollAmount, sourceCollReserve, targetCollReserve, priceSourceCollToTargetColl, slippagePct } = inputs;

  if (sourceCollReserve.address === targetCollReserve.address) {
    throw new Error('Cannot swap from/to the same collateral');
  }
  if (sourceCollAmount.lte(0)) {
    throw new Error('sourceCollAmount must be positive');
  }

  const flashBorrowToken = inputs.flashBorrowToken ?? 'targetColl';
  const slippageFactor = getSlippageFactor(slippagePct);
  const grossSwapOutput = sourceCollAmount.mul(priceSourceCollToTargetColl).mul(slippageFactor);

  if (flashBorrowToken === 'targetColl') {
    const flashLoanFeeRate = targetCollReserve.getFlashLoanFee();
    // Inclusive fee: flashRepay = flashBorrow + fee, where fee = flashRepay * rate / (1 + rate).
    const flashLoanFeeAmount = grossSwapOutput.mul(flashLoanFeeRate.div(flashLoanFeeRate.add(1)));
    const expectedTargetCollAmount = grossSwapOutput.sub(flashLoanFeeAmount);
    return {
      expectedTargetCollAmount,
      flashLoanFeeAmount,
      additionalDebtFromFee: new Decimal(0),
    };
  }

  if (flashBorrowToken === 'sourceColl') {
    const flashLoanFeeRate = sourceCollReserve.getFlashLoanFee();
    // Inclusive fee: the requested source collateral amount is withdrawn to repay the flash loan, while only the
    // fee-net flash-borrowed amount is sent to the external swap.
    const flashLoanFeeAmount = sourceCollAmount.mul(flashLoanFeeRate.div(flashLoanFeeRate.add(1)));
    const expectedTargetCollAmount = sourceCollAmount
      .sub(flashLoanFeeAmount)
      .mul(priceSourceCollToTargetColl)
      .mul(slippageFactor);
    return {
      expectedTargetCollAmount,
      flashLoanFeeAmount,
      additionalDebtFromFee: new Decimal(0),
    };
  }

  // 'debt' flash-borrow flow: the input union requires `debtReserve` and `outstandingDebtAmount`.
  const debtInputs = inputs as CalculateSwapCollExpectedOutputInputsDebtFlow;
  if (debtInputs.outstandingDebtAmount.lte(0)) {
    throw new Error(`outstandingDebtAmount must be positive when flashBorrowToken === 'debt'`);
  }
  const flashLoanFeeRate = debtInputs.debtReserve.getFlashLoanFee();
  // Flow on-chain: flash borrow outstanding debt → repay (debt cancels) → ... → re-borrow `flashRepay = outstanding +
  // flashFee` → pay back the flash loan. The re-borrow goes through `borrow_obligation_liquidity` which adds the
  // target reserve's `originationFee` on top, so the obligation's debt actually grows by
  //   newDebt = flashRepay × (1 + originationFee)
  // and the net change vs. the starting outstanding is
  //   additionalDebt = newDebt − outstanding = flashFee + originationFee × flashRepay
  // For reserves with `originationFee === 0` this collapses to just `flashFee` (matches the original behavior).
  const borrowFeeRate = debtInputs.debtReserve.getBorrowFee();
  const flashLoanFeeAmount = debtInputs.outstandingDebtAmount.mul(flashLoanFeeRate);
  const flashRepayAmount = debtInputs.outstandingDebtAmount.add(flashLoanFeeAmount);
  const borrowOriginationFeeAmount = flashRepayAmount.mul(borrowFeeRate);
  const additionalDebtFromFee = flashRepayAmount.add(borrowOriginationFeeAmount).sub(debtInputs.outstandingDebtAmount);
  return {
    expectedTargetCollAmount: grossSwapOutput,
    flashLoanFeeAmount,
    additionalDebtFromFee,
  };
}

/**
 * Expected output details when swapping source debt into target debt.
 */
export interface SwapDebtExpectedOutput {
  /**
   * Target debt amount the obligation will owe after the swap settles, in target-debt token units. Includes the
   * target reserve's borrow/origination fee on top of the receive amount (matching how the on-chain obligation
   * actually grows), so this value mirrors `getDebtWithFeesForBorrowAmount` used by the LTV checks. UIs should
   * surface this number rather than the pre-fee receive amount.
   */
  expectedTargetDebtAmount: Decimal;

  /**
   * Flash-loan fee amount in units of the flash-borrowed token.
   */
  flashLoanFeeAmount: Decimal;

  /**
   * Origination fee applied by the target debt reserve on top of the borrow receive amount, in target-debt token
   * units. Zero for reserves with `originationFeeSf === 0`. Included inside `expectedTargetDebtAmount`.
   */
  borrowOriginationFeeAmount: Decimal;
}

export interface CalculateSwapDebtExpectedOutputInputs {
  sourceDebtSwapAmount: Decimal;
  sourceDebtReserve: KaminoReserve;
  targetDebtReserve: KaminoReserve;
  flashBorrowToken: 'sourceDebt' | 'targetDebt';
  /**
   * Price of 1 source debt denominated in target debt.
   */
  priceSourceDebtToTargetDebt: Decimal;
  slippagePct: Decimal;
}

/**
 * Calculates the expected amount of target debt that the obligation will owe after a debt swap, taking into account
 * the flash-loan fee and slippage.
 */
export function calculateSwapDebtExpectedOutput(inputs: CalculateSwapDebtExpectedOutputInputs): SwapDebtExpectedOutput {
  const {
    sourceDebtSwapAmount,
    sourceDebtReserve,
    targetDebtReserve,
    flashBorrowToken,
    priceSourceDebtToTargetDebt,
    slippagePct,
  } = inputs;

  if (sourceDebtReserve.address === targetDebtReserve.address) {
    throw new Error('Cannot swap from/to the same debt');
  }
  if (sourceDebtSwapAmount.lte(0)) {
    throw new Error('sourceDebtSwapAmount must be positive');
  }

  const slippageFactor = getSlippageFactor(slippagePct);
  // The target reserve charges an origination fee on the borrow's *receive amount*; the obligation's debt grows by
  // `receive + originationFee`. Mirror that here so the reported `expectedTargetDebtAmount` matches what the on-chain
  // LTV checks see (`KaminoObligation.getDebtWithFeesForBorrowAmount`).
  const targetBorrowFeeRate = targetDebtReserve.getBorrowFee();

  if (flashBorrowToken === 'targetDebt') {
    const flashLoanFeeRate = targetDebtReserve.getFlashLoanFee();
    // Flash borrow X of targetDebt, swap → sourceDebt. Need swap output ≥ sourceDebtSwapAmount:
    //   X * (1 / priceSourceToTarget) * slippageFactor ≥ sourceDebtSwapAmount
    //   X ≥ sourceDebtSwapAmount * priceSourceToTarget / slippageFactor
    const flashBorrowAmount = sourceDebtSwapAmount.mul(priceSourceDebtToTargetDebt).div(slippageFactor);
    const flashLoanFeeAmount = flashBorrowAmount.mul(flashLoanFeeRate);
    const targetBorrowReceiveAmount = flashBorrowAmount.add(flashLoanFeeAmount);
    const borrowOriginationFeeAmount = targetBorrowReceiveAmount.mul(targetBorrowFeeRate);
    return {
      expectedTargetDebtAmount: targetBorrowReceiveAmount.add(borrowOriginationFeeAmount),
      flashLoanFeeAmount,
      borrowOriginationFeeAmount,
    };
  }

  // flashBorrowToken === 'sourceDebt'
  const flashLoanFeeRate = sourceDebtReserve.getFlashLoanFee();
  // Flash borrow sourceDebtSwapAmount of sourceDebt, repay obligation, borrow Y targetDebt, swap → sourceDebt.
  // Need swap output ≥ flashRepay = sourceDebtSwapAmount * (1 + fee):
  //   Y * (1 / priceSourceToTarget) * slippageFactor ≥ sourceDebtSwapAmount * (1 + fee)
  //   Y ≥ sourceDebtSwapAmount * (1 + fee) * priceSourceToTarget / slippageFactor
  const flashLoanFeeAmount = sourceDebtSwapAmount.mul(flashLoanFeeRate);
  const flashRepayAmount = sourceDebtSwapAmount.add(flashLoanFeeAmount);
  const targetBorrowReceiveAmount = flashRepayAmount.mul(priceSourceDebtToTargetDebt).div(slippageFactor);
  const borrowOriginationFeeAmount = targetBorrowReceiveAmount.mul(targetBorrowFeeRate);
  return {
    expectedTargetDebtAmount: targetBorrowReceiveAmount.add(borrowOriginationFeeAmount),
    flashLoanFeeAmount,
    borrowOriginationFeeAmount,
  };
}
