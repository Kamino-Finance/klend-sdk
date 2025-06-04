import * as UpdateConfigMode from "./UpdateConfigMode"
import * as UpdateLendingMarketConfigValue from "./UpdateLendingMarketConfigValue"
import * as UpdateLendingMarketMode from "./UpdateLendingMarketMode"
import * as UpdateGlobalConfigMode from "./UpdateGlobalConfigMode"
import * as AssetTier from "./AssetTier"
import * as FeeCalculation from "./FeeCalculation"
import * as ReserveFarmKind from "./ReserveFarmKind"
import * as ReserveStatus from "./ReserveStatus"

export { UpdateConfigMode }

export type UpdateConfigModeKind =
  | UpdateConfigMode.UpdateLoanToValuePct
  | UpdateConfigMode.UpdateMaxLiquidationBonusBps
  | UpdateConfigMode.UpdateLiquidationThresholdPct
  | UpdateConfigMode.UpdateProtocolLiquidationFee
  | UpdateConfigMode.UpdateProtocolTakeRate
  | UpdateConfigMode.UpdateFeesBorrowFee
  | UpdateConfigMode.UpdateFeesFlashLoanFee
  | UpdateConfigMode.DeprecatedUpdateFeesReferralFeeBps
  | UpdateConfigMode.UpdateDepositLimit
  | UpdateConfigMode.UpdateBorrowLimit
  | UpdateConfigMode.UpdateTokenInfoLowerHeuristic
  | UpdateConfigMode.UpdateTokenInfoUpperHeuristic
  | UpdateConfigMode.UpdateTokenInfoExpHeuristic
  | UpdateConfigMode.UpdateTokenInfoTwapDivergence
  | UpdateConfigMode.UpdateTokenInfoScopeTwap
  | UpdateConfigMode.UpdateTokenInfoScopeChain
  | UpdateConfigMode.UpdateTokenInfoName
  | UpdateConfigMode.UpdateTokenInfoPriceMaxAge
  | UpdateConfigMode.UpdateTokenInfoTwapMaxAge
  | UpdateConfigMode.UpdateScopePriceFeed
  | UpdateConfigMode.UpdatePythPrice
  | UpdateConfigMode.UpdateSwitchboardFeed
  | UpdateConfigMode.UpdateSwitchboardTwapFeed
  | UpdateConfigMode.UpdateBorrowRateCurve
  | UpdateConfigMode.UpdateEntireReserveConfig
  | UpdateConfigMode.UpdateDebtWithdrawalCap
  | UpdateConfigMode.UpdateDepositWithdrawalCap
  | UpdateConfigMode.DeprecatedUpdateDebtWithdrawalCapCurrentTotal
  | UpdateConfigMode.DeprecatedUpdateDepositWithdrawalCapCurrentTotal
  | UpdateConfigMode.UpdateBadDebtLiquidationBonusBps
  | UpdateConfigMode.UpdateMinLiquidationBonusBps
  | UpdateConfigMode.UpdateDeleveragingMarginCallPeriod
  | UpdateConfigMode.UpdateBorrowFactor
  | UpdateConfigMode.UpdateAssetTier
  | UpdateConfigMode.UpdateElevationGroup
  | UpdateConfigMode.UpdateDeleveragingThresholdDecreaseBpsPerDay
  | UpdateConfigMode.DeprecatedUpdateMultiplierSideBoost
  | UpdateConfigMode.DeprecatedUpdateMultiplierTagBoost
  | UpdateConfigMode.UpdateReserveStatus
  | UpdateConfigMode.UpdateFarmCollateral
  | UpdateConfigMode.UpdateFarmDebt
  | UpdateConfigMode.UpdateDisableUsageAsCollateralOutsideEmode
  | UpdateConfigMode.UpdateBlockBorrowingAboveUtilizationPct
  | UpdateConfigMode.UpdateBlockPriceUsage
  | UpdateConfigMode.UpdateBorrowLimitOutsideElevationGroup
  | UpdateConfigMode.UpdateBorrowLimitsInElevationGroupAgainstThisReserve
  | UpdateConfigMode.UpdateHostFixedInterestRateBps
  | UpdateConfigMode.UpdateAutodeleverageEnabled
  | UpdateConfigMode.UpdateDeleveragingBonusIncreaseBpsPerDay
  | UpdateConfigMode.UpdateProtocolOrderExecutionFee
