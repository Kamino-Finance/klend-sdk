import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface UpdateOwnerJSON {
  kind: "UpdateOwner"
}

export class UpdateOwner {
  static readonly discriminator = 0
  static readonly kind = "UpdateOwner"
  readonly discriminator = 0
  readonly kind = "UpdateOwner"

  toJSON(): UpdateOwnerJSON {
    return {
      kind: "UpdateOwner",
    }
  }

  toEncodable() {
    return {
      UpdateOwner: {},
    }
  }
}

export interface UpdateEmergencyModeJSON {
  kind: "UpdateEmergencyMode"
}

export class UpdateEmergencyMode {
  static readonly discriminator = 1
  static readonly kind = "UpdateEmergencyMode"
  readonly discriminator = 1
  readonly kind = "UpdateEmergencyMode"

  toJSON(): UpdateEmergencyModeJSON {
    return {
      kind: "UpdateEmergencyMode",
    }
  }

  toEncodable() {
    return {
      UpdateEmergencyMode: {},
    }
  }
}

export interface UpdateLiquidationCloseFactorJSON {
  kind: "UpdateLiquidationCloseFactor"
}

export class UpdateLiquidationCloseFactor {
  static readonly discriminator = 2
  static readonly kind = "UpdateLiquidationCloseFactor"
  readonly discriminator = 2
  readonly kind = "UpdateLiquidationCloseFactor"

  toJSON(): UpdateLiquidationCloseFactorJSON {
    return {
      kind: "UpdateLiquidationCloseFactor",
    }
  }

  toEncodable() {
    return {
      UpdateLiquidationCloseFactor: {},
    }
  }
}

export interface UpdateLiquidationMaxValueJSON {
  kind: "UpdateLiquidationMaxValue"
}

export class UpdateLiquidationMaxValue {
  static readonly discriminator = 3
  static readonly kind = "UpdateLiquidationMaxValue"
  readonly discriminator = 3
  readonly kind = "UpdateLiquidationMaxValue"

  toJSON(): UpdateLiquidationMaxValueJSON {
    return {
      kind: "UpdateLiquidationMaxValue",
    }
  }

  toEncodable() {
    return {
      UpdateLiquidationMaxValue: {},
    }
  }
}

export interface DeprecatedUpdateGlobalUnhealthyBorrowJSON {
  kind: "DeprecatedUpdateGlobalUnhealthyBorrow"
}

export class DeprecatedUpdateGlobalUnhealthyBorrow {
  static readonly discriminator = 4
  static readonly kind = "DeprecatedUpdateGlobalUnhealthyBorrow"
  readonly discriminator = 4
  readonly kind = "DeprecatedUpdateGlobalUnhealthyBorrow"

  toJSON(): DeprecatedUpdateGlobalUnhealthyBorrowJSON {
    return {
      kind: "DeprecatedUpdateGlobalUnhealthyBorrow",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateGlobalUnhealthyBorrow: {},
    }
  }
}

export interface UpdateGlobalAllowedBorrowJSON {
  kind: "UpdateGlobalAllowedBorrow"
}

export class UpdateGlobalAllowedBorrow {
  static readonly discriminator = 5
  static readonly kind = "UpdateGlobalAllowedBorrow"
  readonly discriminator = 5
  readonly kind = "UpdateGlobalAllowedBorrow"

  toJSON(): UpdateGlobalAllowedBorrowJSON {
    return {
      kind: "UpdateGlobalAllowedBorrow",
    }
  }

  toEncodable() {
    return {
      UpdateGlobalAllowedBorrow: {},
    }
  }
}

export interface UpdateEmergencyCouncilJSON {
  kind: "UpdateEmergencyCouncil"
}

export class UpdateEmergencyCouncil {
  static readonly discriminator = 6
  static readonly kind = "UpdateEmergencyCouncil"
  readonly discriminator = 6
  readonly kind = "UpdateEmergencyCouncil"

  toJSON(): UpdateEmergencyCouncilJSON {
    return {
      kind: "UpdateEmergencyCouncil",
    }
  }

  toEncodable() {
    return {
      UpdateEmergencyCouncil: {},
    }
  }
}

export interface UpdateMinFullLiquidationThresholdJSON {
  kind: "UpdateMinFullLiquidationThreshold"
}

export class UpdateMinFullLiquidationThreshold {
  static readonly discriminator = 7
  static readonly kind = "UpdateMinFullLiquidationThreshold"
  readonly discriminator = 7
  readonly kind = "UpdateMinFullLiquidationThreshold"

  toJSON(): UpdateMinFullLiquidationThresholdJSON {
    return {
      kind: "UpdateMinFullLiquidationThreshold",
    }
  }

  toEncodable() {
    return {
      UpdateMinFullLiquidationThreshold: {},
    }
  }
}

export interface UpdateInsolvencyRiskLtvJSON {
  kind: "UpdateInsolvencyRiskLtv"
}

export class UpdateInsolvencyRiskLtv {
  static readonly discriminator = 8
  static readonly kind = "UpdateInsolvencyRiskLtv"
  readonly discriminator = 8
  readonly kind = "UpdateInsolvencyRiskLtv"

  toJSON(): UpdateInsolvencyRiskLtvJSON {
    return {
      kind: "UpdateInsolvencyRiskLtv",
    }
  }

  toEncodable() {
    return {
      UpdateInsolvencyRiskLtv: {},
    }
  }
}

export interface UpdateElevationGroupJSON {
  kind: "UpdateElevationGroup"
}

