import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface UpdateLoanToValuePctJSON {
  kind: "UpdateLoanToValuePct"
}

export class UpdateLoanToValuePct {
  static readonly discriminator = 0
  static readonly kind = "UpdateLoanToValuePct"
  readonly discriminator = 0
  readonly kind = "UpdateLoanToValuePct"

  toJSON(): UpdateLoanToValuePctJSON {
    return {
      kind: "UpdateLoanToValuePct",
    }
  }

  toEncodable() {
    return {
      UpdateLoanToValuePct: {},
    }
  }
}

export interface UpdateMaxLiquidationBonusBpsJSON {
  kind: "UpdateMaxLiquidationBonusBps"
}

export class UpdateMaxLiquidationBonusBps {
  static readonly discriminator = 1
  static readonly kind = "UpdateMaxLiquidationBonusBps"
  readonly discriminator = 1
  readonly kind = "UpdateMaxLiquidationBonusBps"

  toJSON(): UpdateMaxLiquidationBonusBpsJSON {
    return {
      kind: "UpdateMaxLiquidationBonusBps",
    }
  }

  toEncodable() {
    return {
      UpdateMaxLiquidationBonusBps: {},
    }
  }
}

export interface UpdateLiquidationThresholdPctJSON {
  kind: "UpdateLiquidationThresholdPct"
}

export class UpdateLiquidationThresholdPct {
  static readonly discriminator = 2
  static readonly kind = "UpdateLiquidationThresholdPct"
  readonly discriminator = 2
  readonly kind = "UpdateLiquidationThresholdPct"

  toJSON(): UpdateLiquidationThresholdPctJSON {
    return {
      kind: "UpdateLiquidationThresholdPct",
    }
  }

  toEncodable() {
    return {
      UpdateLiquidationThresholdPct: {},
    }
  }
}

export interface UpdateProtocolLiquidationFeeJSON {
  kind: "UpdateProtocolLiquidationFee"
}

export class UpdateProtocolLiquidationFee {
  static readonly discriminator = 3
  static readonly kind = "UpdateProtocolLiquidationFee"
  readonly discriminator = 3
  readonly kind = "UpdateProtocolLiquidationFee"

  toJSON(): UpdateProtocolLiquidationFeeJSON {
    return {
      kind: "UpdateProtocolLiquidationFee",
    }
  }

  toEncodable() {
    return {
      UpdateProtocolLiquidationFee: {},
    }
  }
}

export interface UpdateProtocolTakeRateJSON {
  kind: "UpdateProtocolTakeRate"
}

export class UpdateProtocolTakeRate {
  static readonly discriminator = 4
  static readonly kind = "UpdateProtocolTakeRate"
  readonly discriminator = 4
  readonly kind = "UpdateProtocolTakeRate"

  toJSON(): UpdateProtocolTakeRateJSON {
    return {
      kind: "UpdateProtocolTakeRate",
    }
  }

  toEncodable() {
    return {
      UpdateProtocolTakeRate: {},
    }
  }
}

export interface UpdateFeesBorrowFeeJSON {
  kind: "UpdateFeesBorrowFee"
}

export class UpdateFeesBorrowFee {
  static readonly discriminator = 5
  static readonly kind = "UpdateFeesBorrowFee"
  readonly discriminator = 5
  readonly kind = "UpdateFeesBorrowFee"

  toJSON(): UpdateFeesBorrowFeeJSON {
    return {
      kind: "UpdateFeesBorrowFee",
    }
  }

  toEncodable() {
    return {
      UpdateFeesBorrowFee: {},
    }
  }
}

export interface UpdateFeesFlashLoanFeeJSON {
  kind: "UpdateFeesFlashLoanFee"
}

export class UpdateFeesFlashLoanFee {
  static readonly discriminator = 6
  static readonly kind = "UpdateFeesFlashLoanFee"
  readonly discriminator = 6
  readonly kind = "UpdateFeesFlashLoanFee"

  toJSON(): UpdateFeesFlashLoanFeeJSON {
    return {
      kind: "UpdateFeesFlashLoanFee",
    }
  }

  toEncodable() {
    return {
      UpdateFeesFlashLoanFee: {},
    }
  }
}

export interface DeprecatedUpdateFeesReferralFeeBpsJSON {
  kind: "DeprecatedUpdateFeesReferralFeeBps"
}

export class DeprecatedUpdateFeesReferralFeeBps {
  static readonly discriminator = 7
  static readonly kind = "DeprecatedUpdateFeesReferralFeeBps"
  readonly discriminator = 7
  readonly kind = "DeprecatedUpdateFeesReferralFeeBps"

  toJSON(): DeprecatedUpdateFeesReferralFeeBpsJSON {
    return {
      kind: "DeprecatedUpdateFeesReferralFeeBps",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateFeesReferralFeeBps: {},
    }
  }
}

export interface UpdateDepositLimitJSON {
  kind: "UpdateDepositLimit"
}

export class UpdateDepositLimit {
  static readonly discriminator = 8
  static readonly kind = "UpdateDepositLimit"
  readonly discriminator = 8
  readonly kind = "UpdateDepositLimit"

  toJSON(): UpdateDepositLimitJSON {
    return {
      kind: "UpdateDepositLimit",
    }
  }

  toEncodable() {
    return {
      UpdateDepositLimit: {},
    }
  }
}

export interface UpdateBorrowLimitJSON {
  kind: "UpdateBorrowLimit"
}

export class UpdateBorrowLimit {
  static readonly discriminator = 9
  static readonly kind = "UpdateBorrowLimit"
  readonly discriminator = 9
  readonly kind = "UpdateBorrowLimit"

  toJSON(): UpdateBorrowLimitJSON {
    return {
      kind: "UpdateBorrowLimit",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowLimit: {},
    }
  }
}

