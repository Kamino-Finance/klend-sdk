import Decimal from 'decimal.js';

/**
 * # Redeem-drift protection
 *
 * Several composed flows (repay-with-collateral, withdraw-with-leverage, the multiply debt-swap
 * migration) fund an **exact-amount pull** — a swap exact-in, a flash repay, or a re-deposit —
 * from the output of a `WithdrawObligationCollateralAndRedeemReserveCollateral` instruction.
 *
 * The withdraw is sized off-chain in **liquidity lamports** and converted to a cToken amount via
 * `KaminoReserve.getEstimatedCollateralExchangeRate()` (CEIL'd, see
 * `KaminoAction.getWithdrawCollateralAmount`). On-chain, the program refreshes the reserve and
 * redeems `floor(cTokens / actualExchangeRate)` at the **execution slot's** rate. The estimate
 * (`approximateCompoundedInterest` projected to the quote slot) and the on-chain rate diverge as
 * slots pass and interest accrues, in **either direction** — so the redeem can pay out slightly
 * less liquidity than the off-chain sizing assumed. Observed in production: a 293,566,737,462
 * lamport (wSOL) withdraw redeemed only 293,566,733,935 — 3,527 lamports short, ~1.2e-8 relative,
 * with the transaction landing 36 slots after the quote. Any exact-in swap (or flash repay /
 * re-deposit) sized to the requested amount then pulls more than the ATA holds and the whole
 * transaction fails with SPL Token error 1 (insufficient funds).
 *
 * The CEIL in the off-chain liquidity→cToken conversion only guarantees the redeem covers the
 * request *at the estimated rate* — it cannot protect against the estimated-vs-actual rate drift.
 * (`WITHDRAW_SLOT_OFFSET` in `leverage/operations.ts` mitigates the same drift for the adjust
 * path by biasing the estimate to an older slot; the helpers here are the equivalent protection
 * for flows that size the withdraw and the pull from the same number.)
 *
 * Two complementary helpers:
 * - {@link bufferWithdrawForRedeemDrift}: withdraw a hair **more** than the pull, so the
 *   floor-rounded redeem still covers it. Used when the withdraw amount can grow (the surplus is
 *   dust that stays in the user's ATA).
 * - {@link haircutPullForRedeemDrift}: pull a hair **less** than the estimated redeem output.
 *   Used when the withdraw cannot grow (e.g. it is already `U64_MAX` and the pull was sized from
 *   an off-chain estimate of the full balance).
 *
 * The factor is 1e-6 — ~80x the worst drift observed in production (~40x effective, since
 * lamport-level floor/ceil rounding consumes part of the margin), while costing the user at most
 * 1 ppm of the moved amount (which lands in their own wallet, not anywhere else).
 */
export const REDEEM_DRIFT_FACTOR = new Decimal('0.000001');

const BUFFER_FACTOR = new Decimal(1).add(REDEEM_DRIFT_FACTOR);
const HAIRCUT_FACTOR = new Decimal(1).sub(REDEEM_DRIFT_FACTOR);

/**
 * Buffers a withdraw amount (liquidity lamports) so the on-chain floor-rounded redeem always
 * covers an exact-amount pull of `withdrawLamports`, despite estimated-vs-actual collateral
 * exchange-rate drift between sizing and execution.
 *
 * @param withdrawLamports - the exact pull the redeem must fund (liquidity lamports); the
 *   unbuffered withdraw amount
 * @param maxWithdrawLamports - optional cap (e.g. the LTV-checked max withdraw). The caller must
 *   ensure `withdrawLamports <= maxWithdrawLamports` (the existing flow guards do); under that
 *   invariant the clamped result is always `>= withdrawLamports`.
 * @returns an integer lamport amount in `[withdrawLamports, ceil(withdrawLamports * (1 + 1e-6))]`,
 *   or `maxWithdrawLamports` when the buffered amount would exceed it
 */
export function bufferWithdrawForRedeemDrift(withdrawLamports: Decimal, maxWithdrawLamports?: Decimal): Decimal {
  const buffered = withdrawLamports.mul(BUFFER_FACTOR).ceil();
  return maxWithdrawLamports !== undefined ? Decimal.min(buffered, maxWithdrawLamports) : buffered;
}

/**
 * Haircuts an exact-amount pull (swap exact-in / re-deposit, in lamports) that is funded by a
 * redeem whose output was only *estimated* off-chain — e.g. a `U64_MAX` withdraw redeeming the
 * actual position balance while the pull was sized from the off-chain estimate of it. The
 * haircut keeps the pull below the realized redeem output despite estimate drift.
 *
 * Callers must tolerate pulling up to 1 ppm less than estimated — e.g. a swap whose
 * `minOutAmountLamports` carries a slippage margin far wider than 1e-6, or a deposit where 1 ppm
 * less collateral is health-negligible.
 *
 * @returns an integer lamport amount in `[floor(pullLamports * (1 - 1e-6)), pullLamports]`
 */
export function haircutPullForRedeemDrift(pullLamports: Decimal): Decimal {
  return pullLamports.mul(HAIRCUT_FACTOR).floor();
}

// Matches `U64_MAX` from `../utils/constants` — duplicated here to keep this module a
// dependency-free leaf (it must stay importable from anywhere without forming cycles).
const U64_MAX_STRING = '18446744073709551615';

/**
 * Sizes an exact pull (swap exact-in / flash repay, in lamports) funded by a withdraw's redeem:
 * haircut when the position is closing (the U64_MAX withdraw redeems the *actual* balance while
 * the pull was sized from an off-chain estimate of it), plain floor otherwise (the buffered
 * withdraw provides the margin instead — see {@link redeemWithdrawAmount}).
 *
 * This is the single definition of the closing-vs-non-closing sizing policy; call sites should
 * use it (or {@link redeemWithdrawAmount} for the withdraw side) rather than re-deriving the
 * ternary.
 */
export function sizeRedeemFundedPull(pullLamports: Decimal, isClosing: boolean): Decimal {
  return isClosing ? haircutPullForRedeemDrift(pullLamports) : pullLamports.floor();
}

/**
 * Sizes the withdraw (as the builder-ready amount string) that funds an exact pull: `U64_MAX`
 * when closing (withdraw everything; the pull is haircut instead — see
 * {@link sizeRedeemFundedPull}), buffered otherwise so the floor-rounded redeem covers the
 * unbuffered pull.
 *
 * @param maxWithdrawLamports - optional cap, forwarded to {@link bufferWithdrawForRedeemDrift}
 */
export function redeemWithdrawAmount(pullLamports: Decimal, isClosing: boolean, maxWithdrawLamports?: Decimal): string {
  return isClosing ? U64_MAX_STRING : bufferWithdrawForRedeemDrift(pullLamports, maxWithdrawLamports).toFixed(0);
}
