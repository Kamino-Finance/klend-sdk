export type CustomError =
  | InvalidMarketAuthority
  | InvalidMarketOwner
  | InvalidAccountOwner
  | InvalidAmount
  | InvalidConfig
  | InvalidSigner
  | InvalidAccountInput
  | MathOverflow
  | InsufficientLiquidity
  | ReserveStale
  | WithdrawTooSmall
  | WithdrawTooLarge
  | BorrowTooSmall
  | BorrowTooLarge
  | RepayTooSmall
  | LiquidationTooSmall
  | ObligationHealthy
  | ObligationStale
  | ObligationReserveLimit
  | InvalidObligationOwner
  | ObligationDepositsEmpty
  | ObligationBorrowsEmpty
  | ObligationDepositsZero
  | ObligationBorrowsZero
  | InvalidObligationCollateral
  | InvalidObligationLiquidity
  | ObligationCollateralEmpty
  | ObligationLiquidityEmpty
  | NegativeInterestRate
  | InvalidOracleConfig
  | InsufficientProtocolFeesToRedeem
  | FlashBorrowCpi
  | NoFlashRepayFound
  | InvalidFlashRepay
  | FlashRepayCpi
  | MultipleFlashBorrows
  | FlashLoansDisabled
  | SwitchboardV2Error
  | CouldNotDeserializeScope
  | PriceTooOld
  | PriceTooDivergentFromTwap
  | InvalidTwapPrice
  | GlobalEmergencyMode
  | InvalidFlag
  | PriceNotValid
  | PriceIsBiggerThanHeuristic
  | PriceIsLowerThanHeuristic
  | PriceIsZero
  | PriceConfidenceTooWide
  | IntegerOverflow
  | NoFarmForReserve
  | IncorrectInstructionInPosition
  | NoPriceFound
  | InvalidTwapConfig
  | InvalidPythPriceAccount
  | InvalidSwitchboardAccount
  | InvalidScopePriceAccount
  | ObligationCollateralLtvZero
  | InvalidObligationSeedsValue
  | DeprecatedInvalidObligationId
  | InvalidBorrowRateCurvePoint
  | InvalidUtilizationRate
  | CannotSocializeObligationWithCollateral
  | ObligationEmpty
  | WithdrawalCapReached
  | LastTimestampGreaterThanCurrent
  | LiquidationRewardTooSmall
  | IsolatedAssetTierViolation
  | InconsistentElevationGroup
  | InvalidElevationGroup
  | InvalidElevationGroupConfig
  | UnhealthyElevationGroupLtv
  | ElevationGroupNewLoansDisabled
  | ReserveDeprecated
  | ReferrerAccountNotInitialized
  | ReferrerAccountMintMissmatch
  | ReferrerAccountWrongAddress
  | ReferrerAccountReferrerMissmatch
  | ReferrerAccountMissing
  | InsufficientReferralFeesToRedeem
  | CpiDisabled
  | ShortUrlNotAsciiAlphanumeric
  | ReserveObsolete
  | ElevationGroupAlreadyActivated
  | ObligationInObsoleteReserve
  | ReferrerStateOwnerMismatch
  | UserMetadataOwnerAlreadySet
  | CollateralNonLiquidatable
  | BorrowingDisabled
  | BorrowLimitExceeded
  | DepositLimitExceeded
  | BorrowingDisabledOutsideElevationGroup
  | NetValueRemainingTooSmall
  | WorseLtvBlocked
  | LiabilitiesBiggerThanAssets
  | ReserveTokenBalanceMismatch
  | ReserveVaultBalanceMismatch
  | ReserveAccountingMismatch
  | BorrowingAboveUtilizationRateDisabled
  | LiquidationBorrowFactorPriority
  | LiquidationLowestLiquidationLtvPriority
  | ElevationGroupBorrowLimitExceeded
  | ElevationGroupWithoutDebtReserve
  | ElevationGroupMaxCollateralReserveZero
  | ElevationGroupHasAnotherDebtReserve
  | ElevationGroupDebtReserveAsCollateral
  | ObligationCollateralExceedsElevationGroupLimit
  | ObligationElevationGroupMultipleDebtReserve
  | UnsupportedTokenExtension
  | InvalidTokenAccount
  | DepositDisabledOutsideElevationGroup
  | CannotCalculateReferralAmountDueToSlotsMismatch
  | ObligationOwnersMustMatch
  | ObligationsMustMatch
  | LendingMarketsMustMatch
  | ObligationCurrentlyMarkedForDeleveraging
  | MaximumWithdrawValueZero
  | ZeroMaxLtvAssetsInDeposits
  | LowestLtvAssetsPriority
  | WorseLtvThanUnhealthyLtv
  | FarmAccountsMissing
  | RepayTooSmallForFullLiquidation
  | InsufficientRepayAmount
  | OrderIndexOutOfBounds
  | InvalidOrderConfiguration
  | OrderConfigurationNotSupportedByObligation
  | OperationNotPermittedWithCurrentObligationOrders
  | OperationNotPermittedMarketImmutable
  | OrderCreationDisabled
  | NoUpgradeAuthority

export class InvalidMarketAuthority extends Error {
  static readonly code = 6000
  readonly code = 6000
  readonly name = "InvalidMarketAuthority"
  readonly msg = "Market authority is invalid"

  constructor(readonly logs?: string[]) {
    super("6000: Market authority is invalid")
  }
}

export class InvalidMarketOwner extends Error {
  static readonly code = 6001
  readonly code = 6001
  readonly name = "InvalidMarketOwner"
  readonly msg = "Market owner is invalid"

  constructor(readonly logs?: string[]) {
    super("6001: Market owner is invalid")
  }
}

export class InvalidAccountOwner extends Error {
  static readonly code = 6002
  readonly code = 6002
  readonly name = "InvalidAccountOwner"
  readonly msg = "Input account owner is not the program address"

  constructor(readonly logs?: string[]) {
    super("6002: Input account owner is not the program address")
  }
}

export class InvalidAmount extends Error {
  static readonly code = 6003
  readonly code = 6003
  readonly name = "InvalidAmount"
  readonly msg = "Input amount is invalid"

  constructor(readonly logs?: string[]) {
    super("6003: Input amount is invalid")
  }
}

export class InvalidConfig extends Error {
  static readonly code = 6004
  readonly code = 6004
  readonly name = "InvalidConfig"
  readonly msg = "Input config value is invalid"

  constructor(readonly logs?: string[]) {
    super("6004: Input config value is invalid")
  }
}

export class InvalidSigner extends Error {
  static readonly code = 6005
  readonly code = 6005
  readonly name = "InvalidSigner"
  readonly msg = "Input account must be a signer"

  constructor(readonly logs?: string[]) {
    super("6005: Input account must be a signer")
  }
}

export class InvalidAccountInput extends Error {
  static readonly code = 6006
  readonly code = 6006
  readonly name = "InvalidAccountInput"
  readonly msg = "Invalid account input"

  constructor(readonly logs?: string[]) {
    super("6006: Invalid account input")
  }
}

export class MathOverflow extends Error {
  static readonly code = 6007
  readonly code = 6007
  readonly name = "MathOverflow"
  readonly msg = "Math operation overflow"

