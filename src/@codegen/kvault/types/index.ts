import * as VaultConfigField from "./VaultConfigField"

export { LastUpdate } from "./LastUpdate"
export type { LastUpdateFields, LastUpdateJSON } from "./LastUpdate"
export { BigFractionBytes } from "./BigFractionBytes"
export type {
  BigFractionBytesFields,
  BigFractionBytesJSON,
} from "./BigFractionBytes"
export { ReserveCollateral } from "./ReserveCollateral"
export type {
  ReserveCollateralFields,
  ReserveCollateralJSON,
} from "./ReserveCollateral"
export { ReserveConfig } from "./ReserveConfig"
export type { ReserveConfigFields, ReserveConfigJSON } from "./ReserveConfig"
export { ReserveFees } from "./ReserveFees"
export type { ReserveFeesFields, ReserveFeesJSON } from "./ReserveFees"
export { ReserveLiquidity } from "./ReserveLiquidity"
export type {
  ReserveLiquidityFields,
  ReserveLiquidityJSON,
} from "./ReserveLiquidity"
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
export { VaultConfigField }

export type VaultConfigFieldKind =
  | VaultConfigField.PerformanceFeeBps
  | VaultConfigField.ManagementFeeBps
  | VaultConfigField.MinDepositAmount
  | VaultConfigField.MinWithdrawAmount
  | VaultConfigField.MinInvestAmount
  | VaultConfigField.MinInvestDelaySlots
  | VaultConfigField.CrankFundFeePerReserve
  | VaultConfigField.PendingVaultAdmin
  | VaultConfigField.Name
  | VaultConfigField.LookupTable
  | VaultConfigField.Farm
  | VaultConfigField.AllocationAdmin
  | VaultConfigField.UnallocatedWeight
  | VaultConfigField.UnallocatedTokensCap
export type VaultConfigFieldJSON =
  | VaultConfigField.PerformanceFeeBpsJSON
  | VaultConfigField.ManagementFeeBpsJSON
  | VaultConfigField.MinDepositAmountJSON
  | VaultConfigField.MinWithdrawAmountJSON
  | VaultConfigField.MinInvestAmountJSON
  | VaultConfigField.MinInvestDelaySlotsJSON
  | VaultConfigField.CrankFundFeePerReserveJSON
  | VaultConfigField.PendingVaultAdminJSON
  | VaultConfigField.NameJSON
  | VaultConfigField.LookupTableJSON
  | VaultConfigField.FarmJSON
  | VaultConfigField.AllocationAdminJSON
  | VaultConfigField.UnallocatedWeightJSON
  | VaultConfigField.UnallocatedTokensCapJSON

export { VaultAllocation } from "./VaultAllocation"
export type {
  VaultAllocationFields,
  VaultAllocationJSON,
} from "./VaultAllocation"