export interface UpdateTokenInfoLowerHeuristicJSON {
  kind: "UpdateTokenInfoLowerHeuristic"
}

export class UpdateTokenInfoLowerHeuristic {
  static readonly discriminator = 10
  static readonly kind = "UpdateTokenInfoLowerHeuristic"
  readonly discriminator = 10
  readonly kind = "UpdateTokenInfoLowerHeuristic"

  toJSON(): UpdateTokenInfoLowerHeuristicJSON {
    return {
      kind: "UpdateTokenInfoLowerHeuristic",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoLowerHeuristic: {},
    }
  }
}

export interface UpdateTokenInfoUpperHeuristicJSON {
  kind: "UpdateTokenInfoUpperHeuristic"
}

export class UpdateTokenInfoUpperHeuristic {
  static readonly discriminator = 11
  static readonly kind = "UpdateTokenInfoUpperHeuristic"
  readonly discriminator = 11
  readonly kind = "UpdateTokenInfoUpperHeuristic"

  toJSON(): UpdateTokenInfoUpperHeuristicJSON {
    return {
      kind: "UpdateTokenInfoUpperHeuristic",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoUpperHeuristic: {},
    }
  }
}

export interface UpdateTokenInfoExpHeuristicJSON {
  kind: "UpdateTokenInfoExpHeuristic"
}

export class UpdateTokenInfoExpHeuristic {
  static readonly discriminator = 12
  static readonly kind = "UpdateTokenInfoExpHeuristic"
  readonly discriminator = 12
  readonly kind = "UpdateTokenInfoExpHeuristic"

  toJSON(): UpdateTokenInfoExpHeuristicJSON {
    return {
      kind: "UpdateTokenInfoExpHeuristic",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoExpHeuristic: {},
    }
  }
}

export interface UpdateTokenInfoTwapDivergenceJSON {
  kind: "UpdateTokenInfoTwapDivergence"
}

export class UpdateTokenInfoTwapDivergence {
  static readonly discriminator = 13
  static readonly kind = "UpdateTokenInfoTwapDivergence"
  readonly discriminator = 13
  readonly kind = "UpdateTokenInfoTwapDivergence"

  toJSON(): UpdateTokenInfoTwapDivergenceJSON {
    return {
      kind: "UpdateTokenInfoTwapDivergence",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoTwapDivergence: {},
    }
  }
}

export interface UpdateTokenInfoScopeTwapJSON {
  kind: "UpdateTokenInfoScopeTwap"
}

export class UpdateTokenInfoScopeTwap {
  static readonly discriminator = 14
  static readonly kind = "UpdateTokenInfoScopeTwap"
  readonly discriminator = 14
  readonly kind = "UpdateTokenInfoScopeTwap"

  toJSON(): UpdateTokenInfoScopeTwapJSON {
    return {
      kind: "UpdateTokenInfoScopeTwap",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoScopeTwap: {},
    }
  }
}

export interface UpdateTokenInfoScopeChainJSON {
  kind: "UpdateTokenInfoScopeChain"
}

export class UpdateTokenInfoScopeChain {
  static readonly discriminator = 15
  static readonly kind = "UpdateTokenInfoScopeChain"
  readonly discriminator = 15
  readonly kind = "UpdateTokenInfoScopeChain"

  toJSON(): UpdateTokenInfoScopeChainJSON {
    return {
      kind: "UpdateTokenInfoScopeChain",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoScopeChain: {},
    }
  }
}

export interface UpdateTokenInfoNameJSON {
  kind: "UpdateTokenInfoName"
}

export class UpdateTokenInfoName {
  static readonly discriminator = 16
  static readonly kind = "UpdateTokenInfoName"
  readonly discriminator = 16
  readonly kind = "UpdateTokenInfoName"

  toJSON(): UpdateTokenInfoNameJSON {
    return {
      kind: "UpdateTokenInfoName",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoName: {},
    }
  }
}

export interface UpdateTokenInfoPriceMaxAgeJSON {
  kind: "UpdateTokenInfoPriceMaxAge"
}

export class UpdateTokenInfoPriceMaxAge {
  static readonly discriminator = 17
  static readonly kind = "UpdateTokenInfoPriceMaxAge"
  readonly discriminator = 17
  readonly kind = "UpdateTokenInfoPriceMaxAge"

  toJSON(): UpdateTokenInfoPriceMaxAgeJSON {
    return {
      kind: "UpdateTokenInfoPriceMaxAge",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoPriceMaxAge: {},
    }
  }
}

export interface UpdateTokenInfoTwapMaxAgeJSON {
  kind: "UpdateTokenInfoTwapMaxAge"
}

export class UpdateTokenInfoTwapMaxAge {
  static readonly discriminator = 18
  static readonly kind = "UpdateTokenInfoTwapMaxAge"
  readonly discriminator = 18
  readonly kind = "UpdateTokenInfoTwapMaxAge"

  toJSON(): UpdateTokenInfoTwapMaxAgeJSON {
    return {
      kind: "UpdateTokenInfoTwapMaxAge",
    }
  }

  toEncodable() {
    return {
      UpdateTokenInfoTwapMaxAge: {},
    }
  }
}

export interface UpdateScopePriceFeedJSON {
  kind: "UpdateScopePriceFeed"
}

export class UpdateScopePriceFeed {
  static readonly discriminator = 19
  static readonly kind = "UpdateScopePriceFeed"
  readonly discriminator = 19
  readonly kind = "UpdateScopePriceFeed"

  toJSON(): UpdateScopePriceFeedJSON {
    return {
      kind: "UpdateScopePriceFeed",
    }
  }

  toEncodable() {
    return {
      UpdateScopePriceFeed: {},
    }
  }
}

export interface UpdatePythPriceJSON {
  kind: "UpdatePythPrice"
}