export class UpdateElevationGroup {
  static readonly discriminator = 9
  static readonly kind = "UpdateElevationGroup"
  readonly discriminator = 9
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

export interface UpdateReferralFeeBpsJSON {
  kind: "UpdateReferralFeeBps"
}

export class UpdateReferralFeeBps {
  static readonly discriminator = 10
  static readonly kind = "UpdateReferralFeeBps"
  readonly discriminator = 10
  readonly kind = "UpdateReferralFeeBps"

  toJSON(): UpdateReferralFeeBpsJSON {
    return {
      kind: "UpdateReferralFeeBps",
    }
  }

  toEncodable() {
    return {
      UpdateReferralFeeBps: {},
    }
  }
}

export interface DeprecatedUpdateMultiplierPointsJSON {
  kind: "DeprecatedUpdateMultiplierPoints"
}

export class DeprecatedUpdateMultiplierPoints {
  static readonly discriminator = 11
  static readonly kind = "DeprecatedUpdateMultiplierPoints"
  readonly discriminator = 11
  readonly kind = "DeprecatedUpdateMultiplierPoints"

  toJSON(): DeprecatedUpdateMultiplierPointsJSON {
    return {
      kind: "DeprecatedUpdateMultiplierPoints",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateMultiplierPoints: {},
    }
  }
}

export interface UpdatePriceRefreshTriggerToMaxAgePctJSON {
  kind: "UpdatePriceRefreshTriggerToMaxAgePct"
}

export class UpdatePriceRefreshTriggerToMaxAgePct {
  static readonly discriminator = 12
  static readonly kind = "UpdatePriceRefreshTriggerToMaxAgePct"
  readonly discriminator = 12
  readonly kind = "UpdatePriceRefreshTriggerToMaxAgePct"

  toJSON(): UpdatePriceRefreshTriggerToMaxAgePctJSON {
    return {
      kind: "UpdatePriceRefreshTriggerToMaxAgePct",
    }
  }

  toEncodable() {
    return {
      UpdatePriceRefreshTriggerToMaxAgePct: {},
    }
  }
}

export interface UpdateAutodeleverageEnabledJSON {
  kind: "UpdateAutodeleverageEnabled"
}

export class UpdateAutodeleverageEnabled {
  static readonly discriminator = 13
  static readonly kind = "UpdateAutodeleverageEnabled"
  readonly discriminator = 13
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

export interface UpdateBorrowingDisabledJSON {
  kind: "UpdateBorrowingDisabled"
}

export class UpdateBorrowingDisabled {
  static readonly discriminator = 14
  static readonly kind = "UpdateBorrowingDisabled"
  readonly discriminator = 14
  readonly kind = "UpdateBorrowingDisabled"

  toJSON(): UpdateBorrowingDisabledJSON {
    return {
      kind: "UpdateBorrowingDisabled",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowingDisabled: {},
    }
  }
}

export interface UpdateMinNetValueObligationPostActionJSON {
  kind: "UpdateMinNetValueObligationPostAction"
}

export class UpdateMinNetValueObligationPostAction {
  static readonly discriminator = 15
  static readonly kind = "UpdateMinNetValueObligationPostAction"
  readonly discriminator = 15
  readonly kind = "UpdateMinNetValueObligationPostAction"

  toJSON(): UpdateMinNetValueObligationPostActionJSON {
    return {
      kind: "UpdateMinNetValueObligationPostAction",
    }
  }

  toEncodable() {
    return {
      UpdateMinNetValueObligationPostAction: {},
    }
  }
}

export interface UpdateMinValueLtvSkipPriorityLiqCheckJSON {
  kind: "UpdateMinValueLtvSkipPriorityLiqCheck"
}

export class UpdateMinValueLtvSkipPriorityLiqCheck {
  static readonly discriminator = 16
  static readonly kind = "UpdateMinValueLtvSkipPriorityLiqCheck"
  readonly discriminator = 16
  readonly kind = "UpdateMinValueLtvSkipPriorityLiqCheck"

  toJSON(): UpdateMinValueLtvSkipPriorityLiqCheckJSON {
    return {
      kind: "UpdateMinValueLtvSkipPriorityLiqCheck",
    }
  }

  toEncodable() {
    return {
      UpdateMinValueLtvSkipPriorityLiqCheck: {},
    }
  }
}

export interface UpdateMinValueBfSkipPriorityLiqCheckJSON {
  kind: "UpdateMinValueBfSkipPriorityLiqCheck"
}

export class UpdateMinValueBfSkipPriorityLiqCheck {
  static readonly discriminator = 17
  static readonly kind = "UpdateMinValueBfSkipPriorityLiqCheck"
  readonly discriminator = 17
  readonly kind = "UpdateMinValueBfSkipPriorityLiqCheck"

  toJSON(): UpdateMinValueBfSkipPriorityLiqCheckJSON {
    return {
      kind: "UpdateMinValueBfSkipPriorityLiqCheck",
    }
  }

  toEncodable() {
    return {
      UpdateMinValueBfSkipPriorityLiqCheck: {},
    }
  }
}

export interface UpdatePaddingFieldsJSON {
  kind: "UpdatePaddingFields"
}

export class UpdatePaddingFields {
  static readonly discriminator = 18
  static readonly kind = "UpdatePaddingFields"
  readonly discriminator = 18
  readonly kind = "UpdatePaddingFields"

  toJSON(): UpdatePaddingFieldsJSON {
    return {
      kind: "UpdatePaddingFields",
    }
  }

  toEncodable() {
    return {
      UpdatePaddingFields: {},
    }
  }
}

export interface UpdateNameJSON {
  kind: "UpdateName"
}

export class UpdateName {
  static readonly discriminator = 19
  static readonly kind = "UpdateName"
  readonly discriminator = 19
  readonly kind = "UpdateName"