  constructor(readonly logs?: string[]) {
    super("6007: Math operation overflow")
  }
}

export class InsufficientLiquidity extends Error {
  static readonly code = 6008
  readonly code = 6008
  readonly name = "InsufficientLiquidity"
  readonly msg = "Insufficient liquidity available"

  constructor(readonly logs?: string[]) {
    super("6008: Insufficient liquidity available")
  }
}

export class ReserveStale extends Error {
  static readonly code = 6009
  readonly code = 6009
  readonly name = "ReserveStale"
  readonly msg = "Reserve state needs to be refreshed"

  constructor(readonly logs?: string[]) {
    super("6009: Reserve state needs to be refreshed")
  }
}

export class WithdrawTooSmall extends Error {
  static readonly code = 6010
  readonly code = 6010
  readonly name = "WithdrawTooSmall"
  readonly msg = "Withdraw amount too small"

  constructor(readonly logs?: string[]) {
    super("6010: Withdraw amount too small")
  }
}

export class WithdrawTooLarge extends Error {
  static readonly code = 6011
  readonly code = 6011
  readonly name = "WithdrawTooLarge"
  readonly msg = "Withdraw amount too large"

  constructor(readonly logs?: string[]) {
    super("6011: Withdraw amount too large")
  }
}

export class BorrowTooSmall extends Error {
  static readonly code = 6012
  readonly code = 6012
  readonly name = "BorrowTooSmall"
  readonly msg = "Borrow amount too small to receive liquidity after fees"

  constructor(readonly logs?: string[]) {
    super("6012: Borrow amount too small to receive liquidity after fees")
  }
}

export class BorrowTooLarge extends Error {
  static readonly code = 6013
  readonly code = 6013
  readonly name = "BorrowTooLarge"
  readonly msg = "Borrow amount too large for deposited collateral"

  constructor(readonly logs?: string[]) {
    super("6013: Borrow amount too large for deposited collateral")
  }
}

export class RepayTooSmall extends Error {
  static readonly code = 6014
  readonly code = 6014
  readonly name = "RepayTooSmall"
  readonly msg = "Repay amount too small to transfer liquidity"

  constructor(readonly logs?: string[]) {
    super("6014: Repay amount too small to transfer liquidity")
  }
}

export class LiquidationTooSmall extends Error {
  static readonly code = 6015
  readonly code = 6015
  readonly name = "LiquidationTooSmall"
  readonly msg = "Liquidation amount too small to receive collateral"

  constructor(readonly logs?: string[]) {
    super("6015: Liquidation amount too small to receive collateral")
  }
}

export class ObligationHealthy extends Error {
  static readonly code = 6016
  readonly code = 6016
  readonly name = "ObligationHealthy"
  readonly msg = "Cannot liquidate healthy obligations"

  constructor(readonly logs?: string[]) {
    super("6016: Cannot liquidate healthy obligations")
  }
}

export class ObligationStale extends Error {
  static readonly code = 6017
  readonly code = 6017
  readonly name = "ObligationStale"
  readonly msg = "Obligation state needs to be refreshed"

  constructor(readonly logs?: string[]) {
    super("6017: Obligation state needs to be refreshed")
  }
}

export class ObligationReserveLimit extends Error {
  static readonly code = 6018
  readonly code = 6018
  readonly name = "ObligationReserveLimit"
  readonly msg = "Obligation reserve limit exceeded"

  constructor(readonly logs?: string[]) {
    super("6018: Obligation reserve limit exceeded")
  }
}

export class InvalidObligationOwner extends Error {
  static readonly code = 6019
  readonly code = 6019
  readonly name = "InvalidObligationOwner"
  readonly msg = "Obligation owner is invalid"

  constructor(readonly logs?: string[]) {
    super("6019: Obligation owner is invalid")
  }
}

export class ObligationDepositsEmpty extends Error {
  static readonly code = 6020
  readonly code = 6020
  readonly name = "ObligationDepositsEmpty"
  readonly msg = "Obligation deposits are empty"

  constructor(readonly logs?: string[]) {
    super("6020: Obligation deposits are empty")
  }
}

export class ObligationBorrowsEmpty extends Error {
  static readonly code = 6021
  readonly code = 6021
  readonly name = "ObligationBorrowsEmpty"
  readonly msg = "Obligation borrows are empty"

  constructor(readonly logs?: string[]) {
    super("6021: Obligation borrows are empty")
  }
}

export class ObligationDepositsZero extends Error {
  static readonly code = 6022
  readonly code = 6022
  readonly name = "ObligationDepositsZero"
  readonly msg = "Obligation deposits have zero value"

  constructor(readonly logs?: string[]) {
    super("6022: Obligation deposits have zero value")
  }
}

export class ObligationBorrowsZero extends Error {
  static readonly code = 6023
  readonly code = 6023
  readonly name = "ObligationBorrowsZero"
  readonly msg = "Obligation borrows have zero value"

  constructor(readonly logs?: string[]) {
    super("6023: Obligation borrows have zero value")
  }
}

export class InvalidObligationCollateral extends Error {
  static readonly code = 6024
  readonly code = 6024
  readonly name = "InvalidObligationCollateral"
  readonly msg = "Invalid obligation collateral"

  constructor(readonly logs?: string[]) {
    super("6024: Invalid obligation collateral")
  }
}

export class InvalidObligationLiquidity extends Error {
  static readonly code = 6025
  readonly code = 6025
  readonly name = "InvalidObligationLiquidity"
  readonly msg = "Invalid obligation liquidity"

  constructor(readonly logs?: string[]) {
    super("6025: Invalid obligation liquidity")
  }
}

export class ObligationCollateralEmpty extends Error {
  static readonly code = 6026
  readonly code = 6026
  readonly name = "ObligationCollateralEmpty"
  readonly msg = "Obligation collateral is empty"

  constructor(readonly logs?: string[]) {
    super("6026: Obligation collateral is empty")
  }
}

export class ObligationLiquidityEmpty extends Error {
  static readonly code = 6027
  readonly code = 6027
  readonly name = "ObligationLiquidityEmpty"
  readonly msg = "Obligation liquidity is empty"

  constructor(readonly logs?: string[]) {
    super("6027: Obligation liquidity is empty")
  }
}

export class NegativeInterestRate extends Error {
  static readonly code = 6028
  readonly code = 6028
  readonly name = "NegativeInterestRate"
  readonly msg = "Interest rate is negative"

  constructor(readonly logs?: string[]) {
    super("6028: Interest rate is negative")
  }
}

export class InvalidOracleConfig extends Error {
  static readonly code = 6029
  readonly code = 6029
  readonly name = "InvalidOracleConfig"
  readonly msg = "Input oracle config is invalid"

  constructor(readonly logs?: string[]) {
    super("6029: Input oracle config is invalid")
  }
}

export class InsufficientProtocolFeesToRedeem extends Error {
  static readonly code = 6030
  readonly code = 6030
  readonly name = "InsufficientProtocolFeesToRedeem"
  readonly msg = "Insufficient protocol fees to claim or no liquidity available"

  constructor(readonly logs?: string[]) {
    super("6030: Insufficient protocol fees to claim or no liquidity available")
  }
}