export class UpdatePythPrice {
  static readonly discriminator = 20
  static readonly kind = "UpdatePythPrice"
  readonly discriminator = 20
  readonly kind = "UpdatePythPrice"

  toJSON(): UpdatePythPriceJSON {
    return {
      kind: "UpdatePythPrice",
    }
  }

  toEncodable() {
    return {
      UpdatePythPrice: {},
    }
  }
}

export interface UpdateSwitchboardFeedJSON {
  kind: "UpdateSwitchboardFeed"
}

export class UpdateSwitchboardFeed {
  static readonly discriminator = 21
  static readonly kind = "UpdateSwitchboardFeed"
  readonly discriminator = 21
  readonly kind = "UpdateSwitchboardFeed"

  toJSON(): UpdateSwitchboardFeedJSON {
    return {
      kind: "UpdateSwitchboardFeed",
    }
  }

  toEncodable() {
    return {
      UpdateSwitchboardFeed: {},
    }
  }
}

export interface UpdateSwitchboardTwapFeedJSON {
  kind: "UpdateSwitchboardTwapFeed"
}

export class UpdateSwitchboardTwapFeed {
  static readonly discriminator = 22
  static readonly kind = "UpdateSwitchboardTwapFeed"
  readonly discriminator = 22
  readonly kind = "UpdateSwitchboardTwapFeed"

  toJSON(): UpdateSwitchboardTwapFeedJSON {
    return {
      kind: "UpdateSwitchboardTwapFeed",
    }
  }

  toEncodable() {
    return {
      UpdateSwitchboardTwapFeed: {},
    }
  }
}

export interface UpdateBorrowRateCurveJSON {
  kind: "UpdateBorrowRateCurve"
}

export class UpdateBorrowRateCurve {
  static readonly discriminator = 23
  static readonly kind = "UpdateBorrowRateCurve"
  readonly discriminator = 23
  readonly kind = "UpdateBorrowRateCurve"

  toJSON(): UpdateBorrowRateCurveJSON {
    return {
      kind: "UpdateBorrowRateCurve",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowRateCurve: {},
    }
  }
}

export interface UpdateEntireReserveConfigJSON {
  kind: "UpdateEntireReserveConfig"
}

export class UpdateEntireReserveConfig {
  static readonly discriminator = 24
  static readonly kind = "UpdateEntireReserveConfig"
  readonly discriminator = 24
  readonly kind = "UpdateEntireReserveConfig"

  toJSON(): UpdateEntireReserveConfigJSON {
    return {
      kind: "UpdateEntireReserveConfig",
    }
  }

  toEncodable() {
    return {
      UpdateEntireReserveConfig: {},
    }
  }
}

export interface UpdateDebtWithdrawalCapJSON {
  kind: "UpdateDebtWithdrawalCap"
}

export class UpdateDebtWithdrawalCap {
  static readonly discriminator = 25
  static readonly kind = "UpdateDebtWithdrawalCap"
  readonly discriminator = 25
  readonly kind = "UpdateDebtWithdrawalCap"

  toJSON(): UpdateDebtWithdrawalCapJSON {
    return {
      kind: "UpdateDebtWithdrawalCap",
    }
  }

  toEncodable() {
    return {
      UpdateDebtWithdrawalCap: {},
    }
  }
}

export interface UpdateDepositWithdrawalCapJSON {
  kind: "UpdateDepositWithdrawalCap"
}

export class UpdateDepositWithdrawalCap {
  static readonly discriminator = 26
  static readonly kind = "UpdateDepositWithdrawalCap"
  readonly discriminator = 26
  readonly kind = "UpdateDepositWithdrawalCap"

  toJSON(): UpdateDepositWithdrawalCapJSON {
    return {
      kind: "UpdateDepositWithdrawalCap",
    }
  }

  toEncodable() {
    return {
      UpdateDepositWithdrawalCap: {},
    }
  }
}

export interface DeprecatedUpdateDebtWithdrawalCapCurrentTotalJSON {
  kind: "DeprecatedUpdateDebtWithdrawalCapCurrentTotal"
}

export class DeprecatedUpdateDebtWithdrawalCapCurrentTotal {
  static readonly discriminator = 27
  static readonly kind = "DeprecatedUpdateDebtWithdrawalCapCurrentTotal"
  readonly discriminator = 27
  readonly kind = "DeprecatedUpdateDebtWithdrawalCapCurrentTotal"

  toJSON(): DeprecatedUpdateDebtWithdrawalCapCurrentTotalJSON {
    return {
      kind: "DeprecatedUpdateDebtWithdrawalCapCurrentTotal",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateDebtWithdrawalCapCurrentTotal: {},
    }
  }
}

export interface DeprecatedUpdateDepositWithdrawalCapCurrentTotalJSON {
  kind: "DeprecatedUpdateDepositWithdrawalCapCurrentTotal"
}

export class DeprecatedUpdateDepositWithdrawalCapCurrentTotal {
  static readonly discriminator = 28
  static readonly kind = "DeprecatedUpdateDepositWithdrawalCapCurrentTotal"
  readonly discriminator = 28
  readonly kind = "DeprecatedUpdateDepositWithdrawalCapCurrentTotal"

  toJSON(): DeprecatedUpdateDepositWithdrawalCapCurrentTotalJSON {
    return {
      kind: "DeprecatedUpdateDepositWithdrawalCapCurrentTotal",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateDepositWithdrawalCapCurrentTotal: {},
    }
  }
}

export interface UpdateBadDebtLiquidationBonusBpsJSON {
  kind: "UpdateBadDebtLiquidationBonusBps"
}

export class UpdateBadDebtLiquidationBonusBps {
  static readonly discriminator = 29
  static readonly kind = "UpdateBadDebtLiquidationBonusBps"
  readonly discriminator = 29
  readonly kind = "UpdateBadDebtLiquidationBonusBps"