  toJSON(): UpdateNameJSON {
    return {
      kind: "UpdateName",
    }
  }

  toEncodable() {
    return {
      UpdateName: {},
    }
  }
}

export interface UpdateIndividualAutodeleverageMarginCallPeriodSecsJSON {
  kind: "UpdateIndividualAutodeleverageMarginCallPeriodSecs"
}

export class UpdateIndividualAutodeleverageMarginCallPeriodSecs {
  static readonly discriminator = 20
  static readonly kind = "UpdateIndividualAutodeleverageMarginCallPeriodSecs"
  readonly discriminator = 20
  readonly kind = "UpdateIndividualAutodeleverageMarginCallPeriodSecs"

  toJSON(): UpdateIndividualAutodeleverageMarginCallPeriodSecsJSON {
    return {
      kind: "UpdateIndividualAutodeleverageMarginCallPeriodSecs",
    }
  }

  toEncodable() {
    return {
      UpdateIndividualAutodeleverageMarginCallPeriodSecs: {},
    }
  }
}

export interface UpdateInitialDepositAmountJSON {
  kind: "UpdateInitialDepositAmount"
}

export class UpdateInitialDepositAmount {
  static readonly discriminator = 21
  static readonly kind = "UpdateInitialDepositAmount"
  readonly discriminator = 21
  readonly kind = "UpdateInitialDepositAmount"

  toJSON(): UpdateInitialDepositAmountJSON {
    return {
      kind: "UpdateInitialDepositAmount",
    }
  }

  toEncodable() {
    return {
      UpdateInitialDepositAmount: {},
    }
  }
}

export interface UpdateObligationOrderExecutionEnabledJSON {
  kind: "UpdateObligationOrderExecutionEnabled"
}

export class UpdateObligationOrderExecutionEnabled {
  static readonly discriminator = 22
  static readonly kind = "UpdateObligationOrderExecutionEnabled"
  readonly discriminator = 22
  readonly kind = "UpdateObligationOrderExecutionEnabled"

  toJSON(): UpdateObligationOrderExecutionEnabledJSON {
    return {
      kind: "UpdateObligationOrderExecutionEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateObligationOrderExecutionEnabled: {},
    }
  }
}

export interface UpdateImmutableFlagJSON {
  kind: "UpdateImmutableFlag"
}

export class UpdateImmutableFlag {
  static readonly discriminator = 23
  static readonly kind = "UpdateImmutableFlag"
  readonly discriminator = 23
  readonly kind = "UpdateImmutableFlag"

  toJSON(): UpdateImmutableFlagJSON {
    return {
      kind: "UpdateImmutableFlag",
    }
  }

  toEncodable() {
    return {
      UpdateImmutableFlag: {},
    }
  }
}

export interface UpdateObligationOrderCreationEnabledJSON {
  kind: "UpdateObligationOrderCreationEnabled"
}

export class UpdateObligationOrderCreationEnabled {
  static readonly discriminator = 24
  static readonly kind = "UpdateObligationOrderCreationEnabled"
  readonly discriminator = 24
  readonly kind = "UpdateObligationOrderCreationEnabled"

  toJSON(): UpdateObligationOrderCreationEnabledJSON {
    return {
      kind: "UpdateObligationOrderCreationEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateObligationOrderCreationEnabled: {},
    }
  }
}

export interface UpdateProposerAuthorityJSON {
  kind: "UpdateProposerAuthority"
}

export class UpdateProposerAuthority {
  static readonly discriminator = 25
  static readonly kind = "UpdateProposerAuthority"
  readonly discriminator = 25
  readonly kind = "UpdateProposerAuthority"

  toJSON(): UpdateProposerAuthorityJSON {
    return {
      kind: "UpdateProposerAuthority",
    }
  }

  toEncodable() {
    return {
      UpdateProposerAuthority: {},
    }
  }
}

export interface UpdatePriceTriggeredLiquidationDisabledJSON {
  kind: "UpdatePriceTriggeredLiquidationDisabled"
}

export class UpdatePriceTriggeredLiquidationDisabled {
  static readonly discriminator = 26
  static readonly kind = "UpdatePriceTriggeredLiquidationDisabled"
  readonly discriminator = 26
  readonly kind = "UpdatePriceTriggeredLiquidationDisabled"

  toJSON(): UpdatePriceTriggeredLiquidationDisabledJSON {
    return {
      kind: "UpdatePriceTriggeredLiquidationDisabled",
    }
  }

  toEncodable() {
    return {
      UpdatePriceTriggeredLiquidationDisabled: {},
    }
  }
}

export interface UpdateMatureReserveDebtLiquidationEnabledJSON {
  kind: "UpdateMatureReserveDebtLiquidationEnabled"
}

export class UpdateMatureReserveDebtLiquidationEnabled {
  static readonly discriminator = 27
  static readonly kind = "UpdateMatureReserveDebtLiquidationEnabled"
  readonly discriminator = 27
  readonly kind = "UpdateMatureReserveDebtLiquidationEnabled"

  toJSON(): UpdateMatureReserveDebtLiquidationEnabledJSON {
    return {
      kind: "UpdateMatureReserveDebtLiquidationEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateMatureReserveDebtLiquidationEnabled: {},
    }
  }
}

export interface UpdateObligationBorrowDebtTermLiquidationEnabledJSON {
  kind: "UpdateObligationBorrowDebtTermLiquidationEnabled"
}

export class UpdateObligationBorrowDebtTermLiquidationEnabled {
  static readonly discriminator = 28
  static readonly kind = "UpdateObligationBorrowDebtTermLiquidationEnabled"
  readonly discriminator = 28
  readonly kind = "UpdateObligationBorrowDebtTermLiquidationEnabled"

