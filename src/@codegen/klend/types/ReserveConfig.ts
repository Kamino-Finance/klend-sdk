import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveConfigFields {
  /** Status of the reserve Active/Obsolete/Hidden */
  status: number
  /** Asset tier -> 0 - regular (collateral & debt), 1 - isolated collateral, 2 - isolated debt */
  assetTier: number
  /** Flat rate that goes to the host */
  hostFixedInterestRateBps: number
  /**
   * [DEPRECATED] Space that used to hold 2 fields:
   * - Boost for side (debt or collateral)
   * - Reward points multiplier per obligation type
   * Can be re-used after making sure all underlying production account data is zeroed.
   */
  reserved2: Array<number>
  /** Cut of the order execution bonus that the protocol receives, as a percentage */
  protocolOrderExecutionFeePct: number
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
  /**
   * Time in seconds that must pass before redemptions are enabled after the deposit limit is
   * crossed.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  deleveragingMarginCallPeriodSecs: BN
  /**
   * The rate at which the deleveraging threshold decreases, in bps per day.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  deleveragingThresholdDecreaseBpsPerDay: BN
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
  /** Deposit withdrawal caps - deposit & redeem */
  depositWithdrawalCap: types.WithdrawalCapsFields
  /** Debt withdrawal caps - borrow & repay */
  debtWithdrawalCap: types.WithdrawalCapsFields
  elevationGroups: Array<number>
  disableUsageAsCollOutsideEmode: number
  /** Utilization (in percentage) above which borrowing is blocked. 0 to disable. */
  utilizationLimitBlockBorrowingAbovePct: number
  /**
   * Whether this reserve should be subject to auto-deleveraging after deposit or borrow limit is
   * crossed.
   * Besides this flag, the lending market's flag also needs to be enabled (logical `AND`).
   * **NOTE:** the manual "target LTV" deleveraging (enabled by the risk council for individual
   * obligations) is NOT affected by this flag.
   */
  autodeleverageEnabled: number
  reserved1: Array<number>
  /**
   * Maximum amount liquidity of this reserve borrowed outside all elevation groups
   * - u64::MAX for inf
   * - 0 to disable borrows outside elevation groups
   */
  borrowLimitOutsideElevationGroup: BN
  /**
   * Defines the maximum amount (in lamports of elevation group debt asset)
   * that can be borrowed when this reserve is used as collateral.
   * - u64::MAX for inf
   * - 0 to disable borrows in this elevation group (expected value for the debt asset)
   */
  borrowLimitAgainstThisCollateralInElevationGroup: Array<BN>
  /**
   * The rate at which the deleveraging-related liquidation bonus increases, in bps per day.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  deleveragingBonusIncreaseBpsPerDay: BN
}

export interface ReserveConfigJSON {
  /** Status of the reserve Active/Obsolete/Hidden */
  status: number
  /** Asset tier -> 0 - regular (collateral & debt), 1 - isolated collateral, 2 - isolated debt */
  assetTier: number
  /** Flat rate that goes to the host */
  hostFixedInterestRateBps: number
  /**
   * [DEPRECATED] Space that used to hold 2 fields:
   * - Boost for side (debt or collateral)
   * - Reward points multiplier per obligation type
   * Can be re-used after making sure all underlying production account data is zeroed.
   */
  reserved2: Array<number>
  /** Cut of the order execution bonus that the protocol receives, as a percentage */
  protocolOrderExecutionFeePct: number
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
  /**
   * Time in seconds that must pass before redemptions are enabled after the deposit limit is
   * crossed.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  deleveragingMarginCallPeriodSecs: string
  /**
   * The rate at which the deleveraging threshold decreases, in bps per day.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  deleveragingThresholdDecreaseBpsPerDay: string
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
  /** Deposit withdrawal caps - deposit & redeem */
  depositWithdrawalCap: types.WithdrawalCapsJSON
  /** Debt withdrawal caps - borrow & repay */
  debtWithdrawalCap: types.WithdrawalCapsJSON
  elevationGroups: Array<number>
  disableUsageAsCollOutsideEmode: number
  /** Utilization (in percentage) above which borrowing is blocked. 0 to disable. */
  utilizationLimitBlockBorrowingAbovePct: number
  /**
   * Whether this reserve should be subject to auto-deleveraging after deposit or borrow limit is
   * crossed.
   * Besides this flag, the lending market's flag also needs to be enabled (logical `AND`).
   * **NOTE:** the manual "target LTV" deleveraging (enabled by the risk council for individual
   * obligations) is NOT affected by this flag.
   */
  autodeleverageEnabled: number
  reserved1: Array<number>
  /**
   * Maximum amount liquidity of this reserve borrowed outside all elevation groups
   * - u64::MAX for inf
   * - 0 to disable borrows outside elevation groups
   */
  borrowLimitOutsideElevationGroup: string
  /**
   * Defines the maximum amount (in lamports of elevation group debt asset)
   * that can be borrowed when this reserve is used as collateral.
   * - u64::MAX for inf
   * - 0 to disable borrows in this elevation group (expected value for the debt asset)
   */
  borrowLimitAgainstThisCollateralInElevationGroup: Array<string>
  /**
   * The rate at which the deleveraging-related liquidation bonus increases, in bps per day.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  deleveragingBonusIncreaseBpsPerDay: string
}

/** Reserve configuration values */
export class ReserveConfig {
  /** Status of the reserve Active/Obsolete/Hidden */
  readonly status: number
  /** Asset tier -> 0 - regular (collateral & debt), 1 - isolated collateral, 2 - isolated debt */
  readonly assetTier: number
  /** Flat rate that goes to the host */
  readonly hostFixedInterestRateBps: number
  /**
   * [DEPRECATED] Space that used to hold 2 fields:
   * - Boost for side (debt or collateral)
   * - Reward points multiplier per obligation type
   * Can be re-used after making sure all underlying production account data is zeroed.
   */
  readonly reserved2: Array<number>
  /** Cut of the order execution bonus that the protocol receives, as a percentage */
  readonly protocolOrderExecutionFeePct: number
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
  /**
   * Time in seconds that must pass before redemptions are enabled after the deposit limit is
   * crossed.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  readonly deleveragingMarginCallPeriodSecs: BN
  /**
   * The rate at which the deleveraging threshold decreases, in bps per day.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  readonly deleveragingThresholdDecreaseBpsPerDay: BN
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
  /** Deposit withdrawal caps - deposit & redeem */
  readonly depositWithdrawalCap: types.WithdrawalCaps
  /** Debt withdrawal caps - borrow & repay */
  readonly debtWithdrawalCap: types.WithdrawalCaps
  readonly elevationGroups: Array<number>
  readonly disableUsageAsCollOutsideEmode: number
  /** Utilization (in percentage) above which borrowing is blocked. 0 to disable. */
  readonly utilizationLimitBlockBorrowingAbovePct: number
  /**
   * Whether this reserve should be subject to auto-deleveraging after deposit or borrow limit is
   * crossed.
   * Besides this flag, the lending market's flag also needs to be enabled (logical `AND`).
   * **NOTE:** the manual "target LTV" deleveraging (enabled by the risk council for individual
   * obligations) is NOT affected by this flag.
   */
  readonly autodeleverageEnabled: number
  readonly reserved1: Array<number>
  /**
   * Maximum amount liquidity of this reserve borrowed outside all elevation groups
   * - u64::MAX for inf
   * - 0 to disable borrows outside elevation groups
   */
  readonly borrowLimitOutsideElevationGroup: BN
  /**
   * Defines the maximum amount (in lamports of elevation group debt asset)
   * that can be borrowed when this reserve is used as collateral.
   * - u64::MAX for inf
   * - 0 to disable borrows in this elevation group (expected value for the debt asset)
   */
  readonly borrowLimitAgainstThisCollateralInElevationGroup: Array<BN>
  /**
   * The rate at which the deleveraging-related liquidation bonus increases, in bps per day.
   * Only relevant when `autodeleverage_enabled == 1`, and must not be 0 in such case.
   */
  readonly deleveragingBonusIncreaseBpsPerDay: BN

  constructor(fields: ReserveConfigFields) {
    this.status = fields.status
    this.assetTier = fields.assetTier
    this.hostFixedInterestRateBps = fields.hostFixedInterestRateBps
    this.reserved2 = fields.reserved2
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
    this.reserved1 = fields.reserved1
    this.borrowLimitOutsideElevationGroup =
      fields.borrowLimitOutsideElevationGroup
    this.borrowLimitAgainstThisCollateralInElevationGroup =
      fields.borrowLimitAgainstThisCollateralInElevationGroup
    this.deleveragingBonusIncreaseBpsPerDay =
      fields.deleveragingBonusIncreaseBpsPerDay
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u8("status"),
        borsh.u8("assetTier"),
        borsh.u16("hostFixedInterestRateBps"),
        borsh.array(borsh.u8(), 9, "reserved2"),
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
        borsh.array(borsh.u8(), 1, "reserved1"),
        borsh.u64("borrowLimitOutsideElevationGroup"),
        borsh.array(
          borsh.u64(),
          32,
          "borrowLimitAgainstThisCollateralInElevationGroup"
        ),
        borsh.u64("deleveragingBonusIncreaseBpsPerDay"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveConfig({
      status: obj.status,
      assetTier: obj.assetTier,
      hostFixedInterestRateBps: obj.hostFixedInterestRateBps,
      reserved2: obj.reserved2,
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
      reserved1: obj.reserved1,
      borrowLimitOutsideElevationGroup: obj.borrowLimitOutsideElevationGroup,
      borrowLimitAgainstThisCollateralInElevationGroup:
        obj.borrowLimitAgainstThisCollateralInElevationGroup,
      deleveragingBonusIncreaseBpsPerDay:
        obj.deleveragingBonusIncreaseBpsPerDay,
    })
  }

  static toEncodable(fields: ReserveConfigFields) {
    return {
      status: fields.status,
      assetTier: fields.assetTier,
      hostFixedInterestRateBps: fields.hostFixedInterestRateBps,
      reserved2: fields.reserved2,
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
      reserved1: fields.reserved1,
      borrowLimitOutsideElevationGroup: fields.borrowLimitOutsideElevationGroup,
      borrowLimitAgainstThisCollateralInElevationGroup:
        fields.borrowLimitAgainstThisCollateralInElevationGroup,
      deleveragingBonusIncreaseBpsPerDay:
        fields.deleveragingBonusIncreaseBpsPerDay,
    }
  }

  toJSON(): ReserveConfigJSON {
    return {
      status: this.status,
      assetTier: this.assetTier,
      hostFixedInterestRateBps: this.hostFixedInterestRateBps,
      reserved2: this.reserved2,
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
      reserved1: this.reserved1,
      borrowLimitOutsideElevationGroup:
        this.borrowLimitOutsideElevationGroup.toString(),
      borrowLimitAgainstThisCollateralInElevationGroup:
        this.borrowLimitAgainstThisCollateralInElevationGroup.map((item) =>
          item.toString()
        ),
      deleveragingBonusIncreaseBpsPerDay:
        this.deleveragingBonusIncreaseBpsPerDay.toString(),
    }
  }

  static fromJSON(obj: ReserveConfigJSON): ReserveConfig {
    return new ReserveConfig({
      status: obj.status,
      assetTier: obj.assetTier,
      hostFixedInterestRateBps: obj.hostFixedInterestRateBps,
      reserved2: obj.reserved2,
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
      reserved1: obj.reserved1,
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
    })
  }

  toEncodable() {
    return ReserveConfig.toEncodable(this)
  }
}