export class FlashBorrowCpi extends Error {
  static readonly code = 6031
  readonly code = 6031
  readonly name = "FlashBorrowCpi"
  readonly msg = "No cpi flash borrows allowed"

  constructor(readonly logs?: string[]) {
    super("6031: No cpi flash borrows allowed")
  }
}

export class NoFlashRepayFound extends Error {
  static readonly code = 6032
  readonly code = 6032
  readonly name = "NoFlashRepayFound"
  readonly msg = "No corresponding repay found for flash borrow"

  constructor(readonly logs?: string[]) {
    super("6032: No corresponding repay found for flash borrow")
  }
}

export class InvalidFlashRepay extends Error {
  static readonly code = 6033
  readonly code = 6033
  readonly name = "InvalidFlashRepay"
  readonly msg = "Invalid repay found"

  constructor(readonly logs?: string[]) {
    super("6033: Invalid repay found")
  }
}

export class FlashRepayCpi extends Error {
  static readonly code = 6034
  readonly code = 6034
  readonly name = "FlashRepayCpi"
  readonly msg = "No cpi flash repays allowed"

  constructor(readonly logs?: string[]) {
    super("6034: No cpi flash repays allowed")
  }
}

export class MultipleFlashBorrows extends Error {
  static readonly code = 6035
  readonly code = 6035
  readonly name = "MultipleFlashBorrows"
  readonly msg = "Multiple flash borrows not allowed in the same transaction"

  constructor(readonly logs?: string[]) {
    super("6035: Multiple flash borrows not allowed in the same transaction")
  }
}

export class FlashLoansDisabled extends Error {
  static readonly code = 6036
  readonly code = 6036
  readonly name = "FlashLoansDisabled"
  readonly msg = "Flash loans are disabled for this reserve"

  constructor(readonly logs?: string[]) {
    super("6036: Flash loans are disabled for this reserve")
  }
}

export class SwitchboardV2Error extends Error {
  static readonly code = 6037
  readonly code = 6037
  readonly name = "SwitchboardV2Error"
  readonly msg = "Switchboard error"

  constructor(readonly logs?: string[]) {
    super("6037: Switchboard error")
  }
}

export class CouldNotDeserializeScope extends Error {
  static readonly code = 6038
  readonly code = 6038
  readonly name = "CouldNotDeserializeScope"
  readonly msg = "Cannot deserialize the scope price account"

  constructor(readonly logs?: string[]) {
    super("6038: Cannot deserialize the scope price account")
  }
}

export class PriceTooOld extends Error {
  static readonly code = 6039
  readonly code = 6039
  readonly name = "PriceTooOld"
  readonly msg = "Price too old"

  constructor(readonly logs?: string[]) {
    super("6039: Price too old")
  }
}

export class PriceTooDivergentFromTwap extends Error {
  static readonly code = 6040
  readonly code = 6040
  readonly name = "PriceTooDivergentFromTwap"
  readonly msg = "Price too divergent from twap"

  constructor(readonly logs?: string[]) {
    super("6040: Price too divergent from twap")
  }
}

export class InvalidTwapPrice extends Error {
  static readonly code = 6041
  readonly code = 6041
  readonly name = "InvalidTwapPrice"
  readonly msg = "Invalid twap price"

  constructor(readonly logs?: string[]) {
    super("6041: Invalid twap price")
  }
}

export class GlobalEmergencyMode extends Error {
  static readonly code = 6042
  readonly code = 6042
  readonly name = "GlobalEmergencyMode"
  readonly msg = "Emergency mode is enabled"

  constructor(readonly logs?: string[]) {
    super("6042: Emergency mode is enabled")
  }
}

export class InvalidFlag extends Error {
  static readonly code = 6043
  readonly code = 6043
  readonly name = "InvalidFlag"
  readonly msg = "Invalid lending market config"

  constructor(readonly logs?: string[]) {
    super("6043: Invalid lending market config")
  }
}

export class PriceNotValid extends Error {
  static readonly code = 6044
  readonly code = 6044
  readonly name = "PriceNotValid"
  readonly msg = "Price is not valid"

  constructor(readonly logs?: string[]) {
    super("6044: Price is not valid")
  }
}

export class PriceIsBiggerThanHeuristic extends Error {
  static readonly code = 6045
  readonly code = 6045
  readonly name = "PriceIsBiggerThanHeuristic"
  readonly msg = "Price is bigger than allowed by heuristic"

  constructor(readonly logs?: string[]) {
    super("6045: Price is bigger than allowed by heuristic")
  }
}

export class PriceIsLowerThanHeuristic extends Error {
  static readonly code = 6046
  readonly code = 6046
  readonly name = "PriceIsLowerThanHeuristic"
  readonly msg = "Price lower than allowed by heuristic"

  constructor(readonly logs?: string[]) {
    super("6046: Price lower than allowed by heuristic")
  }
}

export class PriceIsZero extends Error {
  static readonly code = 6047
  readonly code = 6047
  readonly name = "PriceIsZero"
  readonly msg = "Price is zero"

  constructor(readonly logs?: string[]) {
    super("6047: Price is zero")
  }
}

export class PriceConfidenceTooWide extends Error {
  static readonly code = 6048
  readonly code = 6048
  readonly name = "PriceConfidenceTooWide"
  readonly msg = "Price confidence too wide"

  constructor(readonly logs?: string[]) {
    super("6048: Price confidence too wide")
  }
}

export class IntegerOverflow extends Error {
  static readonly code = 6049
  readonly code = 6049
  readonly name = "IntegerOverflow"
  readonly msg = "Conversion between integers failed"

  constructor(readonly logs?: string[]) {
    super("6049: Conversion between integers failed")
  }
}

export class NoFarmForReserve extends Error {
  static readonly code = 6050
  readonly code = 6050
  readonly name = "NoFarmForReserve"
  readonly msg = "This reserve does not have a farm"

  constructor(readonly logs?: string[]) {
    super("6050: This reserve does not have a farm")
  }
}

export class IncorrectInstructionInPosition extends Error {
  static readonly code = 6051
  readonly code = 6051
  readonly name = "IncorrectInstructionInPosition"
  readonly msg = "Wrong instruction at expected position"

  constructor(readonly logs?: string[]) {
    super("6051: Wrong instruction at expected position")
  }
}

export class NoPriceFound extends Error {
  static readonly code = 6052
  readonly code = 6052
  readonly name = "NoPriceFound"
  readonly msg = "No price found"

  constructor(readonly logs?: string[]) {
    super("6052: No price found")
  }
}

export class InvalidTwapConfig extends Error {
  static readonly code = 6053
  readonly code = 6053
  readonly name = "InvalidTwapConfig"
  readonly msg =
    "Invalid Twap configuration: Twap is enabled but one of the enabled price doesn't have a twap"

  constructor(readonly logs?: string[]) {
    super(
      "6053: Invalid Twap configuration: Twap is enabled but one of the enabled price doesn't have a twap"
    )
  }
}

export class InvalidPythPriceAccount extends Error {
  static readonly code = 6054
  readonly code = 6054
  readonly name = "InvalidPythPriceAccount"
  readonly msg = "Pyth price account does not match configuration"

  constructor(readonly logs?: string[]) {
    super("6054: Pyth price account does not match configuration")
  }
}