  toJSON(): UpdateObligationBorrowDebtTermLiquidationEnabledJSON {
    return {
      kind: "UpdateObligationBorrowDebtTermLiquidationEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateObligationBorrowDebtTermLiquidationEnabled: {},
    }
  }
}

export interface UpdateBorrowOrderCreationEnabledJSON {
  kind: "UpdateBorrowOrderCreationEnabled"
}

export class UpdateBorrowOrderCreationEnabled {
  static readonly discriminator = 29
  static readonly kind = "UpdateBorrowOrderCreationEnabled"
  readonly discriminator = 29
  readonly kind = "UpdateBorrowOrderCreationEnabled"

  toJSON(): UpdateBorrowOrderCreationEnabledJSON {
    return {
      kind: "UpdateBorrowOrderCreationEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowOrderCreationEnabled: {},
    }
  }
}

export interface UpdateBorrowOrderExecutionEnabledJSON {
  kind: "UpdateBorrowOrderExecutionEnabled"
}

export class UpdateBorrowOrderExecutionEnabled {
  static readonly discriminator = 30
  static readonly kind = "UpdateBorrowOrderExecutionEnabled"
  readonly discriminator = 30
  readonly kind = "UpdateBorrowOrderExecutionEnabled"

  toJSON(): UpdateBorrowOrderExecutionEnabledJSON {
    return {
      kind: "UpdateBorrowOrderExecutionEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowOrderExecutionEnabled: {},
    }
  }
}

export interface UpdateMinBorrowOrderFillValueJSON {
  kind: "UpdateMinBorrowOrderFillValue"
}

export class UpdateMinBorrowOrderFillValue {
  static readonly discriminator = 31
  static readonly kind = "UpdateMinBorrowOrderFillValue"
  readonly discriminator = 31
  readonly kind = "UpdateMinBorrowOrderFillValue"

  toJSON(): UpdateMinBorrowOrderFillValueJSON {
    return {
      kind: "UpdateMinBorrowOrderFillValue",
    }
  }

  toEncodable() {
    return {
      UpdateMinBorrowOrderFillValue: {},
    }
  }
}

export interface UpdateWithdrawTicketIssuanceEnabledJSON {
  kind: "UpdateWithdrawTicketIssuanceEnabled"
}

export class UpdateWithdrawTicketIssuanceEnabled {
  static readonly discriminator = 32
  static readonly kind = "UpdateWithdrawTicketIssuanceEnabled"
  readonly discriminator = 32
  readonly kind = "UpdateWithdrawTicketIssuanceEnabled"

  toJSON(): UpdateWithdrawTicketIssuanceEnabledJSON {
    return {
      kind: "UpdateWithdrawTicketIssuanceEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateWithdrawTicketIssuanceEnabled: {},
    }
  }
}

export interface UpdateWithdrawTicketRedemptionEnabledJSON {
  kind: "UpdateWithdrawTicketRedemptionEnabled"
}

export class UpdateWithdrawTicketRedemptionEnabled {
  static readonly discriminator = 33
  static readonly kind = "UpdateWithdrawTicketRedemptionEnabled"
  readonly discriminator = 33
  readonly kind = "UpdateWithdrawTicketRedemptionEnabled"

  toJSON(): UpdateWithdrawTicketRedemptionEnabledJSON {
    return {
      kind: "UpdateWithdrawTicketRedemptionEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateWithdrawTicketRedemptionEnabled: {},
    }
  }
}

export interface UpdateMinWithdrawQueuedLiquidityValueJSON {
  kind: "UpdateMinWithdrawQueuedLiquidityValue"
}

export class UpdateMinWithdrawQueuedLiquidityValue {
  static readonly discriminator = 34
  static readonly kind = "UpdateMinWithdrawQueuedLiquidityValue"
  readonly discriminator = 34
  readonly kind = "UpdateMinWithdrawQueuedLiquidityValue"

  toJSON(): UpdateMinWithdrawQueuedLiquidityValueJSON {
    return {
      kind: "UpdateMinWithdrawQueuedLiquidityValue",
    }
  }

  toEncodable() {
    return {
      UpdateMinWithdrawQueuedLiquidityValue: {},
    }
  }
}

export interface UpdateFixedTermRolloverWindowDurationSecondsJSON {
  kind: "UpdateFixedTermRolloverWindowDurationSeconds"
}

export class UpdateFixedTermRolloverWindowDurationSeconds {
  static readonly discriminator = 35
  static readonly kind = "UpdateFixedTermRolloverWindowDurationSeconds"
  readonly discriminator = 35
  readonly kind = "UpdateFixedTermRolloverWindowDurationSeconds"

  toJSON(): UpdateFixedTermRolloverWindowDurationSecondsJSON {
    return {
      kind: "UpdateFixedTermRolloverWindowDurationSeconds",
    }
  }

  toEncodable() {
    return {
      UpdateFixedTermRolloverWindowDurationSeconds: {},
    }
  }
}

export interface UpdateOpenTermRolloverWindowDurationSecondsJSON {
  kind: "UpdateOpenTermRolloverWindowDurationSeconds"
}

export class UpdateOpenTermRolloverWindowDurationSeconds {
  static readonly discriminator = 36
  static readonly kind = "UpdateOpenTermRolloverWindowDurationSeconds"
  readonly discriminator = 36
  readonly kind = "UpdateOpenTermRolloverWindowDurationSeconds"

  toJSON(): UpdateOpenTermRolloverWindowDurationSecondsJSON {
    return {
      kind: "UpdateOpenTermRolloverWindowDurationSeconds",
    }
  }

