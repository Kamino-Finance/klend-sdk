import { Fraction } from './fraction';

/** The flavor of a rollover, resolved from the source borrow's config and the source/target reserve kinds. */
export type RolloverMode = 'fixedToFixed' | 'fixedToOpen' | 'openToFixed';

/** Why a rollover is not possible, mirroring the program's rollover preconditions. */
export type RolloverImpossibleReason =
  | 'SourceBorrowNotFound' // the obligation has no borrow in the source reserve
  | 'LiquidityMintMismatch' // target reserve has a different liquidity mint than the source
  | 'SourceReserveNotActive' // the source reserve is obsolete or in emergency mode
  | 'TargetReserveNotActive' // the target reserve is obsolete or in emergency mode
  | 'ObligationInElevationGroup' // rollovers are not supported while in an elevation group
  | 'MarketInEmergencyMode' // the lending market is in emergency mode (the rollover ix's access control)
  | 'BorrowingDisabled' // borrowing is disabled market-wide
  | 'ObligationBorrowingDisabled' // borrowing is disabled on this obligation (outside an elevation group)
  | 'ObligationMarkedForDeleveraging' // the obligation is currently marked for deleveraging
  | 'ObligationHasObsoleteReserves' // the obligation holds a position in an obsolete reserve
  | 'TargetReserveDebtMaturityReached' // the target reserve has passed its debt maturity
  | 'TargetBorrowFactorMismatch' // target reserve's borrow factor differs from the source's
  | 'AutoRolloverNotEnabled' // fixed-term source borrow without auto-rollover opted in
  | 'OpenTermTargetNotAllowed' // open-term target but the borrow did not allow open-term rollover
  | 'MigrationToFixedNotEnabled' // open-term source borrow without migration-to-fixed opted in
  | 'MigrationTargetNotFixedTerm' // migrating an open-term borrow, but the target is not fixed-term
  | 'TargetReserveOpenTermOnly' // borrow config accepts open-term targets only, but the target is fixed-term
  | 'TargetBorrowRateTooHigh' // target reserve's max borrow rate exceeds the borrow config's max
  | 'TargetDebtTermTooShort' // target reserve's debt term is below the borrow config's minimum
  | 'RolloverExecutionDisabled' // the market has the matching rollover execution window/flag disabled
  | 'OutsideRolloverWindow' // the borrow is not yet within its rollover window before term expiry
  | 'RolloverNotApplicable' // the source borrow has no tracked start timestamp, so its term end is unknown
  | 'ExistingTargetBorrowConfigMismatch' // the obligation already borrows the target with a different rollover config
  | 'ExistingTargetBorrowTermNotProlonged' // merging into the existing target borrow would not prolong the debt term
  | 'InsufficientTargetLiquidity' // the target reserve has no borrowable liquidity to roll any of the position over
  | 'PartialRolloverValueTooSmall' // only a partial rollover is possible and its value is below the market minimum
  | 'ObligationBorrowValueExceeded'; // a full rollover's rounding increase would exceed the obligation's remaining borrow value

/**
 * Result of {@link KaminoObligation.checkRolloverPossible}, a best-effort preflight eligibility check.
 *
 * On success, `mode` is the resolved rollover flavor, `isFullRollover` is true when the target reserve can
 * absorb the entire position (false when only a partial rollover fits the target's borrowable liquidity), and
 * `rollableAmount` is the liquidity amount (in the shared mint's lamports) that would actually be rolled over.
 *
 * On failure, `reason` is the first failing precondition. The check covers the program's rollover
 * preconditions (account/mint/reserve status, elevation group, borrow flags, borrow factor, the source
 * borrow's rollover-config opt-in and target rate/term criteria, the rollover execution window and timing,
 * the borrowable-liquidity caps / partial-rollover minimum, the same-reserve liquidity rule, the merge rules
 * for a reserve the obligation already borrows from, and the post-rollover borrow-value headroom).
 *
 * It is preflight, not an exact replica of the program: it reads the SDK's last-loaded reserve/obligation
 * state (the borrowable-liquidity and borrow-value math itself mirrors the on-chain fixed-point arithmetic),
 * and it does NOT evaluate the in-transaction freshness conditions
 * (reserve/obligation refreshed this slot, which the rollover transaction guarantees by refreshing inline),
 * the reserve program version, token-2022 mint extensions, or obligation-order support. The last means a
 * *partial* rollover into a reserve the obligation does not yet borrow adds a second debt, which the program
 * rejects when the obligation has an order requiring a single debt (a debt/collateral price-ratio stop-loss /
 * take-profit, or a single-debt deleverage order); such orders must be cancelled first. Treat `possible: true`
 * as eligible pending execution rather than a guarantee.
 */
export type RolloverPossibility =
  | { possible: true; mode: RolloverMode; isFullRollover: boolean; rollableAmount: Fraction }
  | { possible: false; mode: null; reason: RolloverImpossibleReason };