export class InvalidSwitchboardAccount extends Error {
  static readonly code = 6055
  readonly code = 6055
  readonly name = "InvalidSwitchboardAccount"
  readonly msg = "Switchboard account(s) do not match configuration"

  constructor(readonly logs?: string[]) {
    super("6055: Switchboard account(s) do not match configuration")
  }
}

export class InvalidScopePriceAccount extends Error {
  static readonly code = 6056
  readonly code = 6056
  readonly name = "InvalidScopePriceAccount"
  readonly msg = "Scope price account does not match configuration"

  constructor(readonly logs?: string[]) {
    super("6056: Scope price account does not match configuration")
  }
}

export class ObligationCollateralLtvZero extends Error {
  static readonly code = 6057
  readonly code = 6057
  readonly name = "ObligationCollateralLtvZero"
  readonly msg =
    "The obligation has one collateral with an LTV set to 0. Withdraw it before withdrawing other collaterals"

  constructor(readonly logs?: string[]) {
    super(
      "6057: The obligation has one collateral with an LTV set to 0. Withdraw it before withdrawing other collaterals"
    )
  }
}

export class InvalidObligationSeedsValue extends Error {
  static readonly code = 6058
  readonly code = 6058
  readonly name = "InvalidObligationSeedsValue"
  readonly msg =
    "Seeds must be default pubkeys for tag 0, and mint addresses for tag 1 or 2"

  constructor(readonly logs?: string[]) {
    super(
      "6058: Seeds must be default pubkeys for tag 0, and mint addresses for tag 1 or 2"
    )
  }
}

export class DeprecatedInvalidObligationId extends Error {
  static readonly code = 6059
  readonly code = 6059
  readonly name = "DeprecatedInvalidObligationId"
  readonly msg = "[DEPRECATED] Obligation id must be 0"

  constructor(readonly logs?: string[]) {
    super("6059: [DEPRECATED] Obligation id must be 0")
  }
}

export class InvalidBorrowRateCurvePoint extends Error {
  static readonly code = 6060
  readonly code = 6060
  readonly name = "InvalidBorrowRateCurvePoint"
  readonly msg = "Invalid borrow rate curve point"

  constructor(readonly logs?: string[]) {
    super("6060: Invalid borrow rate curve point")
  }
}

export class InvalidUtilizationRate extends Error {
  static readonly code = 6061
  readonly code = 6061
  readonly name = "InvalidUtilizationRate"
  readonly msg = "Invalid utilization rate"

  constructor(readonly logs?: string[]) {
    super("6061: Invalid utilization rate")
  }
}

export class CannotSocializeObligationWithCollateral extends Error {
  static readonly code = 6062
  readonly code = 6062
  readonly name = "CannotSocializeObligationWithCollateral"
  readonly msg =
    "Obligation hasn't been fully liquidated and debt cannot be socialized."

  constructor(readonly logs?: string[]) {
    super(
      "6062: Obligation hasn't been fully liquidated and debt cannot be socialized."
    )
  }
}

export class ObligationEmpty extends Error {
  static readonly code = 6063
  readonly code = 6063
  readonly name = "ObligationEmpty"
  readonly msg = "Obligation has no borrows or deposits."

  constructor(readonly logs?: string[]) {
    super("6063: Obligation has no borrows or deposits.")
  }
}

export class WithdrawalCapReached extends Error {
  static readonly code = 6064
  readonly code = 6064
  readonly name = "WithdrawalCapReached"
  readonly msg = "Withdrawal cap is reached"

  constructor(readonly logs?: string[]) {
    super("6064: Withdrawal cap is reached")
  }
}

export class LastTimestampGreaterThanCurrent extends Error {
  static readonly code = 6065
  readonly code = 6065
  readonly name = "LastTimestampGreaterThanCurrent"
  readonly msg =
    "The last interval start timestamp is greater than the current timestamp"

  constructor(readonly logs?: string[]) {
    super(
      "6065: The last interval start timestamp is greater than the current timestamp"
    )
  }
}

export class LiquidationRewardTooSmall extends Error {
  static readonly code = 6066
  readonly code = 6066
  readonly name = "LiquidationRewardTooSmall"
  readonly msg =
    "The reward amount is less than the minimum acceptable received liquidity"

  constructor(readonly logs?: string[]) {
    super(
      "6066: The reward amount is less than the minimum acceptable received liquidity"
    )
  }
}

export class IsolatedAssetTierViolation extends Error {
  static readonly code = 6067
  readonly code = 6067
  readonly name = "IsolatedAssetTierViolation"
  readonly msg = "Isolated Asset Tier Violation"

  constructor(readonly logs?: string[]) {
    super("6067: Isolated Asset Tier Violation")
  }
}

export class InconsistentElevationGroup extends Error {
  static readonly code = 6068
  readonly code = 6068
  readonly name = "InconsistentElevationGroup"
  readonly msg =
    "The obligation's elevation group and the reserve's are not the same"

  constructor(readonly logs?: string[]) {
    super(
      "6068: The obligation's elevation group and the reserve's are not the same"
    )
  }
}

export class InvalidElevationGroup extends Error {
  static readonly code = 6069
  readonly code = 6069
  readonly name = "InvalidElevationGroup"
  readonly msg =
    "The elevation group chosen for the reserve does not exist in the lending market"

  constructor(readonly logs?: string[]) {
    super(
      "6069: The elevation group chosen for the reserve does not exist in the lending market"
    )
  }
}

export class InvalidElevationGroupConfig extends Error {
  static readonly code = 6070
  readonly code = 6070
  readonly name = "InvalidElevationGroupConfig"
  readonly msg = "The elevation group updated has wrong parameters set"

  constructor(readonly logs?: string[]) {
    super("6070: The elevation group updated has wrong parameters set")
  }
}

export class UnhealthyElevationGroupLtv extends Error {
  static readonly code = 6071
  readonly code = 6071
  readonly name = "UnhealthyElevationGroupLtv"
  readonly msg =
    "The current obligation must have most or all its debt repaid before changing the elevation group"

  constructor(readonly logs?: string[]) {
    super(
      "6071: The current obligation must have most or all its debt repaid before changing the elevation group"
    )
  }
}

export class ElevationGroupNewLoansDisabled extends Error {
  static readonly code = 6072
  readonly code = 6072
  readonly name = "ElevationGroupNewLoansDisabled"
  readonly msg =
    "Elevation group does not accept any new loans or any new borrows/withdrawals"

  constructor(readonly logs?: string[]) {
    super(
      "6072: Elevation group does not accept any new loans or any new borrows/withdrawals"
    )
  }
}

export class ReserveDeprecated extends Error {
  static readonly code = 6073
  readonly code = 6073
  readonly name = "ReserveDeprecated"
  readonly msg = "Reserve was deprecated, no longer usable"

  constructor(readonly logs?: string[]) {
    super("6073: Reserve was deprecated, no longer usable")
  }
}

export class ReferrerAccountNotInitialized extends Error {
  static readonly code = 6074
  readonly code = 6074
  readonly name = "ReferrerAccountNotInitialized"
  readonly msg = "Referrer account not initialized"