  toEncodable() {
    return {
      UpdateOpenTermRolloverWindowDurationSeconds: {},
    }
  }
}

export interface UpdateObligationBorrowRolloverConfigurationEnabledJSON {
  kind: "UpdateObligationBorrowRolloverConfigurationEnabled"
}

export class UpdateObligationBorrowRolloverConfigurationEnabled {
  static readonly discriminator = 37
  static readonly kind = "UpdateObligationBorrowRolloverConfigurationEnabled"
  readonly discriminator = 37
  readonly kind = "UpdateObligationBorrowRolloverConfigurationEnabled"

  toJSON(): UpdateObligationBorrowRolloverConfigurationEnabledJSON {
    return {
      kind: "UpdateObligationBorrowRolloverConfigurationEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateObligationBorrowRolloverConfigurationEnabled: {},
    }
  }
}

export interface UpdateTermBasedFullLiquidationDurationSecsJSON {
  kind: "UpdateTermBasedFullLiquidationDurationSecs"
}

export class UpdateTermBasedFullLiquidationDurationSecs {
  static readonly discriminator = 38
  static readonly kind = "UpdateTermBasedFullLiquidationDurationSecs"
  readonly discriminator = 38
  readonly kind = "UpdateTermBasedFullLiquidationDurationSecs"

  toJSON(): UpdateTermBasedFullLiquidationDurationSecsJSON {
    return {
      kind: "UpdateTermBasedFullLiquidationDurationSecs",
    }
  }

  toEncodable() {
    return {
      UpdateTermBasedFullLiquidationDurationSecs: {},
    }
  }
}

export interface UpdateObligationBorrowMigrationToFixedExecutionEnabledJSON {
  kind: "UpdateObligationBorrowMigrationToFixedExecutionEnabled"
}

export class UpdateObligationBorrowMigrationToFixedExecutionEnabled {
  static readonly discriminator = 39
  static readonly kind =
    "UpdateObligationBorrowMigrationToFixedExecutionEnabled"
  readonly discriminator = 39
  readonly kind = "UpdateObligationBorrowMigrationToFixedExecutionEnabled"

  toJSON(): UpdateObligationBorrowMigrationToFixedExecutionEnabledJSON {
    return {
      kind: "UpdateObligationBorrowMigrationToFixedExecutionEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateObligationBorrowMigrationToFixedExecutionEnabled: {},
    }
  }
}

export interface UpdateMinPartialRolloverValueJSON {
  kind: "UpdateMinPartialRolloverValue"
}

export class UpdateMinPartialRolloverValue {
  static readonly discriminator = 40
  static readonly kind = "UpdateMinPartialRolloverValue"
  readonly discriminator = 40
  readonly kind = "UpdateMinPartialRolloverValue"

  toJSON(): UpdateMinPartialRolloverValueJSON {
    return {
      kind: "UpdateMinPartialRolloverValue",
    }
  }

  toEncodable() {
    return {
      UpdateMinPartialRolloverValue: {},
    }
  }
}

export interface UpdateWithdrawTicketCancellationEnabledJSON {
  kind: "UpdateWithdrawTicketCancellationEnabled"
}

export class UpdateWithdrawTicketCancellationEnabled {
  static readonly discriminator = 41
  static readonly kind = "UpdateWithdrawTicketCancellationEnabled"
  readonly discriminator = 41
  readonly kind = "UpdateWithdrawTicketCancellationEnabled"

  toJSON(): UpdateWithdrawTicketCancellationEnabledJSON {
    return {
      kind: "UpdateWithdrawTicketCancellationEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateWithdrawTicketCancellationEnabled: {},
    }
  }
}

export interface UpdatePermissioningAuthorityJSON {
  kind: "UpdatePermissioningAuthority"
}

export class UpdatePermissioningAuthority {
  static readonly discriminator = 42
  static readonly kind = "UpdatePermissioningAuthority"
  readonly discriminator = 42
  readonly kind = "UpdatePermissioningAuthority"

  toJSON(): UpdatePermissioningAuthorityJSON {
    return {
      kind: "UpdatePermissioningAuthority",
    }
  }

  toEncodable() {
    return {
      UpdatePermissioningAuthority: {},
    }
  }
}

export interface UpdatePermissionedOpsJSON {
  kind: "UpdatePermissionedOps"
}

export class UpdatePermissionedOps {
  static readonly discriminator = 43
  static readonly kind = "UpdatePermissionedOps"
  readonly discriminator = 43
  readonly kind = "UpdatePermissionedOps"

  toJSON(): UpdatePermissionedOpsJSON {
    return {
      kind: "UpdatePermissionedOps",
    }
  }

  toEncodable() {
    return {
      UpdatePermissionedOps: {},
    }
  }
}

export interface DeprecatedUpdateReserveRewardsMaxAprPctJSON {
  kind: "DeprecatedUpdateReserveRewardsMaxAprPct"
}

export class DeprecatedUpdateReserveRewardsMaxAprPct {
  static readonly discriminator = 44
  static readonly kind = "DeprecatedUpdateReserveRewardsMaxAprPct"
  readonly discriminator = 44
  readonly kind = "DeprecatedUpdateReserveRewardsMaxAprPct"

  toJSON(): DeprecatedUpdateReserveRewardsMaxAprPctJSON {
    return {
      kind: "DeprecatedUpdateReserveRewardsMaxAprPct",
    }
  }

