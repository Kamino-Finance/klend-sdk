import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface ReserveConfigFields {
  /** Status of the reserve Active/Obsolete/Hidden */
  status: number
  /** Asset tier -> 0 - regular (collateral & debt), 1 - isolated collateral, 2 - isolated debt */
  assetTier: number
  reserved0: Array<number>
  /** Boost for side (debt or collateral) */
  multiplierSideBoost: Array<number>
  /** Reward points multiplier per obligation type */
  multiplierTagBoost: Array<number>
  /** Protocol take rate is the amount borrowed interest protocol receives, as a percentage */
  protocolTakeRatePct: number
  /** Cut of the liquidation bonus that the protocol receives, as a percentage */
  protocolLiquidationFeePct: number
  /**
   * Target ratio of the value of borrows to deposits, as a percentage
   * 0 if use as collateral is disabled
   */
  loanToValuePct: number
  /** Loan to value ratio at which an obligation can be liquidated, as percentage */
  liquidationThresholdPct: number
  /** Minimum bonus a liquidator receives when repaying part of an unhealthy obligation, as bps */
  minLiquidationBonusBps: number
  /** Maximum bonus a liquidator receives when repaying part of an unhealthy obligation, as bps */
  maxLiquidationBonusBps: number
  /** Bad debt liquidation bonus for an undercollateralized obligation, as bps */
  badDebtLiquidationBonusBps: number
  /** Time in seconds that must pass before redemptions are enabled after the deposit limit is crossed */
  deleveragingMarginCallPeriodSecs: BN
  /**
   * The rate at which the deleveraging threshold decreases in slots per bps
   * e.g. 1 bps per hour would be 7200 slots per bps (assuming 2 slots per second)
   */
  deleveragingThresholdSlotsPerBps: BN
  /** Program owner fees assessed, separate from gains due to interest accrual */
  fees: types.ReserveFeesFields
  /** Borrow rate curve based on utilization */
  borrowRateCurve: types.BorrowRateCurveFields
  /** Borrow factor in percentage - used for risk adjustment */
  borrowFactorPct: BN
  /** Maximum deposit limit of liquidity in native units, u64::MAX for inf */
  depositLimit: BN
  /** Maximum amount borrowed, u64::MAX for inf, 0 to disable borrows (protected deposits) */
  borrowLimit: BN
  /** Token id from TokenInfos struct */
  tokenInfo: types.TokenInfoFields
  /** Deposit withdrawl caps - deposit & redeem */
  depositWithdrawalCap: types.WithdrawalCapsFields
  /** Debt withdrawl caps - borrow & repay */
  debtWithdrawalCap: types.WithdrawalCapsFields
  elevationGroups: Array<number>
  disableUsageAsCollOutsideEmode: number
  reserved1: Array<number>
}

export interface ReserveConfigJSON {
  /** Status of the reserve Active/Obsolete/Hidden */
  status: number
  /** Asset tier -> 0 - regular (collateral & debt), 1 - isolated collateral, 2 - isolated debt */
  assetTier: number
  reserved0: Array<number>
  /** Boost for side (debt or collateral) */
  multiplierSideBoost: Array<number>
  /** Reward points multiplier per obligation type */
  multiplierTagBoost: Array<number>
  /** Protocol take rate is the amount borrowed interest protocol receives, as a percentage */
  protocolTakeRatePct: number
  /** Cut of the liquidation bonus that the protocol receives, as a percentage */
  protocolLiquidationFeePct: number
  /**
   * Target ratio of the value of borrows to deposits, as a percentage
   * 0 if use as collateral is disabled
   */
  loanToValuePct: number
  /** Loan to value ratio at which an obligation can be liquidated, as percentage */
  liquidationThresholdPct: number
  /** Minimum bonus a liquidator receives when repaying part of an unhealthy obligation, as bps */
  minLiquidationBonusBps: number
  /** Maximum bonus a liquidator receives when repaying part of an unhealthy obligation, as bps */
  maxLiquidationBonusBps: number
  /** Bad debt liquidation bonus for an undercollateralized obligation, as bps */
  badDebtLiquidationBonusBps: number
  /** Time in seconds that must pass before redemptions are enabled after the deposit limit is crossed */
  deleveragingMarginCallPeriodSecs: string
  /**
   * The rate at which the deleveraging threshold decreases in slots per bps
   * e.g. 1 bps per hour would be 7200 slots per bps (assuming 2 slots per second)
   */
  deleveragingThresholdSlotsPerBps: string
  /** Program owner fees assessed, separate from gains due to interest accrual */
  fees: types.ReserveFeesJSON
  /** Borrow rate curve based on utilization */
  borrowRateCurve: types.BorrowRateCurveJSON
  /** Borrow factor in percentage - used for risk adjustment */
  borrowFactorPct: string
  /** Maximum deposit limit of liquidity in native units, u64::MAX for inf */
  depositLimit: string
  /** Maximum amount borrowed, u64::MAX for inf, 0 to disable borrows (protected deposits) */
  borrowLimit: string
  /** Token id from TokenInfos struct */
  tokenInfo: types.TokenInfoJSON
  /** Deposit withdrawl caps - deposit & redeem */
  depositWithdrawalCap: types.WithdrawalCapsJSON
  /** Debt withdrawl caps - borrow & repay */
  debtWithdrawalCap: types.WithdrawalCapsJSON
  elevationGroups: Array<number>
  disableUsageAsCollOutsideEmode: number
  reserved1: Array<number>
}