export type UpdateConfigModeJSON =
  | UpdateConfigMode.UpdateLoanToValuePctJSON
  | UpdateConfigMode.UpdateMaxLiquidationBonusBpsJSON
  | UpdateConfigMode.UpdateLiquidationThresholdPctJSON
  | UpdateConfigMode.UpdateProtocolLiquidationFeeJSON
  | UpdateConfigMode.UpdateProtocolTakeRateJSON
  | UpdateConfigMode.UpdateFeesBorrowFeeJSON
  | UpdateConfigMode.UpdateFeesFlashLoanFeeJSON
  | UpdateConfigMode.DeprecatedUpdateFeesReferralFeeBpsJSON
  | UpdateConfigMode.UpdateDepositLimitJSON
  | UpdateConfigMode.UpdateBorrowLimitJSON
  | UpdateConfigMode.UpdateTokenInfoLowerHeuristicJSON
  | UpdateConfigMode.UpdateTokenInfoUpperHeuristicJSON
  | UpdateConfigMode.UpdateTokenInfoExpHeuristicJSON
  | UpdateConfigMode.UpdateTokenInfoTwapDivergenceJSON
  | UpdateConfigMode.UpdateTokenInfoScopeTwapJSON
  | UpdateConfigMode.UpdateTokenInfoScopeChainJSON
  | UpdateConfigMode.UpdateTokenInfoNameJSON
  | UpdateConfigMode.UpdateTokenInfoPriceMaxAgeJSON
  | UpdateConfigMode.UpdateTokenInfoTwapMaxAgeJSON
  | UpdateConfigMode.UpdateScopePriceFeedJSON
  | UpdateConfigMode.UpdatePythPriceJSON
  | UpdateConfigMode.UpdateSwitchboardFeedJSON
  | UpdateConfigMode.UpdateSwitchboardTwapFeedJSON
  | UpdateConfigMode.UpdateBorrowRateCurveJSON
  | UpdateConfigMode.UpdateEntireReserveConfigJSON
  | UpdateConfigMode.UpdateDebtWithdrawalCapJSON
  | UpdateConfigMode.UpdateDepositWithdrawalCapJSON
  | UpdateConfigMode.DeprecatedUpdateDebtWithdrawalCapCurrentTotalJSON
  | UpdateConfigMode.DeprecatedUpdateDepositWithdrawalCapCurrentTotalJSON
  | UpdateConfigMode.UpdateBadDebtLiquidationBonusBpsJSON
  | UpdateConfigMode.UpdateMinLiquidationBonusBpsJSON
  | UpdateConfigMode.UpdateDeleveragingMarginCallPeriodJSON
  | UpdateConfigMode.UpdateBorrowFactorJSON
  | UpdateConfigMode.UpdateAssetTierJSON
  | UpdateConfigMode.UpdateElevationGroupJSON
  | UpdateConfigMode.UpdateDeleveragingThresholdDecreaseBpsPerDayJSON
  | UpdateConfigMode.DeprecatedUpdateMultiplierSideBoostJSON
  | UpdateConfigMode.DeprecatedUpdateMultiplierTagBoostJSON
  | UpdateConfigMode.UpdateReserveStatusJSON
  | UpdateConfigMode.UpdateFarmCollateralJSON
  | UpdateConfigMode.UpdateFarmDebtJSON
  | UpdateConfigMode.UpdateDisableUsageAsCollateralOutsideEmodeJSON
  | UpdateConfigMode.UpdateBlockBorrowingAboveUtilizationPctJSON
  | UpdateConfigMode.UpdateBlockPriceUsageJSON
  | UpdateConfigMode.UpdateBorrowLimitOutsideElevationGroupJSON
  | UpdateConfigMode.UpdateBorrowLimitsInElevationGroupAgainstThisReserveJSON
  | UpdateConfigMode.UpdateHostFixedInterestRateBpsJSON
  | UpdateConfigMode.UpdateAutodeleverageEnabledJSON
  | UpdateConfigMode.UpdateDeleveragingBonusIncreaseBpsPerDayJSON
  | UpdateConfigMode.UpdateProtocolOrderExecutionFeeJSON

export { UpdateLendingMarketConfigValue }

export type UpdateLendingMarketConfigValueKind =
  | UpdateLendingMarketConfigValue.Bool
  | UpdateLendingMarketConfigValue.U8
  | UpdateLendingMarketConfigValue.U8Array
  | UpdateLendingMarketConfigValue.U16
  | UpdateLendingMarketConfigValue.U64
  | UpdateLendingMarketConfigValue.U128
  | UpdateLendingMarketConfigValue.Pubkey
  | UpdateLendingMarketConfigValue.ElevationGroup
  | UpdateLendingMarketConfigValue.Name
export type UpdateLendingMarketConfigValueJSON =
  | UpdateLendingMarketConfigValue.BoolJSON
  | UpdateLendingMarketConfigValue.U8JSON
  | UpdateLendingMarketConfigValue.U8ArrayJSON
  | UpdateLendingMarketConfigValue.U16JSON
  | UpdateLendingMarketConfigValue.U64JSON
  | UpdateLendingMarketConfigValue.U128JSON
  | UpdateLendingMarketConfigValue.PubkeyJSON
  | UpdateLendingMarketConfigValue.ElevationGroupJSON
  | UpdateLendingMarketConfigValue.NameJSON