  toEncodable() {
    return {
      DeprecatedUpdateReserveRewardsMaxAprPct: {},
    }
  }
}

export interface UpdateReserveRewardsMaxAprBpsJSON {
  kind: "UpdateReserveRewardsMaxAprBps"
}

export class UpdateReserveRewardsMaxAprBps {
  static readonly discriminator = 45
  static readonly kind = "UpdateReserveRewardsMaxAprBps"
  readonly discriminator = 45
  readonly kind = "UpdateReserveRewardsMaxAprBps"

  toJSON(): UpdateReserveRewardsMaxAprBpsJSON {
    return {
      kind: "UpdateReserveRewardsMaxAprBps",
    }
  }

  toEncodable() {
    return {
      UpdateReserveRewardsMaxAprBps: {},
    }
  }
}

export interface UpdateDisableNonceBlockJSON {
  kind: "UpdateDisableNonceBlock"
}

export class UpdateDisableNonceBlock {
  static readonly discriminator = 46
  static readonly kind = "UpdateDisableNonceBlock"
  readonly discriminator = 46
  readonly kind = "UpdateDisableNonceBlock"

  toJSON(): UpdateDisableNonceBlockJSON {
    return {
      kind: "UpdateDisableNonceBlock",
    }
  }

  toEncodable() {
    return {
      UpdateDisableNonceBlock: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateLendingMarketModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("UpdateOwner" in obj) {
    return new UpdateOwner()
  }
  if ("UpdateEmergencyMode" in obj) {
    return new UpdateEmergencyMode()
  }
  if ("UpdateLiquidationCloseFactor" in obj) {
    return new UpdateLiquidationCloseFactor()
  }
  if ("UpdateLiquidationMaxValue" in obj) {
    return new UpdateLiquidationMaxValue()
  }
  if ("DeprecatedUpdateGlobalUnhealthyBorrow" in obj) {
    return new DeprecatedUpdateGlobalUnhealthyBorrow()
  }
  if ("UpdateGlobalAllowedBorrow" in obj) {
    return new UpdateGlobalAllowedBorrow()
  }
  if ("UpdateEmergencyCouncil" in obj) {
    return new UpdateEmergencyCouncil()
  }
  if ("UpdateMinFullLiquidationThreshold" in obj) {
    return new UpdateMinFullLiquidationThreshold()
  }
  if ("UpdateInsolvencyRiskLtv" in obj) {
    return new UpdateInsolvencyRiskLtv()
  }
  if ("UpdateElevationGroup" in obj) {
    return new UpdateElevationGroup()
  }
  if ("UpdateReferralFeeBps" in obj) {
    return new UpdateReferralFeeBps()
  }
  if ("DeprecatedUpdateMultiplierPoints" in obj) {
    return new DeprecatedUpdateMultiplierPoints()
  }
  if ("UpdatePriceRefreshTriggerToMaxAgePct" in obj) {
    return new UpdatePriceRefreshTriggerToMaxAgePct()
  }
  if ("UpdateAutodeleverageEnabled" in obj) {
    return new UpdateAutodeleverageEnabled()
  }
  if ("UpdateBorrowingDisabled" in obj) {
    return new UpdateBorrowingDisabled()
  }
  if ("UpdateMinNetValueObligationPostAction" in obj) {
    return new UpdateMinNetValueObligationPostAction()
  }
  if ("UpdateMinValueLtvSkipPriorityLiqCheck" in obj) {
    return new UpdateMinValueLtvSkipPriorityLiqCheck()
  }
  if ("UpdateMinValueBfSkipPriorityLiqCheck" in obj) {
    return new UpdateMinValueBfSkipPriorityLiqCheck()
  }
  if ("UpdatePaddingFields" in obj) {
    return new UpdatePaddingFields()
  }
  if ("UpdateName" in obj) {
    return new UpdateName()
  }
  if ("UpdateIndividualAutodeleverageMarginCallPeriodSecs" in obj) {
    return new UpdateIndividualAutodeleverageMarginCallPeriodSecs()
  }
  if ("UpdateInitialDepositAmount" in obj) {
    return new UpdateInitialDepositAmount()
  }
  if ("UpdateObligationOrderExecutionEnabled" in obj) {
    return new UpdateObligationOrderExecutionEnabled()
  }
  if ("UpdateImmutableFlag" in obj) {
    return new UpdateImmutableFlag()
  }
  if ("UpdateObligationOrderCreationEnabled" in obj) {
    return new UpdateObligationOrderCreationEnabled()
  }
  if ("UpdateProposerAuthority" in obj) {
    return new UpdateProposerAuthority()
  }
  if ("UpdatePriceTriggeredLiquidationDisabled" in obj) {
    return new UpdatePriceTriggeredLiquidationDisabled()
  }
  if ("UpdateMatureReserveDebtLiquidationEnabled" in obj) {
    return new UpdateMatureReserveDebtLiquidationEnabled()
  }
  if ("UpdateObligationBorrowDebtTermLiquidationEnabled" in obj) {
    return new UpdateObligationBorrowDebtTermLiquidationEnabled()
  }
  if ("UpdateBorrowOrderCreationEnabled" in obj) {
    return new UpdateBorrowOrderCreationEnabled()
  }
  if ("UpdateBorrowOrderExecutionEnabled" in obj) {
    return new UpdateBorrowOrderExecutionEnabled()
  }
  if ("UpdateMinBorrowOrderFillValue" in obj) {
    return new UpdateMinBorrowOrderFillValue()
  }
  if ("UpdateWithdrawTicketIssuanceEnabled" in obj) {
    return new UpdateWithdrawTicketIssuanceEnabled()
  }
  if ("UpdateWithdrawTicketRedemptionEnabled" in obj) {
    return new UpdateWithdrawTicketRedemptionEnabled()
  }
  if ("UpdateMinWithdrawQueuedLiquidityValue" in obj) {
    return new UpdateMinWithdrawQueuedLiquidityValue()
  }
  if ("UpdateFixedTermRolloverWindowDurationSeconds" in obj) {
    return new UpdateFixedTermRolloverWindowDurationSeconds()
  }
  if ("UpdateOpenTermRolloverWindowDurationSeconds" in obj) {
    return new UpdateOpenTermRolloverWindowDurationSeconds()
  }
  if ("UpdateObligationBorrowRolloverConfigurationEnabled" in obj) {
    return new UpdateObligationBorrowRolloverConfigurationEnabled()
  }
  if ("UpdateTermBasedFullLiquidationDurationSecs" in obj) {
    return new UpdateTermBasedFullLiquidationDurationSecs()
  }
  if ("UpdateObligationBorrowMigrationToFixedExecutionEnabled" in obj) {
    return new UpdateObligationBorrowMigrationToFixedExecutionEnabled()
  }
  if ("UpdateMinPartialRolloverValue" in obj) {
    return new UpdateMinPartialRolloverValue()
  }
  if ("UpdateWithdrawTicketCancellationEnabled" in obj) {
    return new UpdateWithdrawTicketCancellationEnabled()
  }
  if ("UpdatePermissioningAuthority" in obj) {
    return new UpdatePermissioningAuthority()
  }
  if ("UpdatePermissionedOps" in obj) {
    return new UpdatePermissionedOps()
  }
  if ("DeprecatedUpdateReserveRewardsMaxAprPct" in obj) {
    return new DeprecatedUpdateReserveRewardsMaxAprPct()
  }
  if ("UpdateReserveRewardsMaxAprBps" in obj) {
    return new UpdateReserveRewardsMaxAprBps()
  }
  if ("UpdateDisableNonceBlock" in obj) {
    return new UpdateDisableNonceBlock()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateLendingMarketModeJSON
): types.UpdateLendingMarketModeKind {
  switch (obj.kind) {
    case "UpdateOwner": {
      return new UpdateOwner()
    }
    case "UpdateEmergencyMode": {
      return new UpdateEmergencyMode()
    }
    case "UpdateLiquidationCloseFactor": {
      return new UpdateLiquidationCloseFactor()
    }
    case "UpdateLiquidationMaxValue": {
      return new UpdateLiquidationMaxValue()
    }
    case "DeprecatedUpdateGlobalUnhealthyBorrow": {
      return new DeprecatedUpdateGlobalUnhealthyBorrow()
    }
    case "UpdateGlobalAllowedBorrow": {
      return new UpdateGlobalAllowedBorrow()
    }
    case "UpdateEmergencyCouncil": {
      return new UpdateEmergencyCouncil()
    }
    case "UpdateMinFullLiquidationThreshold": {
      return new UpdateMinFullLiquidationThreshold()
    }
    case "UpdateInsolvencyRiskLtv": {
      return new UpdateInsolvencyRiskLtv()
    }
    case "UpdateElevationGroup": {
      return new UpdateElevationGroup()
    }
    case "UpdateReferralFeeBps": {
      return new UpdateReferralFeeBps()
    }
    case "DeprecatedUpdateMultiplierPoints": {
      return new DeprecatedUpdateMultiplierPoints()
    }
    case "UpdatePriceRefreshTriggerToMaxAgePct": {
      return new UpdatePriceRefreshTriggerToMaxAgePct()
    }
    case "UpdateAutodeleverageEnabled": {
      return new UpdateAutodeleverageEnabled()
    }
    case "UpdateBorrowingDisabled": {
      return new UpdateBorrowingDisabled()
    }
    case "UpdateMinNetValueObligationPostAction": {
      return new UpdateMinNetValueObligationPostAction()
    }
    case "UpdateMinValueLtvSkipPriorityLiqCheck": {
      return new UpdateMinValueLtvSkipPriorityLiqCheck()
    }
    case "UpdateMinValueBfSkipPriorityLiqCheck": {
      return new UpdateMinValueBfSkipPriorityLiqCheck()
    }
    case "UpdatePaddingFields": {
      return new UpdatePaddingFields()
    }
    case "UpdateName": {
      return new UpdateName()
    }
    case "UpdateIndividualAutodeleverageMarginCallPeriodSecs": {
      return new UpdateIndividualAutodeleverageMarginCallPeriodSecs()
    }
    case "UpdateInitialDepositAmount": {
      return new UpdateInitialDepositAmount()
    }
    case "UpdateObligationOrderExecutionEnabled": {
      return new UpdateObligationOrderExecutionEnabled()
    }
    case "UpdateImmutableFlag": {
      return new UpdateImmutableFlag()
    }
    case "UpdateObligationOrderCreationEnabled": {
      return new UpdateObligationOrderCreationEnabled()
    }
    case "UpdateProposerAuthority": {
      return new UpdateProposerAuthority()
    }
    case "UpdatePriceTriggeredLiquidationDisabled": {
      return new UpdatePriceTriggeredLiquidationDisabled()
    }
    case "UpdateMatureReserveDebtLiquidationEnabled": {
      return new UpdateMatureReserveDebtLiquidationEnabled()
    }
    case "UpdateObligationBorrowDebtTermLiquidationEnabled": {
      return new UpdateObligationBorrowDebtTermLiquidationEnabled()
    }
    case "UpdateBorrowOrderCreationEnabled": {
      return new UpdateBorrowOrderCreationEnabled()
    }
    case "UpdateBorrowOrderExecutionEnabled": {
      return new UpdateBorrowOrderExecutionEnabled()
    }
    case "UpdateMinBorrowOrderFillValue": {
      return new UpdateMinBorrowOrderFillValue()
    }
    case "UpdateWithdrawTicketIssuanceEnabled": {
      return new UpdateWithdrawTicketIssuanceEnabled()
    }
    case "UpdateWithdrawTicketRedemptionEnabled": {
      return new UpdateWithdrawTicketRedemptionEnabled()
    }
    case "UpdateMinWithdrawQueuedLiquidityValue": {
      return new UpdateMinWithdrawQueuedLiquidityValue()
    }
    case "UpdateFixedTermRolloverWindowDurationSeconds": {
      return new UpdateFixedTermRolloverWindowDurationSeconds()
    }
    case "UpdateOpenTermRolloverWindowDurationSeconds": {
      return new UpdateOpenTermRolloverWindowDurationSeconds()
    }
    case "UpdateObligationBorrowRolloverConfigurationEnabled": {
      return new UpdateObligationBorrowRolloverConfigurationEnabled()
    }
    case "UpdateTermBasedFullLiquidationDurationSecs": {
      return new UpdateTermBasedFullLiquidationDurationSecs()
    }
    case "UpdateObligationBorrowMigrationToFixedExecutionEnabled": {
      return new UpdateObligationBorrowMigrationToFixedExecutionEnabled()
    }
    case "UpdateMinPartialRolloverValue": {
      return new UpdateMinPartialRolloverValue()
    }
    case "UpdateWithdrawTicketCancellationEnabled": {
      return new UpdateWithdrawTicketCancellationEnabled()
    }
    case "UpdatePermissioningAuthority": {
      return new UpdatePermissioningAuthority()
    }
    case "UpdatePermissionedOps": {
      return new UpdatePermissionedOps()
    }
    case "DeprecatedUpdateReserveRewardsMaxAprPct": {
      return new DeprecatedUpdateReserveRewardsMaxAprPct()
    }
    case "UpdateReserveRewardsMaxAprBps": {
      return new UpdateReserveRewardsMaxAprBps()
    }
    case "UpdateDisableNonceBlock": {
      return new UpdateDisableNonceBlock()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "UpdateOwner"),
    borsh.struct([], "UpdateEmergencyMode"),
    borsh.struct([], "UpdateLiquidationCloseFactor"),
    borsh.struct([], "UpdateLiquidationMaxValue"),
    borsh.struct([], "DeprecatedUpdateGlobalUnhealthyBorrow"),
    borsh.struct([], "UpdateGlobalAllowedBorrow"),
    borsh.struct([], "UpdateEmergencyCouncil"),
    borsh.struct([], "UpdateMinFullLiquidationThreshold"),
    borsh.struct([], "UpdateInsolvencyRiskLtv"),
    borsh.struct([], "UpdateElevationGroup"),
    borsh.struct([], "UpdateReferralFeeBps"),
    borsh.struct([], "DeprecatedUpdateMultiplierPoints"),
    borsh.struct([], "UpdatePriceRefreshTriggerToMaxAgePct"),
    borsh.struct([], "UpdateAutodeleverageEnabled"),
    borsh.struct([], "UpdateBorrowingDisabled"),
    borsh.struct([], "UpdateMinNetValueObligationPostAction"),
    borsh.struct([], "UpdateMinValueLtvSkipPriorityLiqCheck"),
    borsh.struct([], "UpdateMinValueBfSkipPriorityLiqCheck"),
    borsh.struct([], "UpdatePaddingFields"),
    borsh.struct([], "UpdateName"),
    borsh.struct([], "UpdateIndividualAutodeleverageMarginCallPeriodSecs"),
    borsh.struct([], "UpdateInitialDepositAmount"),
    borsh.struct([], "UpdateObligationOrderExecutionEnabled"),
    borsh.struct([], "UpdateImmutableFlag"),
    borsh.struct([], "UpdateObligationOrderCreationEnabled"),
    borsh.struct([], "UpdateProposerAuthority"),
    borsh.struct([], "UpdatePriceTriggeredLiquidationDisabled"),
    borsh.struct([], "UpdateMatureReserveDebtLiquidationEnabled"),
    borsh.struct([], "UpdateObligationBorrowDebtTermLiquidationEnabled"),
    borsh.struct([], "UpdateBorrowOrderCreationEnabled"),
    borsh.struct([], "UpdateBorrowOrderExecutionEnabled"),
    borsh.struct([], "UpdateMinBorrowOrderFillValue"),
    borsh.struct([], "UpdateWithdrawTicketIssuanceEnabled"),
    borsh.struct([], "UpdateWithdrawTicketRedemptionEnabled"),
    borsh.struct([], "UpdateMinWithdrawQueuedLiquidityValue"),
    borsh.struct([], "UpdateFixedTermRolloverWindowDurationSeconds"),
    borsh.struct([], "UpdateOpenTermRolloverWindowDurationSeconds"),
    borsh.struct([], "UpdateObligationBorrowRolloverConfigurationEnabled"),
    borsh.struct([], "UpdateTermBasedFullLiquidationDurationSecs"),
    borsh.struct([], "UpdateObligationBorrowMigrationToFixedExecutionEnabled"),
    borsh.struct([], "UpdateMinPartialRolloverValue"),
    borsh.struct([], "UpdateWithdrawTicketCancellationEnabled"),
    borsh.struct([], "UpdatePermissioningAuthority"),
    borsh.struct([], "UpdatePermissionedOps"),
    borsh.struct([], "DeprecatedUpdateReserveRewardsMaxAprPct"),
    borsh.struct([], "UpdateReserveRewardsMaxAprBps"),
    borsh.struct([], "UpdateDisableNonceBlock"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