/** Reserve configuration values */
export class ReserveConfig {
  /** Status of the reserve Active/Obsolete/Hidden */
  readonly status: number
  /** Asset tier -> 0 - regular (collateral & debt), 1 - isolated collateral, 2 - isolated debt */
  readonly assetTier: number
  readonly reserved0: Array<number>
  /** Boost for side (debt or collateral) */
  readonly multiplierSideBoost: Array<number>
  /** Reward points multiplier per obligation type */
  readonly multiplierTagBoost: Array<number>
  /** Protocol take rate is the amount borrowed interest protocol receives, as a percentage */
  readonly protocolTakeRatePct: number
  /** Cut of the liquidation bonus that the protocol receives, as a percentage */
  readonly protocolLiquidationFeePct: number
  /**
   * Target ratio of the value of borrows to deposits, as a percentage
   * 0 if use as collateral is disabled
   */
  readonly loanToValuePct: number
  /** Loan to value ratio at which an obligation can be liquidated, as percentage */
  readonly liquidationThresholdPct: number
  /** Minimum bonus a liquidator receives when repaying part of an unhealthy obligation, as bps */
  readonly minLiquidationBonusBps: number
  /** Maximum bonus a liquidator receives when repaying part of an unhealthy obligation, as bps */
  readonly maxLiquidationBonusBps: number
  /** Bad debt liquidation bonus for an undercollateralized obligation, as bps */
  readonly badDebtLiquidationBonusBps: number
  /** Time in seconds that must pass before redemptions are enabled after the deposit limit is crossed */
  readonly deleveragingMarginCallPeriodSecs: BN
  /**
   * The rate at which the deleveraging threshold decreases in slots per bps
   * e.g. 1 bps per hour would be 7200 slots per bps (assuming 2 slots per second)
   */
  readonly deleveragingThresholdSlotsPerBps: BN
  /** Program owner fees assessed, separate from gains due to interest accrual */
  readonly fees: types.ReserveFees
  /** Borrow rate curve based on utilization */
  readonly borrowRateCurve: types.BorrowRateCurve
  /** Borrow factor in percentage - used for risk adjustment */
  readonly borrowFactorPct: BN
  /** Maximum deposit limit of liquidity in native units, u64::MAX for inf */
  readonly depositLimit: BN
  /** Maximum amount borrowed, u64::MAX for inf, 0 to disable borrows (protected deposits) */
  readonly borrowLimit: BN
  /** Token id from TokenInfos struct */
  readonly tokenInfo: types.TokenInfo
  /** Deposit withdrawl caps - deposit & redeem */
  readonly depositWithdrawalCap: types.WithdrawalCaps
  /** Debt withdrawl caps - borrow & repay */
  readonly debtWithdrawalCap: types.WithdrawalCaps
  readonly elevationGroups: Array<number>
  readonly disableUsageAsCollOutsideEmode: number
  readonly reserved1: Array<number>