  constructor(readonly logs?: string[]) {
    super("6074: Referrer account not initialized")
  }
}

export class ReferrerAccountMintMissmatch extends Error {
  static readonly code = 6075
  readonly code = 6075
  readonly name = "ReferrerAccountMintMissmatch"
  readonly msg =
    "Referrer account mint does not match the operation reserve mint"

  constructor(readonly logs?: string[]) {
    super(
      "6075: Referrer account mint does not match the operation reserve mint"
    )
  }
}

export class ReferrerAccountWrongAddress extends Error {
  static readonly code = 6076
  readonly code = 6076
  readonly name = "ReferrerAccountWrongAddress"
  readonly msg = "Referrer account address is not a valid program address"

  constructor(readonly logs?: string[]) {
    super("6076: Referrer account address is not a valid program address")
  }
}

export class ReferrerAccountReferrerMissmatch extends Error {
  static readonly code = 6077
  readonly code = 6077
  readonly name = "ReferrerAccountReferrerMissmatch"
  readonly msg = "Referrer account referrer does not match the owner referrer"

  constructor(readonly logs?: string[]) {
    super("6077: Referrer account referrer does not match the owner referrer")
  }
}

export class ReferrerAccountMissing extends Error {
  static readonly code = 6078
  readonly code = 6078
  readonly name = "ReferrerAccountMissing"
  readonly msg = "Referrer account missing for obligation with referrer"

  constructor(readonly logs?: string[]) {
    super("6078: Referrer account missing for obligation with referrer")
  }
}

export class InsufficientReferralFeesToRedeem extends Error {
  static readonly code = 6079
  readonly code = 6079
  readonly name = "InsufficientReferralFeesToRedeem"
  readonly msg = "Insufficient referral fees to claim or no liquidity available"

  constructor(readonly logs?: string[]) {
    super("6079: Insufficient referral fees to claim or no liquidity available")
  }
}

export class CpiDisabled extends Error {
  static readonly code = 6080
  readonly code = 6080
  readonly name = "CpiDisabled"
  readonly msg = "CPI disabled for this instruction"

  constructor(readonly logs?: string[]) {
    super("6080: CPI disabled for this instruction")
  }
}

export class ShortUrlNotAsciiAlphanumeric extends Error {
  static readonly code = 6081
  readonly code = 6081
  readonly name = "ShortUrlNotAsciiAlphanumeric"
  readonly msg = "Referrer short_url is not ascii alphanumeric"

  constructor(readonly logs?: string[]) {
    super("6081: Referrer short_url is not ascii alphanumeric")
  }
}

export class ReserveObsolete extends Error {
  static readonly code = 6082
  readonly code = 6082
  readonly name = "ReserveObsolete"
  readonly msg = "Reserve is marked as obsolete"

  constructor(readonly logs?: string[]) {
    super("6082: Reserve is marked as obsolete")
  }
}

export class ElevationGroupAlreadyActivated extends Error {
  static readonly code = 6083
  readonly code = 6083
  readonly name = "ElevationGroupAlreadyActivated"
  readonly msg = "Obligation already part of the same elevation group"

  constructor(readonly logs?: string[]) {
    super("6083: Obligation already part of the same elevation group")
  }
}

export class ObligationInObsoleteReserve extends Error {
  static readonly code = 6084
  readonly code = 6084
  readonly name = "ObligationInObsoleteReserve"
  readonly msg = "Obligation has a deposit or borrow in an obsolete reserve"

  constructor(readonly logs?: string[]) {
    super("6084: Obligation has a deposit or borrow in an obsolete reserve")
  }
}

export class ReferrerStateOwnerMismatch extends Error {
  static readonly code = 6085
  readonly code = 6085
  readonly name = "ReferrerStateOwnerMismatch"
  readonly msg = "Referrer state owner does not match the given signer"

  constructor(readonly logs?: string[]) {
    super("6085: Referrer state owner does not match the given signer")
  }
}

export class UserMetadataOwnerAlreadySet extends Error {
  static readonly code = 6086
  readonly code = 6086
  readonly name = "UserMetadataOwnerAlreadySet"
  readonly msg = "User metadata owner is already set"

  constructor(readonly logs?: string[]) {
    super("6086: User metadata owner is already set")
  }
}

export class CollateralNonLiquidatable extends Error {
  static readonly code = 6087
  readonly code = 6087
  readonly name = "CollateralNonLiquidatable"
  readonly msg = "This collateral cannot be liquidated (LTV set to 0)"

  constructor(readonly logs?: string[]) {
    super("6087: This collateral cannot be liquidated (LTV set to 0)")
  }
}

export class BorrowingDisabled extends Error {
  static readonly code = 6088
  readonly code = 6088
  readonly name = "BorrowingDisabled"
  readonly msg = "Borrowing is disabled"

  constructor(readonly logs?: string[]) {
    super("6088: Borrowing is disabled")
  }
}

export class BorrowLimitExceeded extends Error {
  static readonly code = 6089
  readonly code = 6089
  readonly name = "BorrowLimitExceeded"
  readonly msg = "Cannot borrow above borrow limit"

  constructor(readonly logs?: string[]) {
    super("6089: Cannot borrow above borrow limit")
  }
}

export class DepositLimitExceeded extends Error {
  static readonly code = 6090
  readonly code = 6090
  readonly name = "DepositLimitExceeded"
  readonly msg = "Cannot deposit above deposit limit"

  constructor(readonly logs?: string[]) {
    super("6090: Cannot deposit above deposit limit")
  }
}

export class BorrowingDisabledOutsideElevationGroup extends Error {
  static readonly code = 6091
  readonly code = 6091
  readonly name = "BorrowingDisabledOutsideElevationGroup"
  readonly msg =
    "Reserve does not accept any new borrows outside elevation group"

  constructor(readonly logs?: string[]) {
    super(
      "6091: Reserve does not accept any new borrows outside elevation group"
    )
  }
}

export class NetValueRemainingTooSmall extends Error {
  static readonly code = 6092
  readonly code = 6092
  readonly name = "NetValueRemainingTooSmall"
  readonly msg = "Net value remaining too small"

  constructor(readonly logs?: string[]) {
    super("6092: Net value remaining too small")
  }
}

export class WorseLtvBlocked extends Error {
  static readonly code = 6093
  readonly code = 6093
  readonly name = "WorseLtvBlocked"
  readonly msg = "Cannot get the obligation in a worse position"

  constructor(readonly logs?: string[]) {
    super("6093: Cannot get the obligation in a worse position")
  }
}

export class LiabilitiesBiggerThanAssets extends Error {
  static readonly code = 6094
  readonly code = 6094
  readonly name = "LiabilitiesBiggerThanAssets"
  readonly msg = "Cannot have more liabilities than assets in a position"

  constructor(readonly logs?: string[]) {
    super("6094: Cannot have more liabilities than assets in a position")
  }
}

export class ReserveTokenBalanceMismatch extends Error {
  static readonly code = 6095
  readonly code = 6095
  readonly name = "ReserveTokenBalanceMismatch"
  readonly msg = "Reserve state and token account cannot drift"

  constructor(readonly logs?: string[]) {
    super("6095: Reserve state and token account cannot drift")
  }
}

