import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveConfigFields {
  status: number
  paddingDeprecatedAssetTier: number
  hostFixedInterestRateBps: number
  minDeleveragingBonusBps: number
  blockCtokenUsage: number
  earlyRepayRemainingInterestPct: number
  emergencyMode: number
  interestRateBasis: number
  reserved1: Array<number>
  protocolOrderExecutionFeePct: number
  protocolTakeRatePct: number
  protocolLiquidationFeePct: number
  loanToValuePct: number
  liquidationThresholdPct: number
  minLiquidationBonusBps: number
  maxLiquidationBonusBps: number
  badDebtLiquidationBonusBps: number
  deleveragingMarginCallPeriodSecs: BN
  deleveragingThresholdDecreaseBpsPerDay: BN
  fees: types.ReserveFeesFields
  borrowRateCurve: types.BorrowRateCurveFields
  borrowFactorPct: BN
  depositLimit: BN
  borrowLimit: BN
  tokenInfo: types.TokenInfoFields
  depositWithdrawalCap: types.WithdrawalCapsFields
  debtWithdrawalCap: types.WithdrawalCapsFields
  elevationGroups: Array<number>
  disableUsageAsCollOutsideEmode: number
  utilizationLimitBlockBorrowingAbovePct: number
  autodeleverageEnabled: number
  proposerAuthorityLocked: number
  borrowLimitOutsideElevationGroup: BN
  borrowLimitAgainstThisCollateralInElevationGroup: Array<BN>
  deleveragingBonusIncreaseBpsPerDay: BN
  debtMaturityTimestamp: BN
  debtTermSeconds: BN
  rewardsAmountPerAccrualUnit: BN
  permissionedOps: BN
}

export interface ReserveConfigJSON {
  status: number
  paddingDeprecatedAssetTier: number
  hostFixedInterestRateBps: number
  minDeleveragingBonusBps: number
  blockCtokenUsage: number
  earlyRepayRemainingInterestPct: number
  emergencyMode: number
  interestRateBasis: number
  reserved1: Array<number>
  protocolOrderExecutionFeePct: number
  protocolTakeRatePct: number
  protocolLiquidationFeePct: number
  loanToValuePct: number
  liquidationThresholdPct: number
  minLiquidationBonusBps: number
  maxLiquidationBonusBps: number
  badDebtLiquidationBonusBps: number
  deleveragingMarginCallPeriodSecs: string
  deleveragingThresholdDecreaseBpsPerDay: string
  fees: types.ReserveFeesJSON
  borrowRateCurve: types.BorrowRateCurveJSON
  borrowFactorPct: string
  depositLimit: string
  borrowLimit: string
  tokenInfo: types.TokenInfoJSON
  depositWithdrawalCap: types.WithdrawalCapsJSON
  debtWithdrawalCap: types.WithdrawalCapsJSON
  elevationGroups: Array<number>
  disableUsageAsCollOutsideEmode: number
  utilizationLimitBlockBorrowingAbovePct: number
  autodeleverageEnabled: number
  proposerAuthorityLocked: number
  borrowLimitOutsideElevationGroup: string
  borrowLimitAgainstThisCollateralInElevationGroup: Array<string>
  deleveragingBonusIncreaseBpsPerDay: string
  debtMaturityTimestamp: string
  debtTermSeconds: string
  rewardsAmountPerAccrualUnit: string
  permissionedOps: string
}