  constructor(fields: ReserveConfigFields) {
    this.status = fields.status
    this.assetTier = fields.assetTier
    this.reserved0 = fields.reserved0
    this.multiplierSideBoost = fields.multiplierSideBoost
    this.multiplierTagBoost = fields.multiplierTagBoost
    this.protocolTakeRatePct = fields.protocolTakeRatePct
    this.protocolLiquidationFeePct = fields.protocolLiquidationFeePct
    this.loanToValuePct = fields.loanToValuePct
    this.liquidationThresholdPct = fields.liquidationThresholdPct
    this.minLiquidationBonusBps = fields.minLiquidationBonusBps
    this.maxLiquidationBonusBps = fields.maxLiquidationBonusBps
    this.badDebtLiquidationBonusBps = fields.badDebtLiquidationBonusBps
    this.deleveragingMarginCallPeriodSecs =
      fields.deleveragingMarginCallPeriodSecs
    this.deleveragingThresholdSlotsPerBps =
      fields.deleveragingThresholdSlotsPerBps
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
    this.reserved1 = fields.reserved1
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u8("status"),
        borsh.u8("assetTier"),
        borsh.array(borsh.u8(), 2, "reserved0"),
        borsh.array(borsh.u8(), 2, "multiplierSideBoost"),
        borsh.array(borsh.u8(), 8, "multiplierTagBoost"),
        borsh.u8("protocolTakeRatePct"),
        borsh.u8("protocolLiquidationFeePct"),
        borsh.u8("loanToValuePct"),
        borsh.u8("liquidationThresholdPct"),
        borsh.u16("minLiquidationBonusBps"),
        borsh.u16("maxLiquidationBonusBps"),
        borsh.u16("badDebtLiquidationBonusBps"),
        borsh.u64("deleveragingMarginCallPeriodSecs"),
        borsh.u64("deleveragingThresholdSlotsPerBps"),
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
        borsh.array(borsh.u8(), 3, "reserved1"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveConfig({
      status: obj.status,
      assetTier: obj.assetTier,
      reserved0: obj.reserved0,
      multiplierSideBoost: obj.multiplierSideBoost,
      multiplierTagBoost: obj.multiplierTagBoost,
      protocolTakeRatePct: obj.protocolTakeRatePct,
      protocolLiquidationFeePct: obj.protocolLiquidationFeePct,
      loanToValuePct: obj.loanToValuePct,
      liquidationThresholdPct: obj.liquidationThresholdPct,
      minLiquidationBonusBps: obj.minLiquidationBonusBps,
      maxLiquidationBonusBps: obj.maxLiquidationBonusBps,
      badDebtLiquidationBonusBps: obj.badDebtLiquidationBonusBps,
      deleveragingMarginCallPeriodSecs: obj.deleveragingMarginCallPeriodSecs,
      deleveragingThresholdSlotsPerBps: obj.deleveragingThresholdSlotsPerBps,
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
      reserved1: obj.reserved1,
    })
  }

  static toEncodable(fields: ReserveConfigFields) {
    return {
      status: fields.status,
      assetTier: fields.assetTier,
      reserved0: fields.reserved0,
      multiplierSideBoost: fields.multiplierSideBoost,
      multiplierTagBoost: fields.multiplierTagBoost,
      protocolTakeRatePct: fields.protocolTakeRatePct,
      protocolLiquidationFeePct: fields.protocolLiquidationFeePct,
      loanToValuePct: fields.loanToValuePct,
      liquidationThresholdPct: fields.liquidationThresholdPct,
      minLiquidationBonusBps: fields.minLiquidationBonusBps,
      maxLiquidationBonusBps: fields.maxLiquidationBonusBps,
      badDebtLiquidationBonusBps: fields.badDebtLiquidationBonusBps,
      deleveragingMarginCallPeriodSecs: fields.deleveragingMarginCallPeriodSecs,
      deleveragingThresholdSlotsPerBps: fields.deleveragingThresholdSlotsPerBps,
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
      reserved1: fields.reserved1,
    }
  }

  toJSON(): ReserveConfigJSON {
    return {
      status: this.status,
      assetTier: this.assetTier,
      reserved0: this.reserved0,
      multiplierSideBoost: this.multiplierSideBoost,
      multiplierTagBoost: this.multiplierTagBoost,
      protocolTakeRatePct: this.protocolTakeRatePct,
      protocolLiquidationFeePct: this.protocolLiquidationFeePct,
      loanToValuePct: this.loanToValuePct,
      liquidationThresholdPct: this.liquidationThresholdPct,
      minLiquidationBonusBps: this.minLiquidationBonusBps,
      maxLiquidationBonusBps: this.maxLiquidationBonusBps,
      badDebtLiquidationBonusBps: this.badDebtLiquidationBonusBps,
      deleveragingMarginCallPeriodSecs:
        this.deleveragingMarginCallPeriodSecs.toString(),
      deleveragingThresholdSlotsPerBps:
        this.deleveragingThresholdSlotsPerBps.toString(),
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
      reserved1: this.reserved1,
    }
  }

  static fromJSON(obj: ReserveConfigJSON): ReserveConfig {
    return new ReserveConfig({
      status: obj.status,
      assetTier: obj.assetTier,
      reserved0: obj.reserved0,
      multiplierSideBoost: obj.multiplierSideBoost,
      multiplierTagBoost: obj.multiplierTagBoost,
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
      deleveragingThresholdSlotsPerBps: new BN(
        obj.deleveragingThresholdSlotsPerBps
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
      reserved1: obj.reserved1,
    })
  }

  toEncodable() {
    return ReserveConfig.toEncodable(this)
  }
}
