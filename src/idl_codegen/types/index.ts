import * as UpdateConfigMode from "./UpdateConfigMode"
import * as UpdateLendingMarketConfigValue from "./UpdateLendingMarketConfigValue"
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
  | UpdateConfigMode.UpdateFeesReferralFeeBps
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
  | UpdateConfigMode.UpdateDebtWithdrawalCapCurrentTotal
  | UpdateConfigMode.UpdateDepositWithdrawalCapCurrentTotal
  | UpdateConfigMode.UpdateBadDebtLiquidationBonusBps
  | UpdateConfigMode.UpdateMinLiquidationBonusBps
  | UpdateConfigMode.DeleveragingMarginCallPeriod
  | UpdateConfigMode.UpdateBorrowFactor
  | UpdateConfigMode.UpdateAssetTier
  | UpdateConfigMode.UpdateElevationGroup
  | UpdateConfigMode.DeleveragingThresholdSlotsPerBps
  | UpdateConfigMode.UpdateMultiplierSideBoost
  | UpdateConfigMode.UpdateMultiplierTagBoost
  | UpdateConfigMode.UpdateReserveStatus
  | UpdateConfigMode.UpdateFarmCollateral
  | UpdateConfigMode.UpdateFarmDebt
export type UpdateConfigModeJSON =
  | UpdateConfigMode.UpdateLoanToValuePctJSON
  | UpdateConfigMode.UpdateMaxLiquidationBonusBpsJSON
  | UpdateConfigMode.UpdateLiquidationThresholdPctJSON
  | UpdateConfigMode.UpdateProtocolLiquidationFeeJSON
  | UpdateConfigMode.UpdateProtocolTakeRateJSON
  | UpdateConfigMode.UpdateFeesBorrowFeeJSON
  | UpdateConfigMode.UpdateFeesFlashLoanFeeJSON
  | UpdateConfigMode.UpdateFeesReferralFeeBpsJSON
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
  | UpdateConfigMode.UpdateDebtWithdrawalCapCurrentTotalJSON
  | UpdateConfigMode.UpdateDepositWithdrawalCapCurrentTotalJSON
  | UpdateConfigMode.UpdateBadDebtLiquidationBonusBpsJSON
  | UpdateConfigMode.UpdateMinLiquidationBonusBpsJSON
  | UpdateConfigMode.DeleveragingMarginCallPeriodJSON
  | UpdateConfigMode.UpdateBorrowFactorJSON
  | UpdateConfigMode.UpdateAssetTierJSON
  | UpdateConfigMode.UpdateElevationGroupJSON
  | UpdateConfigMode.DeleveragingThresholdSlotsPerBpsJSON
  | UpdateConfigMode.UpdateMultiplierSideBoostJSON
  | UpdateConfigMode.UpdateMultiplierTagBoostJSON
  | UpdateConfigMode.UpdateReserveStatusJSON
  | UpdateConfigMode.UpdateFarmCollateralJSON
  | UpdateConfigMode.UpdateFarmDebtJSON

export { UpdateLendingMarketConfigValue }

export type UpdateLendingMarketConfigValueKind =
  | UpdateLendingMarketConfigValue.Bool
  | UpdateLendingMarketConfigValue.U8
  | UpdateLendingMarketConfigValue.U8Array
  | UpdateLendingMarketConfigValue.U16
  | UpdateLendingMarketConfigValue.U64
  | UpdateLendingMarketConfigValue.Pubkey
  | UpdateLendingMarketConfigValue.ElevationGroup
export type UpdateLendingMarketConfigValueJSON =
  | UpdateLendingMarketConfigValue.BoolJSON
  | UpdateLendingMarketConfigValue.U8JSON
  | UpdateLendingMarketConfigValue.U8ArrayJSON
  | UpdateLendingMarketConfigValue.U16JSON
  | UpdateLendingMarketConfigValue.U64JSON
  | UpdateLendingMarketConfigValue.PubkeyJSON
  | UpdateLendingMarketConfigValue.ElevationGroupJSON

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