export class ReserveConfig {
  readonly status: number
  readonly paddingDeprecatedAssetTier: number
  readonly hostFixedInterestRateBps: number
  readonly minDeleveragingBonusBps: number
  readonly blockCtokenUsage: number
  readonly earlyRepayRemainingInterestPct: number
  readonly emergencyMode: number
  readonly interestRateBasis: number
  readonly reserved1: Array<number>
  readonly protocolOrderExecutionFeePct: number
  readonly protocolTakeRatePct: number
  readonly protocolLiquidationFeePct: number
  readonly loanToValuePct: number
  readonly liquidationThresholdPct: number
  readonly minLiquidationBonusBps: number
  readonly maxLiquidationBonusBps: number
  readonly badDebtLiquidationBonusBps: number
  readonly deleveragingMarginCallPeriodSecs: BN
  readonly deleveragingThresholdDecreaseBpsPerDay: BN
  readonly fees: types.ReserveFees
  readonly borrowRateCurve: types.BorrowRateCurve
  readonly borrowFactorPct: BN
  readonly depositLimit: BN
  readonly borrowLimit: BN
  readonly tokenInfo: types.TokenInfo
  readonly depositWithdrawalCap: types.WithdrawalCaps
  readonly debtWithdrawalCap: types.WithdrawalCaps
  readonly elevationGroups: Array<number>
  readonly disableUsageAsCollOutsideEmode: number
  readonly utilizationLimitBlockBorrowingAbovePct: number
  readonly autodeleverageEnabled: number
  readonly proposerAuthorityLocked: number
  readonly borrowLimitOutsideElevationGroup: BN
  readonly borrowLimitAgainstThisCollateralInElevationGroup: Array<BN>
  readonly deleveragingBonusIncreaseBpsPerDay: BN
  readonly debtMaturityTimestamp: BN
  readonly debtTermSeconds: BN
  readonly rewardsAmountPerAccrualUnit: BN
  readonly permissionedOps: BN