  toJSON(): UpdateBadDebtLiquidationBonusBpsJSON {
    return {
      kind: "UpdateBadDebtLiquidationBonusBps",
    }
  }

  toEncodable() {
    return {
      UpdateBadDebtLiquidationBonusBps: {},
    }
  }
}

export interface UpdateMinLiquidationBonusBpsJSON {
  kind: "UpdateMinLiquidationBonusBps"
}

export class UpdateMinLiquidationBonusBps {
  static readonly discriminator = 30
  static readonly kind = "UpdateMinLiquidationBonusBps"
  readonly discriminator = 30
  readonly kind = "UpdateMinLiquidationBonusBps"

  toJSON(): UpdateMinLiquidationBonusBpsJSON {
    return {
      kind: "UpdateMinLiquidationBonusBps",
    }
  }

  toEncodable() {
    return {
      UpdateMinLiquidationBonusBps: {},
    }
  }
}

export interface UpdateDeleveragingMarginCallPeriodJSON {
  kind: "UpdateDeleveragingMarginCallPeriod"
}

export class UpdateDeleveragingMarginCallPeriod {
  static readonly discriminator = 31
  static readonly kind = "UpdateDeleveragingMarginCallPeriod"
  readonly discriminator = 31
  readonly kind = "UpdateDeleveragingMarginCallPeriod"

  toJSON(): UpdateDeleveragingMarginCallPeriodJSON {
    return {
      kind: "UpdateDeleveragingMarginCallPeriod",
    }
  }

  toEncodable() {
    return {
      UpdateDeleveragingMarginCallPeriod: {},
    }
  }
}

export interface UpdateBorrowFactorJSON {
  kind: "UpdateBorrowFactor"
}

export class UpdateBorrowFactor {
  static readonly discriminator = 32
  static readonly kind = "UpdateBorrowFactor"
  readonly discriminator = 32
  readonly kind = "UpdateBorrowFactor"

  toJSON(): UpdateBorrowFactorJSON {
    return {
      kind: "UpdateBorrowFactor",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowFactor: {},
    }
  }
}

export interface UpdateAssetTierJSON {
  kind: "UpdateAssetTier"
}

export class UpdateAssetTier {
  static readonly discriminator = 33
  static readonly kind = "UpdateAssetTier"
  readonly discriminator = 33
  readonly kind = "UpdateAssetTier"

  toJSON(): UpdateAssetTierJSON {
    return {
      kind: "UpdateAssetTier",
    }
  }

  toEncodable() {
    return {
      UpdateAssetTier: {},
    }
  }
}

export interface UpdateElevationGroupJSON {
  kind: "UpdateElevationGroup"
}

export class UpdateElevationGroup {
  static readonly discriminator = 34
  static readonly kind = "UpdateElevationGroup"
  readonly discriminator = 34
  readonly kind = "UpdateElevationGroup"

  toJSON(): UpdateElevationGroupJSON {
    return {
      kind: "UpdateElevationGroup",
    }
  }

  toEncodable() {
    return {
      UpdateElevationGroup: {},
    }
  }
}

export interface UpdateDeleveragingThresholdDecreaseBpsPerDayJSON {
  kind: "UpdateDeleveragingThresholdDecreaseBpsPerDay"
}

export class UpdateDeleveragingThresholdDecreaseBpsPerDay {
  static readonly discriminator = 35
  static readonly kind = "UpdateDeleveragingThresholdDecreaseBpsPerDay"
  readonly discriminator = 35
  readonly kind = "UpdateDeleveragingThresholdDecreaseBpsPerDay"

  toJSON(): UpdateDeleveragingThresholdDecreaseBpsPerDayJSON {
    return {
      kind: "UpdateDeleveragingThresholdDecreaseBpsPerDay",
    }
  }

  toEncodable() {
    return {
      UpdateDeleveragingThresholdDecreaseBpsPerDay: {},
    }
  }
}

export interface DeprecatedUpdateMultiplierSideBoostJSON {
  kind: "DeprecatedUpdateMultiplierSideBoost"
}

export class DeprecatedUpdateMultiplierSideBoost {
  static readonly discriminator = 36
  static readonly kind = "DeprecatedUpdateMultiplierSideBoost"
  readonly discriminator = 36
  readonly kind = "DeprecatedUpdateMultiplierSideBoost"

  toJSON(): DeprecatedUpdateMultiplierSideBoostJSON {
    return {
      kind: "DeprecatedUpdateMultiplierSideBoost",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateMultiplierSideBoost: {},
    }
  }
}

export interface DeprecatedUpdateMultiplierTagBoostJSON {
  kind: "DeprecatedUpdateMultiplierTagBoost"
}

export class DeprecatedUpdateMultiplierTagBoost {
  static readonly discriminator = 37
  static readonly kind = "DeprecatedUpdateMultiplierTagBoost"
  readonly discriminator = 37
  readonly kind = "DeprecatedUpdateMultiplierTagBoost"

  toJSON(): DeprecatedUpdateMultiplierTagBoostJSON {
    return {
      kind: "DeprecatedUpdateMultiplierTagBoost",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateMultiplierTagBoost: {},
    }
  }
}

export interface UpdateReserveStatusJSON {
  kind: "UpdateReserveStatus"
}

export class UpdateReserveStatus {
  static readonly discriminator = 38
  static readonly kind = "UpdateReserveStatus"
  readonly discriminator = 38
  readonly kind = "UpdateReserveStatus"

  toJSON(): UpdateReserveStatusJSON {
    return {
      kind: "UpdateReserveStatus",
    }
  }

  toEncodable() {
    return {
      UpdateReserveStatus: {},
    }
  }
}