export class ReserveVaultBalanceMismatch extends Error {
  static readonly code = 6096
  readonly code = 6096
  readonly name = "ReserveVaultBalanceMismatch"
  readonly msg = "Reserve token account has been unexpectedly modified"

  constructor(readonly logs?: string[]) {
    super("6096: Reserve token account has been unexpectedly modified")
  }
}

export class ReserveAccountingMismatch extends Error {
  static readonly code = 6097
  readonly code = 6097
  readonly name = "ReserveAccountingMismatch"
  readonly msg =
    "Reserve internal state accounting has been unexpectedly modified"

  constructor(readonly logs?: string[]) {
    super(
      "6097: Reserve internal state accounting has been unexpectedly modified"
    )
  }
}

export class BorrowingAboveUtilizationRateDisabled extends Error {
  static readonly code = 6098
  readonly code = 6098
  readonly name = "BorrowingAboveUtilizationRateDisabled"
  readonly msg = "Borrowing above set utilization rate is disabled"

  constructor(readonly logs?: string[]) {
    super("6098: Borrowing above set utilization rate is disabled")
  }
}

export class LiquidationBorrowFactorPriority extends Error {
  static readonly code = 6099
  readonly code = 6099
  readonly name = "LiquidationBorrowFactorPriority"
  readonly msg =
    "Liquidation must prioritize the debt with the highest borrow factor"

  constructor(readonly logs?: string[]) {
    super(
      "6099: Liquidation must prioritize the debt with the highest borrow factor"
    )
  }
}

export class LiquidationLowestLiquidationLtvPriority extends Error {
  static readonly code = 6100
  readonly code = 6100
  readonly name = "LiquidationLowestLiquidationLtvPriority"
  readonly msg =
    "Liquidation must prioritize the collateral with the lowest liquidation LTV"

  constructor(readonly logs?: string[]) {
    super(
      "6100: Liquidation must prioritize the collateral with the lowest liquidation LTV"
    )
  }
}

export class ElevationGroupBorrowLimitExceeded extends Error {
  static readonly code = 6101
  readonly code = 6101
  readonly name = "ElevationGroupBorrowLimitExceeded"
  readonly msg = "Elevation group borrow limit exceeded"

  constructor(readonly logs?: string[]) {
    super("6101: Elevation group borrow limit exceeded")
  }
}

export class ElevationGroupWithoutDebtReserve extends Error {
  static readonly code = 6102
  readonly code = 6102
  readonly name = "ElevationGroupWithoutDebtReserve"
  readonly msg = "The elevation group does not have a debt reserve defined"

  constructor(readonly logs?: string[]) {
    super("6102: The elevation group does not have a debt reserve defined")
  }
}

export class ElevationGroupMaxCollateralReserveZero extends Error {
  static readonly code = 6103
  readonly code = 6103
  readonly name = "ElevationGroupMaxCollateralReserveZero"
  readonly msg = "The elevation group does not allow any collateral reserves"

  constructor(readonly logs?: string[]) {
    super("6103: The elevation group does not allow any collateral reserves")
  }
}

export class ElevationGroupHasAnotherDebtReserve extends Error {
  static readonly code = 6104
  readonly code = 6104
  readonly name = "ElevationGroupHasAnotherDebtReserve"
  readonly msg =
    "In elevation group attempt to borrow from a reserve that is not the debt reserve"

  constructor(readonly logs?: string[]) {
    super(
      "6104: In elevation group attempt to borrow from a reserve that is not the debt reserve"
    )
  }
}

export class ElevationGroupDebtReserveAsCollateral extends Error {
  static readonly code = 6105
  readonly code = 6105
  readonly name = "ElevationGroupDebtReserveAsCollateral"
  readonly msg =
    "The elevation group's debt reserve cannot be used as a collateral reserve"

  constructor(readonly logs?: string[]) {
    super(
      "6105: The elevation group's debt reserve cannot be used as a collateral reserve"
    )
  }
}

export class ObligationCollateralExceedsElevationGroupLimit extends Error {
  static readonly code = 6106
  readonly code = 6106
  readonly name = "ObligationCollateralExceedsElevationGroupLimit"
  readonly msg =
    "Obligation have more collateral than the maximum allowed by the elevation group"

  constructor(readonly logs?: string[]) {
    super(
      "6106: Obligation have more collateral than the maximum allowed by the elevation group"
    )
  }
}

export class ObligationElevationGroupMultipleDebtReserve extends Error {
  static readonly code = 6107
  readonly code = 6107
  readonly name = "ObligationElevationGroupMultipleDebtReserve"
  readonly msg =
    "Obligation is an elevation group but have more than one debt reserve"

  constructor(readonly logs?: string[]) {
    super(
      "6107: Obligation is an elevation group but have more than one debt reserve"
    )
  }
}

export class UnsupportedTokenExtension extends Error {
  static readonly code = 6108
  readonly code = 6108
  readonly name = "UnsupportedTokenExtension"
  readonly msg = "Mint has a token (2022) extension that is not supported"

  constructor(readonly logs?: string[]) {
    super("6108: Mint has a token (2022) extension that is not supported")
  }
}

export class InvalidTokenAccount extends Error {
  static readonly code = 6109
  readonly code = 6109
  readonly name = "InvalidTokenAccount"
  readonly msg = "Can't have an spl token mint with a t22 account"

  constructor(readonly logs?: string[]) {
    super("6109: Can't have an spl token mint with a t22 account")
  }
}

export class DepositDisabledOutsideElevationGroup extends Error {
  static readonly code = 6110
  readonly code = 6110
  readonly name = "DepositDisabledOutsideElevationGroup"
  readonly msg = "Can't deposit into this reserve outside elevation group"

  constructor(readonly logs?: string[]) {
    super("6110: Can't deposit into this reserve outside elevation group")
  }
}

export class CannotCalculateReferralAmountDueToSlotsMismatch extends Error {
  static readonly code = 6111
  readonly code = 6111
  readonly name = "CannotCalculateReferralAmountDueToSlotsMismatch"
  readonly msg = "Cannot calculate referral amount due to slots mismatch"

  constructor(readonly logs?: string[]) {
    super("6111: Cannot calculate referral amount due to slots mismatch")
  }
}

export class ObligationOwnersMustMatch extends Error {
  static readonly code = 6112
  readonly code = 6112
  readonly name = "ObligationOwnersMustMatch"
  readonly msg = "Obligation owners must match"

  constructor(readonly logs?: string[]) {
    super("6112: Obligation owners must match")
  }
}

export class ObligationsMustMatch extends Error {
  static readonly code = 6113
  readonly code = 6113
  readonly name = "ObligationsMustMatch"
  readonly msg = "Obligations must match"

  constructor(readonly logs?: string[]) {
    super("6113: Obligations must match")
  }
}

export class LendingMarketsMustMatch extends Error {
  static readonly code = 6114
  readonly code = 6114
  readonly name = "LendingMarketsMustMatch"
  readonly msg = "Lending markets must match"

  constructor(readonly logs?: string[]) {
    super("6114: Lending markets must match")
  }
}

export class ObligationCurrentlyMarkedForDeleveraging extends Error {
  static readonly code = 6115
  readonly code = 6115
  readonly name = "ObligationCurrentlyMarkedForDeleveraging"
  readonly msg = "Obligation is already marked for deleveraging"