export { UpdateLendingMarketMode }

export type UpdateLendingMarketModeKind =
  | UpdateLendingMarketMode.UpdateOwner
  | UpdateLendingMarketMode.UpdateEmergencyMode
  | UpdateLendingMarketMode.UpdateLiquidationCloseFactor
  | UpdateLendingMarketMode.UpdateLiquidationMaxValue
  | UpdateLendingMarketMode.DeprecatedUpdateGlobalUnhealthyBorrow
  | UpdateLendingMarketMode.UpdateGlobalAllowedBorrow
  | UpdateLendingMarketMode.UpdateRiskCouncil
  | UpdateLendingMarketMode.UpdateMinFullLiquidationThreshold
  | UpdateLendingMarketMode.UpdateInsolvencyRiskLtv
  | UpdateLendingMarketMode.UpdateElevationGroup
  | UpdateLendingMarketMode.UpdateReferralFeeBps
  | UpdateLendingMarketMode.DeprecatedUpdateMultiplierPoints
  | UpdateLendingMarketMode.UpdatePriceRefreshTriggerToMaxAgePct
  | UpdateLendingMarketMode.UpdateAutodeleverageEnabled
  | UpdateLendingMarketMode.UpdateBorrowingDisabled
  | UpdateLendingMarketMode.UpdateMinNetValueObligationPostAction
  | UpdateLendingMarketMode.UpdateMinValueLtvSkipPriorityLiqCheck
  | UpdateLendingMarketMode.UpdateMinValueBfSkipPriorityLiqCheck
  | UpdateLendingMarketMode.UpdatePaddingFields
  | UpdateLendingMarketMode.UpdateName
  | UpdateLendingMarketMode.UpdateIndividualAutodeleverageMarginCallPeriodSecs
  | UpdateLendingMarketMode.UpdateInitialDepositAmount
  | UpdateLendingMarketMode.UpdateObligationOrderExecutionEnabled
  | UpdateLendingMarketMode.UpdateImmutableFlag
  | UpdateLendingMarketMode.UpdateObligationOrderCreationEnabled
export type UpdateLendingMarketModeJSON =
  | UpdateLendingMarketMode.UpdateOwnerJSON
  | UpdateLendingMarketMode.UpdateEmergencyModeJSON
  | UpdateLendingMarketMode.UpdateLiquidationCloseFactorJSON
  | UpdateLendingMarketMode.UpdateLiquidationMaxValueJSON
  | UpdateLendingMarketMode.DeprecatedUpdateGlobalUnhealthyBorrowJSON
  | UpdateLendingMarketMode.UpdateGlobalAllowedBorrowJSON
  | UpdateLendingMarketMode.UpdateRiskCouncilJSON
  | UpdateLendingMarketMode.UpdateMinFullLiquidationThresholdJSON
  | UpdateLendingMarketMode.UpdateInsolvencyRiskLtvJSON
  | UpdateLendingMarketMode.UpdateElevationGroupJSON
  | UpdateLendingMarketMode.UpdateReferralFeeBpsJSON
  | UpdateLendingMarketMode.DeprecatedUpdateMultiplierPointsJSON
  | UpdateLendingMarketMode.UpdatePriceRefreshTriggerToMaxAgePctJSON
  | UpdateLendingMarketMode.UpdateAutodeleverageEnabledJSON
  | UpdateLendingMarketMode.UpdateBorrowingDisabledJSON
  | UpdateLendingMarketMode.UpdateMinNetValueObligationPostActionJSON
  | UpdateLendingMarketMode.UpdateMinValueLtvSkipPriorityLiqCheckJSON
  | UpdateLendingMarketMode.UpdateMinValueBfSkipPriorityLiqCheckJSON
  | UpdateLendingMarketMode.UpdatePaddingFieldsJSON
  | UpdateLendingMarketMode.UpdateNameJSON
  | UpdateLendingMarketMode.UpdateIndividualAutodeleverageMarginCallPeriodSecsJSON
  | UpdateLendingMarketMode.UpdateInitialDepositAmountJSON
  | UpdateLendingMarketMode.UpdateObligationOrderExecutionEnabledJSON
  | UpdateLendingMarketMode.UpdateImmutableFlagJSON
  | UpdateLendingMarketMode.UpdateObligationOrderCreationEnabledJSON

export { UpdateGlobalConfigMode }