  constructor(fields: ReserveConfigFields) {
    this.status = fields.status
    this.paddingDeprecatedAssetTier = fields.paddingDeprecatedAssetTier
    this.hostFixedInterestRateBps = fields.hostFixedInterestRateBps
    this.minDeleveragingBonusBps = fields.minDeleveragingBonusBps
    this.blockCtokenUsage = fields.blockCtokenUsage
    this.earlyRepayRemainingInterestPct = fields.earlyRepayRemainingInterestPct
    this.emergencyMode = fields.emergencyMode
    this.interestRateBasis = fields.interestRateBasis
    this.reserved1 = fields.reserved1
    this.protocolOrderExecutionFeePct = fields.protocolOrderExecutionFeePct
    this.protocolTakeRatePct = fields.protocolTakeRatePct
    this.protocolLiquidationFeePct = fields.protocolLiquidationFeePct
    this.loanToValuePct = fields.loanToValuePct
    this.liquidationThresholdPct = fields.liquidationThresholdPct
    this.minLiquidationBonusBps = fields.minLiquidationBonusBps
    this.maxLiquidationBonusBps = fields.maxLiquidationBonusBps
    this.badDebtLiquidationBonusBps = fields.badDebtLiquidationBonusBps
    this.deleveragingMarginCallPeriodSecs =
      fields.deleveragingMarginCallPeriodSecs
    this.deleveragingThresholdDecreaseBpsPerDay =
      fields.deleveragingThresholdDecreaseBpsPerDay
    this.fees = new types.ReserveFees({ ...fields.fees })
    this.borrowRateCurve = new types.BorrowRateCurve({
      ...fields.borrowRateCurve,
    })
    this.borrowFactorPct = fields.borrowFactorPct
    this.depositLimit = fields.depositLimit
    this.borrowLimit = fields.borrowLimit
    this.tokenInfo = new types.TokenInfo({ ...fields.tokenInfo })
    this.depositWithdrawalCap = new types.WithdrawalCaps({
      ...fields.depositWithdrawalCap,
    })
    this.debtWithdrawalCap = new types.WithdrawalCaps({
      ...fields.debtWithdrawalCap,
    })
    this.elevationGroups = fields.elevationGroups
    this.disableUsageAsCollOutsideEmode = fields.disableUsageAsCollOutsideEmode
    this.utilizationLimitBlockBorrowingAbovePct =
      fields.utilizationLimitBlockBorrowingAbovePct
    this.autodeleverageEnabled = fields.autodeleverageEnabled
    this.proposerAuthorityLocked = fields.proposerAuthorityLocked
    this.borrowLimitOutsideElevationGroup =
      fields.borrowLimitOutsideElevationGroup
    this.borrowLimitAgainstThisCollateralInElevationGroup =
      fields.borrowLimitAgainstThisCollateralInElevationGroup
    this.deleveragingBonusIncreaseBpsPerDay =
      fields.deleveragingBonusIncreaseBpsPerDay
    this.debtMaturityTimestamp = fields.debtMaturityTimestamp
    this.debtTermSeconds = fields.debtTermSeconds
    this.rewardsAmountPerAccrualUnit = fields.rewardsAmountPerAccrualUnit
    this.permissionedOps = fields.permissionedOps
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u8("status"),
        borsh.u8("paddingDeprecatedAssetTier"),
        borsh.u16("hostFixedInterestRateBps"),
        borsh.u16("minDeleveragingBonusBps"),
        borsh.u8("blockCtokenUsage"),
        borsh.u8("earlyRepayRemainingInterestPct"),
        borsh.u8("emergencyMode"),
        borsh.u8("interestRateBasis"),
        borsh.array(borsh.u8(), 3, "reserved1"),
        borsh.u8("protocolOrderExecutionFeePct"),
        borsh.u8("protocolTakeRatePct"),
        borsh.u8("protocolLiquidationFeePct"),
        borsh.u8("loanToValuePct"),
        borsh.u8("liquidationThresholdPct"),
        borsh.u16("minLiquidationBonusBps"),
        borsh.u16("maxLiquidationBonusBps"),
        borsh.u16("badDebtLiquidationBonusBps"),
        borsh.u64("deleveragingMarginCallPeriodSecs"),
        borsh.u64("deleveragingThresholdDecreaseBpsPerDay"),
        types.ReserveFees.layout("fees"),
        types.BorrowRateCurve.layout("borrowRateCurve"),
        borsh.u64("borrowFactorPct"),
        borsh.u64("depositLimit"),
        borsh.u64("borrowLimit"),
        types.TokenInfo.layout("tokenInfo"),
        types.WithdrawalCaps.layout("depositWithdrawalCap"),
        types.WithdrawalCaps.layout("debtWithdrawalCap"),
        borsh.array(borsh.u8(), 20, "elevationGroups"),
        borsh.u8("disableUsageAsCollOutsideEmode"),
        borsh.u8("utilizationLimitBlockBorrowingAbovePct"),
        borsh.u8("autodeleverageEnabled"),
        borsh.u8("proposerAuthorityLocked"),
        borsh.u64("borrowLimitOutsideElevationGroup"),
        borsh.array(
          borsh.u64(),
          32,
          "borrowLimitAgainstThisCollateralInElevationGroup"
        ),
        borsh.u64("deleveragingBonusIncreaseBpsPerDay"),
        borsh.u64("debtMaturityTimestamp"),
        borsh.u64("debtTermSeconds"),
        borsh.u64("rewardsAmountPerAccrualUnit"),
        borsh.u64("permissionedOps"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveConfig({
      status: obj.status,
      paddingDeprecatedAssetTier: obj.paddingDeprecatedAssetTier,
      hostFixedInterestRateBps: obj.hostFixedInterestRateBps,
      minDeleveragingBonusBps: obj.minDeleveragingBonusBps,
      blockCtokenUsage: obj.blockCtokenUsage,
      earlyRepayRemainingInterestPct: obj.earlyRepayRemainingInterestPct,
      emergencyMode: obj.emergencyMode,
      interestRateBasis: obj.interestRateBasis,
      reserved1: obj.reserved1,
      protocolOrderExecutionFeePct: obj.protocolOrderExecutionFeePct,
      protocolTakeRatePct: obj.protocolTakeRatePct,
      protocolLiquidationFeePct: obj.protocolLiquidationFeePct,
      loanToValuePct: obj.loanToValuePct,
      liquidationThresholdPct: obj.liquidationThresholdPct,
      minLiquidationBonusBps: obj.minLiquidationBonusBps,
      maxLiquidationBonusBps: obj.maxLiquidationBonusBps,
      badDebtLiquidationBonusBps: obj.badDebtLiquidationBonusBps,
      deleveragingMarginCallPeriodSecs: obj.deleveragingMarginCallPeriodSecs,
      deleveragingThresholdDecreaseBpsPerDay:
        obj.deleveragingThresholdDecreaseBpsPerDay,
      fees: types.ReserveFees.fromDecoded(obj.fees),
      borrowRateCurve: types.BorrowRateCurve.fromDecoded(obj.borrowRateCurve),
      borrowFactorPct: obj.borrowFactorPct,
      depositLimit: obj.depositLimit,
      borrowLimit: obj.borrowLimit,
      tokenInfo: types.TokenInfo.fromDecoded(obj.tokenInfo),
      depositWithdrawalCap: types.WithdrawalCaps.fromDecoded(
        obj.depositWithdrawalCap
      ),
      debtWithdrawalCap: types.WithdrawalCaps.fromDecoded(
        obj.debtWithdrawalCap
      ),
      elevationGroups: obj.elevationGroups,
      disableUsageAsCollOutsideEmode: obj.disableUsageAsCollOutsideEmode,
      utilizationLimitBlockBorrowingAbovePct:
        obj.utilizationLimitBlockBorrowingAbovePct,
      autodeleverageEnabled: obj.autodeleverageEnabled,
      proposerAuthorityLocked: obj.proposerAuthorityLocked,
      borrowLimitOutsideElevationGroup: obj.borrowLimitOutsideElevationGroup,
      borrowLimitAgainstThisCollateralInElevationGroup:
        obj.borrowLimitAgainstThisCollateralInElevationGroup,
      deleveragingBonusIncreaseBpsPerDay:
        obj.deleveragingBonusIncreaseBpsPerDay,
      debtMaturityTimestamp: obj.debtMaturityTimestamp,
      debtTermSeconds: obj.debtTermSeconds,
      rewardsAmountPerAccrualUnit: obj.rewardsAmountPerAccrualUnit,
      permissionedOps: obj.permissionedOps,
    })
  }

  static toEncodable(fields: ReserveConfigFields) {
    return {
      status: fields.status,
      paddingDeprecatedAssetTier: fields.paddingDeprecatedAssetTier,
      hostFixedInterestRateBps: fields.hostFixedInterestRateBps,
      minDeleveragingBonusBps: fields.minDeleveragingBonusBps,
      blockCtokenUsage: fields.blockCtokenUsage,
      earlyRepayRemainingInterestPct: fields.earlyRepayRemainingInterestPct,
      emergencyMode: fields.emergencyMode,
      interestRateBasis: fields.interestRateBasis,
      reserved1: fields.reserved1,
      protocolOrderExecutionFeePct: fields.protocolOrderExecutionFeePct,
      protocolTakeRatePct: fields.protocolTakeRatePct,
      protocolLiquidationFeePct: fields.protocolLiquidationFeePct,
      loanToValuePct: fields.loanToValuePct,
      liquidationThresholdPct: fields.liquidationThresholdPct,
      minLiquidationBonusBps: fields.minLiquidationBonusBps,
      maxLiquidationBonusBps: fields.maxLiquidationBonusBps,
      badDebtLiquidationBonusBps: fields.badDebtLiquidationBonusBps,
      deleveragingMarginCallPeriodSecs: fields.deleveragingMarginCallPeriodSecs,
      deleveragingThresholdDecreaseBpsPerDay:
        fields.deleveragingThresholdDecreaseBpsPerDay,
      fees: types.ReserveFees.toEncodable(fields.fees),
      borrowRateCurve: types.BorrowRateCurve.toEncodable(
        fields.borrowRateCurve
      ),
      borrowFactorPct: fields.borrowFactorPct,
      depositLimit: fields.depositLimit,
      borrowLimit: fields.borrowLimit,
      tokenInfo: types.TokenInfo.toEncodable(fields.tokenInfo),
      depositWithdrawalCap: types.WithdrawalCaps.toEncodable(
        fields.depositWithdrawalCap
      ),
      debtWithdrawalCap: types.WithdrawalCaps.toEncodable(
        fields.debtWithdrawalCap
      ),
      elevationGroups: fields.elevationGroups,
      disableUsageAsCollOutsideEmode: fields.disableUsageAsCollOutsideEmode,
      utilizationLimitBlockBorrowingAbovePct:
        fields.utilizationLimitBlockBorrowingAbovePct,
      autodeleverageEnabled: fields.autodeleverageEnabled,
      proposerAuthorityLocked: fields.proposerAuthorityLocked,
      borrowLimitOutsideElevationGroup: fields.borrowLimitOutsideElevationGroup,
      borrowLimitAgainstThisCollateralInElevationGroup:
        fields.borrowLimitAgainstThisCollateralInElevationGroup,
      deleveragingBonusIncreaseBpsPerDay:
        fields.deleveragingBonusIncreaseBpsPerDay,
      debtMaturityTimestamp: fields.debtMaturityTimestamp,
      debtTermSeconds: fields.debtTermSeconds,
      rewardsAmountPerAccrualUnit: fields.rewardsAmountPerAccrualUnit,
      permissionedOps: fields.permissionedOps,
    }
  }

  toJSON(): ReserveConfigJSON {
    return {
      status: this.status,
      paddingDeprecatedAssetTier: this.paddingDeprecatedAssetTier,
      hostFixedInterestRateBps: this.hostFixedInterestRateBps,
      minDeleveragingBonusBps: this.minDeleveragingBonusBps,
      blockCtokenUsage: this.blockCtokenUsage,
      earlyRepayRemainingInterestPct: this.earlyRepayRemainingInterestPct,
      emergencyMode: this.emergencyMode,
      interestRateBasis: this.interestRateBasis,
      reserved1: this.reserved1,
      protocolOrderExecutionFeePct: this.protocolOrderExecutionFeePct,
      protocolTakeRatePct: this.protocolTakeRatePct,
      protocolLiquidationFeePct: this.protocolLiquidationFeePct,
      loanToValuePct: this.loanToValuePct,
      liquidationThresholdPct: this.liquidationThresholdPct,
      minLiquidationBonusBps: this.minLiquidationBonusBps,
      maxLiquidationBonusBps: this.maxLiquidationBonusBps,
      badDebtLiquidationBonusBps: this.badDebtLiquidationBonusBps,
      deleveragingMarginCallPeriodSecs:
        this.deleveragingMarginCallPeriodSecs.toString(),
      deleveragingThresholdDecreaseBpsPerDay:
        this.deleveragingThresholdDecreaseBpsPerDay.toString(),
      fees: this.fees.toJSON(),
      borrowRateCurve: this.borrowRateCurve.toJSON(),
      borrowFactorPct: this.borrowFactorPct.toString(),
      depositLimit: this.depositLimit.toString(),
      borrowLimit: this.borrowLimit.toString(),
      tokenInfo: this.tokenInfo.toJSON(),
      depositWithdrawalCap: this.depositWithdrawalCap.toJSON(),
      debtWithdrawalCap: this.debtWithdrawalCap.toJSON(),
      elevationGroups: this.elevationGroups,
      disableUsageAsCollOutsideEmode: this.disableUsageAsCollOutsideEmode,
      utilizationLimitBlockBorrowingAbovePct:
        this.utilizationLimitBlockBorrowingAbovePct,
      autodeleverageEnabled: this.autodeleverageEnabled,
      proposerAuthorityLocked: this.proposerAuthorityLocked,
      borrowLimitOutsideElevationGroup:
        this.borrowLimitOutsideElevationGroup.toString(),
      borrowLimitAgainstThisCollateralInElevationGroup:
        this.borrowLimitAgainstThisCollateralInElevationGroup.map((item) =>
          item.toString()
        ),
      deleveragingBonusIncreaseBpsPerDay:
        this.deleveragingBonusIncreaseBpsPerDay.toString(),
      debtMaturityTimestamp: this.debtMaturityTimestamp.toString(),
      debtTermSeconds: this.debtTermSeconds.toString(),
      rewardsAmountPerAccrualUnit: this.rewardsAmountPerAccrualUnit.toString(),
      permissionedOps: this.permissionedOps.toString(),
    }
  }

  static fromJSON(obj: ReserveConfigJSON): ReserveConfig {
    return new ReserveConfig({
      status: obj.status,
      paddingDeprecatedAssetTier: obj.paddingDeprecatedAssetTier,
      hostFixedInterestRateBps: obj.hostFixedInterestRateBps,
      minDeleveragingBonusBps: obj.minDeleveragingBonusBps,
      blockCtokenUsage: obj.blockCtokenUsage,
      earlyRepayRemainingInterestPct: obj.earlyRepayRemainingInterestPct,
      emergencyMode: obj.emergencyMode,
      interestRateBasis: obj.interestRateBasis,
      reserved1: obj.reserved1,
      protocolOrderExecutionFeePct: obj.protocolOrderExecutionFeePct,
      protocolTakeRatePct: obj.protocolTakeRatePct,
      protocolLiquidationFeePct: obj.protocolLiquidationFeePct,
      loanToValuePct: obj.loanToValuePct,
      liquidationThresholdPct: obj.liquidationThresholdPct,
      minLiquidationBonusBps: obj.minLiquidationBonusBps,
      maxLiquidationBonusBps: obj.maxLiquidationBonusBps,
      badDebtLiquidationBonusBps: obj.badDebtLiquidationBonusBps,
      deleveragingMarginCallPeriodSecs: new BN(
        obj.deleveragingMarginCallPeriodSecs
      ),
      deleveragingThresholdDecreaseBpsPerDay: new BN(
        obj.deleveragingThresholdDecreaseBpsPerDay
      ),
      fees: types.ReserveFees.fromJSON(obj.fees),
      borrowRateCurve: types.BorrowRateCurve.fromJSON(obj.borrowRateCurve),
      borrowFactorPct: new BN(obj.borrowFactorPct),
      depositLimit: new BN(obj.depositLimit),
      borrowLimit: new BN(obj.borrowLimit),
      tokenInfo: types.TokenInfo.fromJSON(obj.tokenInfo),
      depositWithdrawalCap: types.WithdrawalCaps.fromJSON(
        obj.depositWithdrawalCap
      ),
      debtWithdrawalCap: types.WithdrawalCaps.fromJSON(obj.debtWithdrawalCap),
      elevationGroups: obj.elevationGroups,
      disableUsageAsCollOutsideEmode: obj.disableUsageAsCollOutsideEmode,
      utilizationLimitBlockBorrowingAbovePct:
        obj.utilizationLimitBlockBorrowingAbovePct,
      autodeleverageEnabled: obj.autodeleverageEnabled,
      proposerAuthorityLocked: obj.proposerAuthorityLocked,
      borrowLimitOutsideElevationGroup: new BN(
        obj.borrowLimitOutsideElevationGroup
      ),
      borrowLimitAgainstThisCollateralInElevationGroup:
        obj.borrowLimitAgainstThisCollateralInElevationGroup.map(
          (item) => new BN(item)
        ),
      deleveragingBonusIncreaseBpsPerDay: new BN(
        obj.deleveragingBonusIncreaseBpsPerDay
      ),
      debtMaturityTimestamp: new BN(obj.debtMaturityTimestamp),
      debtTermSeconds: new BN(obj.debtTermSeconds),
      rewardsAmountPerAccrualUnit: new BN(obj.rewardsAmountPerAccrualUnit),
      permissionedOps: new BN(obj.permissionedOps),
    })
  }

  toEncodable() {
    return ReserveConfig.toEncodable(this)
  }
}