export interface UpdateFarmCollateralJSON {
  kind: "UpdateFarmCollateral"
}

export class UpdateFarmCollateral {
  static readonly discriminator = 39
  static readonly kind = "UpdateFarmCollateral"
  readonly discriminator = 39
  readonly kind = "UpdateFarmCollateral"

  toJSON(): UpdateFarmCollateralJSON {
    return {
      kind: "UpdateFarmCollateral",
    }
  }

  toEncodable() {
    return {
      UpdateFarmCollateral: {},
    }
  }
}

export interface UpdateFarmDebtJSON {
  kind: "UpdateFarmDebt"
}

export class UpdateFarmDebt {
  static readonly discriminator = 40
  static readonly kind = "UpdateFarmDebt"
  readonly discriminator = 40
  readonly kind = "UpdateFarmDebt"

  toJSON(): UpdateFarmDebtJSON {
    return {
      kind: "UpdateFarmDebt",
    }
  }

  toEncodable() {
    return {
      UpdateFarmDebt: {},
    }
  }
}

export interface UpdateDisableUsageAsCollateralOutsideEmodeJSON {
  kind: "UpdateDisableUsageAsCollateralOutsideEmode"
}

export class UpdateDisableUsageAsCollateralOutsideEmode {
  static readonly discriminator = 41
  static readonly kind = "UpdateDisableUsageAsCollateralOutsideEmode"
  readonly discriminator = 41
  readonly kind = "UpdateDisableUsageAsCollateralOutsideEmode"

  toJSON(): UpdateDisableUsageAsCollateralOutsideEmodeJSON {
    return {
      kind: "UpdateDisableUsageAsCollateralOutsideEmode",
    }
  }

  toEncodable() {
    return {
      UpdateDisableUsageAsCollateralOutsideEmode: {},
    }
  }
}

export interface UpdateBlockBorrowingAboveUtilizationPctJSON {
  kind: "UpdateBlockBorrowingAboveUtilizationPct"
}

export class UpdateBlockBorrowingAboveUtilizationPct {
  static readonly discriminator = 42
  static readonly kind = "UpdateBlockBorrowingAboveUtilizationPct"
  readonly discriminator = 42
  readonly kind = "UpdateBlockBorrowingAboveUtilizationPct"

  toJSON(): UpdateBlockBorrowingAboveUtilizationPctJSON {
    return {
      kind: "UpdateBlockBorrowingAboveUtilizationPct",
    }
  }

  toEncodable() {
    return {
      UpdateBlockBorrowingAboveUtilizationPct: {},
    }
  }
}

export interface UpdateBlockPriceUsageJSON {
  kind: "UpdateBlockPriceUsage"
}

export class UpdateBlockPriceUsage {
  static readonly discriminator = 43
  static readonly kind = "UpdateBlockPriceUsage"
  readonly discriminator = 43
  readonly kind = "UpdateBlockPriceUsage"

  toJSON(): UpdateBlockPriceUsageJSON {
    return {
      kind: "UpdateBlockPriceUsage",
    }
  }

  toEncodable() {
    return {
      UpdateBlockPriceUsage: {},
    }
  }
}

export interface UpdateBorrowLimitOutsideElevationGroupJSON {
  kind: "UpdateBorrowLimitOutsideElevationGroup"
}

export class UpdateBorrowLimitOutsideElevationGroup {
  static readonly discriminator = 44
  static readonly kind = "UpdateBorrowLimitOutsideElevationGroup"
  readonly discriminator = 44
  readonly kind = "UpdateBorrowLimitOutsideElevationGroup"

  toJSON(): UpdateBorrowLimitOutsideElevationGroupJSON {
    return {
      kind: "UpdateBorrowLimitOutsideElevationGroup",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowLimitOutsideElevationGroup: {},
    }
  }
}

export interface UpdateBorrowLimitsInElevationGroupAgainstThisReserveJSON {
  kind: "UpdateBorrowLimitsInElevationGroupAgainstThisReserve"
}

export class UpdateBorrowLimitsInElevationGroupAgainstThisReserve {
  static readonly discriminator = 45
  static readonly kind = "UpdateBorrowLimitsInElevationGroupAgainstThisReserve"
  readonly discriminator = 45
  readonly kind = "UpdateBorrowLimitsInElevationGroupAgainstThisReserve"

  toJSON(): UpdateBorrowLimitsInElevationGroupAgainstThisReserveJSON {
    return {
      kind: "UpdateBorrowLimitsInElevationGroupAgainstThisReserve",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowLimitsInElevationGroupAgainstThisReserve: {},
    }
  }
}

export interface UpdateHostFixedInterestRateBpsJSON {
  kind: "UpdateHostFixedInterestRateBps"
}

export class UpdateHostFixedInterestRateBps {
  static readonly discriminator = 46
  static readonly kind = "UpdateHostFixedInterestRateBps"
  readonly discriminator = 46
  readonly kind = "UpdateHostFixedInterestRateBps"

  toJSON(): UpdateHostFixedInterestRateBpsJSON {
    return {
      kind: "UpdateHostFixedInterestRateBps",
    }
  }

  toEncodable() {
    return {
      UpdateHostFixedInterestRateBps: {},
    }
  }
}

export interface UpdateAutodeleverageEnabledJSON {
  kind: "UpdateAutodeleverageEnabled"
}

export class UpdateAutodeleverageEnabled {
  static readonly discriminator = 47
  static readonly kind = "UpdateAutodeleverageEnabled"
  readonly discriminator = 47
  readonly kind = "UpdateAutodeleverageEnabled"

  toJSON(): UpdateAutodeleverageEnabledJSON {
    return {
      kind: "UpdateAutodeleverageEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateAutodeleverageEnabled: {},
    }
  }
}

export interface UpdateDeleveragingBonusIncreaseBpsPerDayJSON {
  kind: "UpdateDeleveragingBonusIncreaseBpsPerDay"
}