export type UpdateGlobalConfigModeKind =
  | UpdateGlobalConfigMode.PendingAdmin
  | UpdateGlobalConfigMode.FeeCollector
export type UpdateGlobalConfigModeJSON =
  | UpdateGlobalConfigMode.PendingAdminJSON
  | UpdateGlobalConfigMode.FeeCollectorJSON

export { LastUpdate } from "./LastUpdate"
export type { LastUpdateFields, LastUpdateJSON } from "./LastUpdate"
export { ElevationGroup } from "./ElevationGroup"
export type { ElevationGroupFields, ElevationGroupJSON } from "./ElevationGroup"
export { InitObligationArgs } from "./InitObligationArgs"
export type {
  InitObligationArgsFields,
  InitObligationArgsJSON,
} from "./InitObligationArgs"
export { ObligationCollateral } from "./ObligationCollateral"
export type {
  ObligationCollateralFields,
  ObligationCollateralJSON,
} from "./ObligationCollateral"
export { ObligationLiquidity } from "./ObligationLiquidity"
export type {
  ObligationLiquidityFields,
  ObligationLiquidityJSON,
} from "./ObligationLiquidity"
export { ObligationOrder } from "./ObligationOrder"
export type {
  ObligationOrderFields,
  ObligationOrderJSON,
} from "./ObligationOrder"
export { AssetTier }

export type AssetTierKind =
  | AssetTier.Regular
  | AssetTier.IsolatedCollateral
  | AssetTier.IsolatedDebt
export type AssetTierJSON =
  | AssetTier.RegularJSON
  | AssetTier.IsolatedCollateralJSON
  | AssetTier.IsolatedDebtJSON

export { BigFractionBytes } from "./BigFractionBytes"
export type {
  BigFractionBytesFields,
  BigFractionBytesJSON,
} from "./BigFractionBytes"
export { FeeCalculation }

/** Calculate fees exlusive or inclusive of an amount */
export type FeeCalculationKind =
  | FeeCalculation.Exclusive
  | FeeCalculation.Inclusive
export type FeeCalculationJSON =
  | FeeCalculation.ExclusiveJSON
  | FeeCalculation.InclusiveJSON

export { ReserveCollateral } from "./ReserveCollateral"
export type {
  ReserveCollateralFields,
  ReserveCollateralJSON,
} from "./ReserveCollateral"
export { ReserveConfig } from "./ReserveConfig"
export type { ReserveConfigFields, ReserveConfigJSON } from "./ReserveConfig"
export { ReserveFarmKind }

export type ReserveFarmKindKind =
  | ReserveFarmKind.Collateral
  | ReserveFarmKind.Debt
export type ReserveFarmKindJSON =
  | ReserveFarmKind.CollateralJSON
  | ReserveFarmKind.DebtJSON

export { ReserveFees } from "./ReserveFees"
export type { ReserveFeesFields, ReserveFeesJSON } from "./ReserveFees"
export { ReserveLiquidity } from "./ReserveLiquidity"
export type {
  ReserveLiquidityFields,
  ReserveLiquidityJSON,
} from "./ReserveLiquidity"
export { ReserveStatus }

export type ReserveStatusKind =
  | ReserveStatus.Active
  | ReserveStatus.Obsolete
  | ReserveStatus.Hidden
export type ReserveStatusJSON =
  | ReserveStatus.ActiveJSON
  | ReserveStatus.ObsoleteJSON
  | ReserveStatus.HiddenJSON

export { WithdrawalCaps } from "./WithdrawalCaps"
export type { WithdrawalCapsFields, WithdrawalCapsJSON } from "./WithdrawalCaps"
export { PriceHeuristic } from "./PriceHeuristic"
export type { PriceHeuristicFields, PriceHeuristicJSON } from "./PriceHeuristic"
export { PythConfiguration } from "./PythConfiguration"
export type {
  PythConfigurationFields,
  PythConfigurationJSON,
} from "./PythConfiguration"
export { ScopeConfiguration } from "./ScopeConfiguration"
export type {
  ScopeConfigurationFields,
  ScopeConfigurationJSON,
} from "./ScopeConfiguration"
export { SwitchboardConfiguration } from "./SwitchboardConfiguration"
export type {
  SwitchboardConfigurationFields,
  SwitchboardConfigurationJSON,
} from "./SwitchboardConfiguration"
export { TokenInfo } from "./TokenInfo"
export type { TokenInfoFields, TokenInfoJSON } from "./TokenInfo"
export { BorrowRateCurve } from "./BorrowRateCurve"
export type {
  BorrowRateCurveFields,
  BorrowRateCurveJSON,
} from "./BorrowRateCurve"
export { CurvePoint } from "./CurvePoint"
export type { CurvePointFields, CurvePointJSON } from "./CurvePoint"