  constructor(readonly logs?: string[]) {
    super("6115: Obligation is already marked for deleveraging")
  }
}

export class MaximumWithdrawValueZero extends Error {
  static readonly code = 6116
  readonly code = 6116
  readonly name = "MaximumWithdrawValueZero"
  readonly msg =
    "Maximum withdrawable value of this collateral is zero, LTV needs improved"

  constructor(readonly logs?: string[]) {
    super(
      "6116: Maximum withdrawable value of this collateral is zero, LTV needs improved"
    )
  }
}

export class ZeroMaxLtvAssetsInDeposits extends Error {
  static readonly code = 6117
  readonly code = 6117
  readonly name = "ZeroMaxLtvAssetsInDeposits"
  readonly msg =
    "No max LTV 0 assets allowed in deposits for repay and withdraw"

  constructor(readonly logs?: string[]) {
    super(
      "6117: No max LTV 0 assets allowed in deposits for repay and withdraw"
    )
  }
}

export class LowestLtvAssetsPriority extends Error {
  static readonly code = 6118
  readonly code = 6118
  readonly name = "LowestLtvAssetsPriority"
  readonly msg =
    "Withdrawing must prioritize the collateral with the lowest reserve max-LTV"

  constructor(readonly logs?: string[]) {
    super(
      "6118: Withdrawing must prioritize the collateral with the lowest reserve max-LTV"
    )
  }
}

export class WorseLtvThanUnhealthyLtv extends Error {
  static readonly code = 6119
  readonly code = 6119
  readonly name = "WorseLtvThanUnhealthyLtv"
  readonly msg = "Cannot get the obligation liquidatable"

  constructor(readonly logs?: string[]) {
    super("6119: Cannot get the obligation liquidatable")
  }
}

export class FarmAccountsMissing extends Error {
  static readonly code = 6120
  readonly code = 6120
  readonly name = "FarmAccountsMissing"
  readonly msg = "Farm accounts to refresh are missing"

  constructor(readonly logs?: string[]) {
    super("6120: Farm accounts to refresh are missing")
  }
}

export class RepayTooSmallForFullLiquidation extends Error {
  static readonly code = 6121
  readonly code = 6121
  readonly name = "RepayTooSmallForFullLiquidation"
  readonly msg =
    "Repay amount is too small to satisfy the mandatory full liquidation"

  constructor(readonly logs?: string[]) {
    super(
      "6121: Repay amount is too small to satisfy the mandatory full liquidation"
    )
  }
}

export class InsufficientRepayAmount extends Error {
  static readonly code = 6122
  readonly code = 6122
  readonly name = "InsufficientRepayAmount"
  readonly msg =
    "Liquidator provided repay amount lower than required by liquidation rules"

  constructor(readonly logs?: string[]) {
    super(
      "6122: Liquidator provided repay amount lower than required by liquidation rules"
    )
  }
}

export class OrderIndexOutOfBounds extends Error {
  static readonly code = 6123
  readonly code = 6123
  readonly name = "OrderIndexOutOfBounds"
  readonly msg = "Obligation order of the given index cannot exist"

  constructor(readonly logs?: string[]) {
    super("6123: Obligation order of the given index cannot exist")
  }
}

export class InvalidOrderConfiguration extends Error {
  static readonly code = 6124
  readonly code = 6124
  readonly name = "InvalidOrderConfiguration"
  readonly msg = "Given order configuration has wrong parameters"

  constructor(readonly logs?: string[]) {
    super("6124: Given order configuration has wrong parameters")
  }
}

export class OrderConfigurationNotSupportedByObligation extends Error {
  static readonly code = 6125
  readonly code = 6125
  readonly name = "OrderConfigurationNotSupportedByObligation"
  readonly msg =
    "Given order configuration cannot be used with the current state of the obligation"

  constructor(readonly logs?: string[]) {
    super(
      "6125: Given order configuration cannot be used with the current state of the obligation"
    )
  }
}

export class OperationNotPermittedWithCurrentObligationOrders extends Error {
  static readonly code = 6126
  readonly code = 6126
  readonly name = "OperationNotPermittedWithCurrentObligationOrders"
  readonly msg =
    "Single debt, single collateral obligation orders have to be cancelled before changing the deposit/borrow count"

  constructor(readonly logs?: string[]) {
    super(
      "6126: Single debt, single collateral obligation orders have to be cancelled before changing the deposit/borrow count"
    )
  }
}

export class OperationNotPermittedMarketImmutable extends Error {
  static readonly code = 6127
  readonly code = 6127
  readonly name = "OperationNotPermittedMarketImmutable"
  readonly msg = "Cannot update lending market because it is set as immutable"

  constructor(readonly logs?: string[]) {
    super("6127: Cannot update lending market because it is set as immutable")
  }
}

export class OrderCreationDisabled extends Error {
  static readonly code = 6128
  readonly code = 6128
  readonly name = "OrderCreationDisabled"
  readonly msg = "Creation of new orders is disabled"

  constructor(readonly logs?: string[]) {
    super("6128: Creation of new orders is disabled")
  }
}

export class NoUpgradeAuthority extends Error {
  static readonly code = 6129
  readonly code = 6129
  readonly name = "NoUpgradeAuthority"
  readonly msg =
    "Cannot initialize global config because there is no upgrade authority to the program"