export class UpdateDeleveragingBonusIncreaseBpsPerDay {
  static readonly discriminator = 48
  static readonly kind = "UpdateDeleveragingBonusIncreaseBpsPerDay"
  readonly discriminator = 48
  readonly kind = "UpdateDeleveragingBonusIncreaseBpsPerDay"

  toJSON(): UpdateDeleveragingBonusIncreaseBpsPerDayJSON {
    return {
      kind: "UpdateDeleveragingBonusIncreaseBpsPerDay",
    }
  }

  toEncodable() {
    return {
      UpdateDeleveragingBonusIncreaseBpsPerDay: {},
    }
  }
}

export interface UpdateProtocolOrderExecutionFeeJSON {
  kind: "UpdateProtocolOrderExecutionFee"
}

export class UpdateProtocolOrderExecutionFee {
  static readonly discriminator = 49
  static readonly kind = "UpdateProtocolOrderExecutionFee"
  readonly discriminator = 49
  readonly kind = "UpdateProtocolOrderExecutionFee"

  toJSON(): UpdateProtocolOrderExecutionFeeJSON {
    return {
      kind: "UpdateProtocolOrderExecutionFee",
    }
  }

  toEncodable() {
    return {
      UpdateProtocolOrderExecutionFee: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateConfigModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("UpdateLoanToValuePct" in obj) {
    return new UpdateLoanToValuePct()
  }
  if ("UpdateMaxLiquidationBonusBps" in obj) {
    return new UpdateMaxLiquidationBonusBps()
  }
  if ("UpdateLiquidationThresholdPct" in obj) {
    return new UpdateLiquidationThresholdPct()
  }
  if ("UpdateProtocolLiquidationFee" in obj) {
    return new UpdateProtocolLiquidationFee()
  }
  if ("UpdateProtocolTakeRate" in obj) {
    return new UpdateProtocolTakeRate()
  }
  if ("UpdateFeesBorrowFee" in obj) {
    return new UpdateFeesBorrowFee()
  }
  if ("UpdateFeesFlashLoanFee" in obj) {
    return new UpdateFeesFlashLoanFee()
  }
  if ("DeprecatedUpdateFeesReferralFeeBps" in obj) {
    return new DeprecatedUpdateFeesReferralFeeBps()
  }
  if ("UpdateDepositLimit" in obj) {
    return new UpdateDepositLimit()
  }
  if ("UpdateBorrowLimit" in obj) {
    return new UpdateBorrowLimit()
  }
  if ("UpdateTokenInfoLowerHeuristic" in obj) {
    return new UpdateTokenInfoLowerHeuristic()
  }
  if ("UpdateTokenInfoUpperHeuristic" in obj) {
    return new UpdateTokenInfoUpperHeuristic()
  }
  if ("UpdateTokenInfoExpHeuristic" in obj) {
    return new UpdateTokenInfoExpHeuristic()
  }
  if ("UpdateTokenInfoTwapDivergence" in obj) {
    return new UpdateTokenInfoTwapDivergence()
  }
  if ("UpdateTokenInfoScopeTwap" in obj) {
    return new UpdateTokenInfoScopeTwap()
  }
  if ("UpdateTokenInfoScopeChain" in obj) {
    return new UpdateTokenInfoScopeChain()
  }
  if ("UpdateTokenInfoName" in obj) {
    return new UpdateTokenInfoName()
  }
  if ("UpdateTokenInfoPriceMaxAge" in obj) {
    return new UpdateTokenInfoPriceMaxAge()
  }
  if ("UpdateTokenInfoTwapMaxAge" in obj) {
    return new UpdateTokenInfoTwapMaxAge()
  }
  if ("UpdateScopePriceFeed" in obj) {
    return new UpdateScopePriceFeed()
  }
  if ("UpdatePythPrice" in obj) {
    return new UpdatePythPrice()
  }
  if ("UpdateSwitchboardFeed" in obj) {
    return new UpdateSwitchboardFeed()
  }
  if ("UpdateSwitchboardTwapFeed" in obj) {
    return new UpdateSwitchboardTwapFeed()
  }
  if ("UpdateBorrowRateCurve" in obj) {
    return new UpdateBorrowRateCurve()
  }
  if ("UpdateEntireReserveConfig" in obj) {
    return new UpdateEntireReserveConfig()
  }
  if ("UpdateDebtWithdrawalCap" in obj) {
    return new UpdateDebtWithdrawalCap()
  }
  if ("UpdateDepositWithdrawalCap" in obj) {
    return new UpdateDepositWithdrawalCap()
  }
  if ("DeprecatedUpdateDebtWithdrawalCapCurrentTotal" in obj) {
    return new DeprecatedUpdateDebtWithdrawalCapCurrentTotal()
  }
  if ("DeprecatedUpdateDepositWithdrawalCapCurrentTotal" in obj) {
    return new DeprecatedUpdateDepositWithdrawalCapCurrentTotal()
  }
  if ("UpdateBadDebtLiquidationBonusBps" in obj) {
    return new UpdateBadDebtLiquidationBonusBps()
  }
  if ("UpdateMinLiquidationBonusBps" in obj) {
    return new UpdateMinLiquidationBonusBps()
  }
  if ("UpdateDeleveragingMarginCallPeriod" in obj) {
    return new UpdateDeleveragingMarginCallPeriod()
  }
  if ("UpdateBorrowFactor" in obj) {
    return new UpdateBorrowFactor()
  }
  if ("UpdateAssetTier" in obj) {
    return new UpdateAssetTier()
  }
  if ("UpdateElevationGroup" in obj) {
    return new UpdateElevationGroup()
  }
  if ("UpdateDeleveragingThresholdDecreaseBpsPerDay" in obj) {
    return new UpdateDeleveragingThresholdDecreaseBpsPerDay()
  }
  if ("DeprecatedUpdateMultiplierSideBoost" in obj) {
    return new DeprecatedUpdateMultiplierSideBoost()
  }
  if ("DeprecatedUpdateMultiplierTagBoost" in obj) {
    return new DeprecatedUpdateMultiplierTagBoost()
  }
  if ("UpdateReserveStatus" in obj) {
    return new UpdateReserveStatus()
  }
  if ("UpdateFarmCollateral" in obj) {
    return new UpdateFarmCollateral()
  }
  if ("UpdateFarmDebt" in obj) {
    return new UpdateFarmDebt()
  }
  if ("UpdateDisableUsageAsCollateralOutsideEmode" in obj) {
    return new UpdateDisableUsageAsCollateralOutsideEmode()
  }
  if ("UpdateBlockBorrowingAboveUtilizationPct" in obj) {
    return new UpdateBlockBorrowingAboveUtilizationPct()
  }
  if ("UpdateBlockPriceUsage" in obj) {
    return new UpdateBlockPriceUsage()
  }
  if ("UpdateBorrowLimitOutsideElevationGroup" in obj) {
    return new UpdateBorrowLimitOutsideElevationGroup()
  }
  if ("UpdateBorrowLimitsInElevationGroupAgainstThisReserve" in obj) {
    return new UpdateBorrowLimitsInElevationGroupAgainstThisReserve()
  }
  if ("UpdateHostFixedInterestRateBps" in obj) {
    return new UpdateHostFixedInterestRateBps()
  }
  if ("UpdateAutodeleverageEnabled" in obj) {
    return new UpdateAutodeleverageEnabled()
  }
  if ("UpdateDeleveragingBonusIncreaseBpsPerDay" in obj) {
    return new UpdateDeleveragingBonusIncreaseBpsPerDay()
  }
  if ("UpdateProtocolOrderExecutionFee" in obj) {
    return new UpdateProtocolOrderExecutionFee()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateConfigModeJSON
): types.UpdateConfigModeKind {
  switch (obj.kind) {
    case "UpdateLoanToValuePct": {
      return new UpdateLoanToValuePct()
    }
    case "UpdateMaxLiquidationBonusBps": {
      return new UpdateMaxLiquidationBonusBps()
    }
    case "UpdateLiquidationThresholdPct": {
      return new UpdateLiquidationThresholdPct()
    }
    case "UpdateProtocolLiquidationFee": {
      return new UpdateProtocolLiquidationFee()
    }
    case "UpdateProtocolTakeRate": {
      return new UpdateProtocolTakeRate()
    }
    case "UpdateFeesBorrowFee": {
      return new UpdateFeesBorrowFee()
    }
    case "UpdateFeesFlashLoanFee": {
      return new UpdateFeesFlashLoanFee()
    }
    case "DeprecatedUpdateFeesReferralFeeBps": {
      return new DeprecatedUpdateFeesReferralFeeBps()
    }
    case "UpdateDepositLimit": {
      return new UpdateDepositLimit()
    }
    case "UpdateBorrowLimit": {
      return new UpdateBorrowLimit()
    }
    case "UpdateTokenInfoLowerHeuristic": {
      return new UpdateTokenInfoLowerHeuristic()
    }
    case "UpdateTokenInfoUpperHeuristic": {
      return new UpdateTokenInfoUpperHeuristic()
    }
    case "UpdateTokenInfoExpHeuristic": {
      return new UpdateTokenInfoExpHeuristic()
    }
    case "UpdateTokenInfoTwapDivergence": {
      return new UpdateTokenInfoTwapDivergence()
    }
    case "UpdateTokenInfoScopeTwap": {
      return new UpdateTokenInfoScopeTwap()
    }
    case "UpdateTokenInfoScopeChain": {
      return new UpdateTokenInfoScopeChain()
    }
    case "UpdateTokenInfoName": {
      return new UpdateTokenInfoName()
    }
    case "UpdateTokenInfoPriceMaxAge": {
      return new UpdateTokenInfoPriceMaxAge()
    }
    case "UpdateTokenInfoTwapMaxAge": {
      return new UpdateTokenInfoTwapMaxAge()
    }
    case "UpdateScopePriceFeed": {
      return new UpdateScopePriceFeed()
    }
    case "UpdatePythPrice": {
      return new UpdatePythPrice()
    }
    case "UpdateSwitchboardFeed": {
      return new UpdateSwitchboardFeed()
    }
    case "UpdateSwitchboardTwapFeed": {
      return new UpdateSwitchboardTwapFeed()
    }
    case "UpdateBorrowRateCurve": {
      return new UpdateBorrowRateCurve()
    }
    case "UpdateEntireReserveConfig": {
      return new UpdateEntireReserveConfig()
    }
    case "UpdateDebtWithdrawalCap": {
      return new UpdateDebtWithdrawalCap()
    }
    case "UpdateDepositWithdrawalCap": {
      return new UpdateDepositWithdrawalCap()
    }
    case "DeprecatedUpdateDebtWithdrawalCapCurrentTotal": {
      return new DeprecatedUpdateDebtWithdrawalCapCurrentTotal()
    }
    case "DeprecatedUpdateDepositWithdrawalCapCurrentTotal": {
      return new DeprecatedUpdateDepositWithdrawalCapCurrentTotal()
    }
    case "UpdateBadDebtLiquidationBonusBps": {
      return new UpdateBadDebtLiquidationBonusBps()
    }
    case "UpdateMinLiquidationBonusBps": {
      return new UpdateMinLiquidationBonusBps()
    }
    case "UpdateDeleveragingMarginCallPeriod": {
      return new UpdateDeleveragingMarginCallPeriod()
    }
    case "UpdateBorrowFactor": {
      return new UpdateBorrowFactor()
    }
    case "UpdateAssetTier": {
      return new UpdateAssetTier()
    }
    case "UpdateElevationGroup": {
      return new UpdateElevationGroup()
    }
    case "UpdateDeleveragingThresholdDecreaseBpsPerDay": {
      return new UpdateDeleveragingThresholdDecreaseBpsPerDay()
    }
    case "DeprecatedUpdateMultiplierSideBoost": {
      return new DeprecatedUpdateMultiplierSideBoost()
    }
    case "DeprecatedUpdateMultiplierTagBoost": {
      return new DeprecatedUpdateMultiplierTagBoost()
    }
    case "UpdateReserveStatus": {
      return new UpdateReserveStatus()
    }
    case "UpdateFarmCollateral": {
      return new UpdateFarmCollateral()
    }
    case "UpdateFarmDebt": {
      return new UpdateFarmDebt()
    }
    case "UpdateDisableUsageAsCollateralOutsideEmode": {
      return new UpdateDisableUsageAsCollateralOutsideEmode()
    }
    case "UpdateBlockBorrowingAboveUtilizationPct": {
      return new UpdateBlockBorrowingAboveUtilizationPct()
    }
    case "UpdateBlockPriceUsage": {
      return new UpdateBlockPriceUsage()
    }
    case "UpdateBorrowLimitOutsideElevationGroup": {
      return new UpdateBorrowLimitOutsideElevationGroup()
    }
    case "UpdateBorrowLimitsInElevationGroupAgainstThisReserve": {
      return new UpdateBorrowLimitsInElevationGroupAgainstThisReserve()
    }
    case "UpdateHostFixedInterestRateBps": {
      return new UpdateHostFixedInterestRateBps()
    }
    case "UpdateAutodeleverageEnabled": {
      return new UpdateAutodeleverageEnabled()
    }
    case "UpdateDeleveragingBonusIncreaseBpsPerDay": {
      return new UpdateDeleveragingBonusIncreaseBpsPerDay()
    }
    case "UpdateProtocolOrderExecutionFee": {
      return new UpdateProtocolOrderExecutionFee()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "UpdateLoanToValuePct"),
    borsh.struct([], "UpdateMaxLiquidationBonusBps"),
    borsh.struct([], "UpdateLiquidationThresholdPct"),
    borsh.struct([], "UpdateProtocolLiquidationFee"),
    borsh.struct([], "UpdateProtocolTakeRate"),
    borsh.struct([], "UpdateFeesBorrowFee"),
    borsh.struct([], "UpdateFeesFlashLoanFee"),
    borsh.struct([], "DeprecatedUpdateFeesReferralFeeBps"),
    borsh.struct([], "UpdateDepositLimit"),
    borsh.struct([], "UpdateBorrowLimit"),
    borsh.struct([], "UpdateTokenInfoLowerHeuristic"),
    borsh.struct([], "UpdateTokenInfoUpperHeuristic"),
    borsh.struct([], "UpdateTokenInfoExpHeuristic"),
    borsh.struct([], "UpdateTokenInfoTwapDivergence"),
    borsh.struct([], "UpdateTokenInfoScopeTwap"),
    borsh.struct([], "UpdateTokenInfoScopeChain"),
    borsh.struct([], "UpdateTokenInfoName"),
    borsh.struct([], "UpdateTokenInfoPriceMaxAge"),
    borsh.struct([], "UpdateTokenInfoTwapMaxAge"),
    borsh.struct([], "UpdateScopePriceFeed"),
    borsh.struct([], "UpdatePythPrice"),
    borsh.struct([], "UpdateSwitchboardFeed"),
    borsh.struct([], "UpdateSwitchboardTwapFeed"),
    borsh.struct([], "UpdateBorrowRateCurve"),
    borsh.struct([], "UpdateEntireReserveConfig"),
    borsh.struct([], "UpdateDebtWithdrawalCap"),
    borsh.struct([], "UpdateDepositWithdrawalCap"),
    borsh.struct([], "DeprecatedUpdateDebtWithdrawalCapCurrentTotal"),
    borsh.struct([], "DeprecatedUpdateDepositWithdrawalCapCurrentTotal"),
    borsh.struct([], "UpdateBadDebtLiquidationBonusBps"),
    borsh.struct([], "UpdateMinLiquidationBonusBps"),
    borsh.struct([], "UpdateDeleveragingMarginCallPeriod"),
    borsh.struct([], "UpdateBorrowFactor"),
    borsh.struct([], "UpdateAssetTier"),
    borsh.struct([], "UpdateElevationGroup"),
    borsh.struct([], "UpdateDeleveragingThresholdDecreaseBpsPerDay"),
    borsh.struct([], "DeprecatedUpdateMultiplierSideBoost"),
    borsh.struct([], "DeprecatedUpdateMultiplierTagBoost"),
    borsh.struct([], "UpdateReserveStatus"),
    borsh.struct([], "UpdateFarmCollateral"),
    borsh.struct([], "UpdateFarmDebt"),
    borsh.struct([], "UpdateDisableUsageAsCollateralOutsideEmode"),
    borsh.struct([], "UpdateBlockBorrowingAboveUtilizationPct"),
    borsh.struct([], "UpdateBlockPriceUsage"),
    borsh.struct([], "UpdateBorrowLimitOutsideElevationGroup"),
    borsh.struct([], "UpdateBorrowLimitsInElevationGroupAgainstThisReserve"),
    borsh.struct([], "UpdateHostFixedInterestRateBps"),
    borsh.struct([], "UpdateAutodeleverageEnabled"),
    borsh.struct([], "UpdateDeleveragingBonusIncreaseBpsPerDay"),
    borsh.struct([], "UpdateProtocolOrderExecutionFee"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