  constructor(readonly logs?: string[]) {
    super(
      "6129: Cannot initialize global config because there is no upgrade authority to the program"
    )
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 6000:
      return new InvalidMarketAuthority(logs)
    case 6001:
      return new InvalidMarketOwner(logs)
    case 6002:
      return new InvalidAccountOwner(logs)
    case 6003:
      return new InvalidAmount(logs)
    case 6004:
      return new InvalidConfig(logs)
    case 6005:
      return new InvalidSigner(logs)
    case 6006:
      return new InvalidAccountInput(logs)
    case 6007:
      return new MathOverflow(logs)
    case 6008:
      return new InsufficientLiquidity(logs)
    case 6009:
      return new ReserveStale(logs)
    case 6010:
      return new WithdrawTooSmall(logs)
    case 6011:
      return new WithdrawTooLarge(logs)
    case 6012:
      return new BorrowTooSmall(logs)
    case 6013:
      return new BorrowTooLarge(logs)
    case 6014:
      return new RepayTooSmall(logs)
    case 6015:
      return new LiquidationTooSmall(logs)
    case 6016:
      return new ObligationHealthy(logs)
    case 6017:
      return new ObligationStale(logs)
    case 6018:
      return new ObligationReserveLimit(logs)
    case 6019:
      return new InvalidObligationOwner(logs)
    case 6020:
      return new ObligationDepositsEmpty(logs)
    case 6021:
      return new ObligationBorrowsEmpty(logs)
    case 6022:
      return new ObligationDepositsZero(logs)
    case 6023:
      return new ObligationBorrowsZero(logs)
    case 6024:
      return new InvalidObligationCollateral(logs)
    case 6025:
      return new InvalidObligationLiquidity(logs)
    case 6026:
      return new ObligationCollateralEmpty(logs)
    case 6027:
      return new ObligationLiquidityEmpty(logs)
    case 6028:
      return new NegativeInterestRate(logs)
    case 6029:
      return new InvalidOracleConfig(logs)
    case 6030:
      return new InsufficientProtocolFeesToRedeem(logs)
    case 6031:
      return new FlashBorrowCpi(logs)
    case 6032:
      return new NoFlashRepayFound(logs)
    case 6033:
      return new InvalidFlashRepay(logs)
    case 6034:
      return new FlashRepayCpi(logs)
    case 6035:
      return new MultipleFlashBorrows(logs)
    case 6036:
      return new FlashLoansDisabled(logs)
    case 6037:
      return new SwitchboardV2Error(logs)
    case 6038:
      return new CouldNotDeserializeScope(logs)
    case 6039:
      return new PriceTooOld(logs)
    case 6040:
      return new PriceTooDivergentFromTwap(logs)
    case 6041:
      return new InvalidTwapPrice(logs)
    case 6042:
      return new GlobalEmergencyMode(logs)
    case 6043:
      return new InvalidFlag(logs)
    case 6044:
      return new PriceNotValid(logs)
    case 6045:
      return new PriceIsBiggerThanHeuristic(logs)
    case 6046:
      return new PriceIsLowerThanHeuristic(logs)
    case 6047:
      return new PriceIsZero(logs)
    case 6048:
      return new PriceConfidenceTooWide(logs)
    case 6049:
      return new IntegerOverflow(logs)
    case 6050:
      return new NoFarmForReserve(logs)
    case 6051:
      return new IncorrectInstructionInPosition(logs)
    case 6052:
      return new NoPriceFound(logs)
    case 6053:
      return new InvalidTwapConfig(logs)
    case 6054:
      return new InvalidPythPriceAccount(logs)
    case 6055:
      return new InvalidSwitchboardAccount(logs)
    case 6056:
      return new InvalidScopePriceAccount(logs)
    case 6057:
      return new ObligationCollateralLtvZero(logs)
    case 6058:
      return new InvalidObligationSeedsValue(logs)
    case 6059:
      return new DeprecatedInvalidObligationId(logs)
    case 6060:
      return new InvalidBorrowRateCurvePoint(logs)
    case 6061:
      return new InvalidUtilizationRate(logs)
    case 6062:
      return new CannotSocializeObligationWithCollateral(logs)
    case 6063:
      return new ObligationEmpty(logs)
    case 6064:
      return new WithdrawalCapReached(logs)
    case 6065:
      return new LastTimestampGreaterThanCurrent(logs)
    case 6066:
      return new LiquidationRewardTooSmall(logs)
    case 6067:
      return new IsolatedAssetTierViolation(logs)
    case 6068:
      return new InconsistentElevationGroup(logs)
    case 6069:
      return new InvalidElevationGroup(logs)
    case 6070:
      return new InvalidElevationGroupConfig(logs)
    case 6071:
      return new UnhealthyElevationGroupLtv(logs)
    case 6072:
      return new ElevationGroupNewLoansDisabled(logs)
    case 6073:
      return new ReserveDeprecated(logs)
    case 6074:
      return new ReferrerAccountNotInitialized(logs)
    case 6075:
      return new ReferrerAccountMintMissmatch(logs)
    case 6076:
      return new ReferrerAccountWrongAddress(logs)
    case 6077:
      return new ReferrerAccountReferrerMissmatch(logs)
    case 6078:
      return new ReferrerAccountMissing(logs)
    case 6079:
      return new InsufficientReferralFeesToRedeem(logs)
    case 6080:
      return new CpiDisabled(logs)
    case 6081:
      return new ShortUrlNotAsciiAlphanumeric(logs)
    case 6082:
      return new ReserveObsolete(logs)
    case 6083:
      return new ElevationGroupAlreadyActivated(logs)
    case 6084:
      return new ObligationInObsoleteReserve(logs)
    case 6085:
      return new ReferrerStateOwnerMismatch(logs)
    case 6086:
      return new UserMetadataOwnerAlreadySet(logs)
    case 6087:
      return new CollateralNonLiquidatable(logs)
    case 6088:
      return new BorrowingDisabled(logs)
    case 6089:
      return new BorrowLimitExceeded(logs)
    case 6090:
      return new DepositLimitExceeded(logs)
    case 6091:
      return new BorrowingDisabledOutsideElevationGroup(logs)
    case 6092:
      return new NetValueRemainingTooSmall(logs)
    case 6093:
      return new WorseLtvBlocked(logs)
    case 6094:
      return new LiabilitiesBiggerThanAssets(logs)
    case 6095:
      return new ReserveTokenBalanceMismatch(logs)
    case 6096:
      return new ReserveVaultBalanceMismatch(logs)
    case 6097:
      return new ReserveAccountingMismatch(logs)
    case 6098:
      return new BorrowingAboveUtilizationRateDisabled(logs)
    case 6099:
      return new LiquidationBorrowFactorPriority(logs)
    case 6100:
      return new LiquidationLowestLiquidationLtvPriority(logs)
    case 6101:
      return new ElevationGroupBorrowLimitExceeded(logs)
    case 6102:
      return new ElevationGroupWithoutDebtReserve(logs)
    case 6103:
      return new ElevationGroupMaxCollateralReserveZero(logs)
    case 6104:
      return new ElevationGroupHasAnotherDebtReserve(logs)
    case 6105:
      return new ElevationGroupDebtReserveAsCollateral(logs)
    case 6106:
      return new ObligationCollateralExceedsElevationGroupLimit(logs)
    case 6107:
      return new ObligationElevationGroupMultipleDebtReserve(logs)
    case 6108:
      return new UnsupportedTokenExtension(logs)
    case 6109:
      return new InvalidTokenAccount(logs)
    case 6110:
      return new DepositDisabledOutsideElevationGroup(logs)
    case 6111:
      return new CannotCalculateReferralAmountDueToSlotsMismatch(logs)
    case 6112:
      return new ObligationOwnersMustMatch(logs)
    case 6113:
      return new ObligationsMustMatch(logs)
    case 6114:
      return new LendingMarketsMustMatch(logs)
    case 6115:
      return new ObligationCurrentlyMarkedForDeleveraging(logs)
    case 6116:
      return new MaximumWithdrawValueZero(logs)
    case 6117:
      return new ZeroMaxLtvAssetsInDeposits(logs)
    case 6118:
      return new LowestLtvAssetsPriority(logs)
    case 6119:
      return new WorseLtvThanUnhealthyLtv(logs)
    case 6120:
      return new FarmAccountsMissing(logs)
    case 6121:
      return new RepayTooSmallForFullLiquidation(logs)
    case 6122:
      return new InsufficientRepayAmount(logs)
    case 6123:
      return new OrderIndexOutOfBounds(logs)
    case 6124:
      return new InvalidOrderConfiguration(logs)
    case 6125:
      return new OrderConfigurationNotSupportedByObligation(logs)
    case 6126:
      return new OperationNotPermittedWithCurrentObligationOrders(logs)
    case 6127:
      return new OperationNotPermittedMarketImmutable(logs)
    case 6128:
      return new OrderCreationDisabled(logs)
    case 6129:
      return new NoUpgradeAuthority(logs)
  }

  return null
}
