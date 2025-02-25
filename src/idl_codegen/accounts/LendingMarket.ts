import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface LendingMarketFields {
  /** Version of lending market */
  version: BN
  /** Bump seed for derived authority address */
  bumpSeed: BN
  /** Owner authority which can add new reserves */
  lendingMarketOwner: PublicKey
  /** Temporary cache of the lending market owner, used in update_lending_market_owner */
  lendingMarketOwnerCached: PublicKey
  /**
   * Currency market prices are quoted in
   * e.g. "USD" null padded (`*b"USD\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"`) or a SPL token mint pubkey
   */
  quoteCurrency: Array<number>
  /** Referral fee for the lending market, as bps out of the total protocol fee */
  referralFeeBps: number
  emergencyMode: number
  /**
   * Whether the obligations on this market should be subject to auto-deleveraging after deposit
   * or borrow limit is crossed.
   * Besides this flag, the particular reserve's flag also needs to be enabled (logical `AND`).
   * **NOTE:** the manual "target LTV" deleveraging (enabled by the risk council for individual
   * obligations) is NOT affected by this flag.
   */
  autodeleverageEnabled: number
  borrowDisabled: number
  /**
   * Refresh price from oracle only if it's older than this percentage of the price max age.
   * e.g. if the max age is set to 100s and this is set to 80%, the price will be refreshed if it's older than 80s.
   * Price is always refreshed if this set to 0.
   */
  priceRefreshTriggerToMaxAgePct: number
  /** Percentage of the total borrowed value in an obligation available for liquidation */
  liquidationMaxDebtCloseFactorPct: number
  /** Minimum acceptable unhealthy LTV before max_debt_close_factor_pct becomes 100% */
  insolvencyRiskUnhealthyLtvPct: number
  /** Minimum liquidation value threshold triggering full liquidation for an obligation */
  minFullLiquidationValueThreshold: BN
  /** Max allowed liquidation value in one ix call */
  maxLiquidatableDebtMarketValueAtOnce: BN
  /** [DEPRECATED] Global maximum unhealthy borrow value allowed for any obligation */
  reserved0: Array<number>
  /** Global maximum allowed borrow value allowed for any obligation */
  globalAllowedBorrowValue: BN
  /** The address of the risk council, in charge of making parameter and risk decisions on behalf of the protocol */
  riskCouncil: PublicKey
  /** [DEPRECATED] Reward points multiplier per obligation type */
  reserved1: Array<number>
  /** Elevation groups are used to group together reserves that have the same risk parameters and can bump the ltv and liquidation threshold */
  elevationGroups: Array<types.ElevationGroupFields>
  elevationGroupPadding: Array<BN>
  /** Min net value accepted to be found in a position after any lending action in an obligation (scaled by quote currency decimals) */
  minNetValueInObligationSf: BN
  /** Minimum value to enforce smallest ltv priority checks on the collateral reserves on liquidation */
  minValueSkipLiquidationLtvChecks: BN
  /** Market name, zero-padded. */
  name: Array<number>
  /** Minimum value to enforce highest borrow factor priority checks on the debt reserves on liquidation */
  minValueSkipLiquidationBfChecks: BN
  /**
   * Time (in seconds) that must pass before liquidation is allowed on an obligation that has
   * been individually marked for auto-deleveraging (by the risk council).
   */
  individualAutodeleverageMarginCallPeriodSecs: BN
  /**
   * Minimum amount of deposit at creation of a reserve to prevent artificial inflation
   * Note: this amount cannot be recovered, the ctoken associated are never minted
   */
  minInitialDepositAmount: BN
  padding1: Array<BN>
}

export interface LendingMarketJSON {
  /** Version of lending market */
  version: string
  /** Bump seed for derived authority address */
  bumpSeed: string
  /** Owner authority which can add new reserves */
  lendingMarketOwner: string
  /** Temporary cache of the lending market owner, used in update_lending_market_owner */
  lendingMarketOwnerCached: string
  /**
   * Currency market prices are quoted in
   * e.g. "USD" null padded (`*b"USD\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"`) or a SPL token mint pubkey
   */
  quoteCurrency: Array<number>
  /** Referral fee for the lending market, as bps out of the total protocol fee */
  referralFeeBps: number
  emergencyMode: number
  /**
   * Whether the obligations on this market should be subject to auto-deleveraging after deposit
   * or borrow limit is crossed.
   * Besides this flag, the particular reserve's flag also needs to be enabled (logical `AND`).
   * **NOTE:** the manual "target LTV" deleveraging (enabled by the risk council for individual
   * obligations) is NOT affected by this flag.
   */
  autodeleverageEnabled: number
  borrowDisabled: number
  /**
   * Refresh price from oracle only if it's older than this percentage of the price max age.
   * e.g. if the max age is set to 100s and this is set to 80%, the price will be refreshed if it's older than 80s.
   * Price is always refreshed if this set to 0.
   */
  priceRefreshTriggerToMaxAgePct: number
  /** Percentage of the total borrowed value in an obligation available for liquidation */
  liquidationMaxDebtCloseFactorPct: number
  /** Minimum acceptable unhealthy LTV before max_debt_close_factor_pct becomes 100% */
  insolvencyRiskUnhealthyLtvPct: number
  /** Minimum liquidation value threshold triggering full liquidation for an obligation */
  minFullLiquidationValueThreshold: string
  /** Max allowed liquidation value in one ix call */
  maxLiquidatableDebtMarketValueAtOnce: string
  /** [DEPRECATED] Global maximum unhealthy borrow value allowed for any obligation */
  reserved0: Array<number>
  /** Global maximum allowed borrow value allowed for any obligation */
  globalAllowedBorrowValue: string
  /** The address of the risk council, in charge of making parameter and risk decisions on behalf of the protocol */
  riskCouncil: string
  /** [DEPRECATED] Reward points multiplier per obligation type */
  reserved1: Array<number>
  /** Elevation groups are used to group together reserves that have the same risk parameters and can bump the ltv and liquidation threshold */
  elevationGroups: Array<types.ElevationGroupJSON>
  elevationGroupPadding: Array<string>
  /** Min net value accepted to be found in a position after any lending action in an obligation (scaled by quote currency decimals) */
  minNetValueInObligationSf: string
  /** Minimum value to enforce smallest ltv priority checks on the collateral reserves on liquidation */
  minValueSkipLiquidationLtvChecks: string
  /** Market name, zero-padded. */
  name: Array<number>
  /** Minimum value to enforce highest borrow factor priority checks on the debt reserves on liquidation */
  minValueSkipLiquidationBfChecks: string
  /**
   * Time (in seconds) that must pass before liquidation is allowed on an obligation that has
   * been individually marked for auto-deleveraging (by the risk council).
   */
  individualAutodeleverageMarginCallPeriodSecs: string
  /**
   * Minimum amount of deposit at creation of a reserve to prevent artificial inflation
   * Note: this amount cannot be recovered, the ctoken associated are never minted
   */
  minInitialDepositAmount: string
  padding1: Array<string>
}

export class LendingMarket {
  /** Version of lending market */
  readonly version: BN
  /** Bump seed for derived authority address */
  readonly bumpSeed: BN
  /** Owner authority which can add new reserves */
  readonly lendingMarketOwner: PublicKey
  /** Temporary cache of the lending market owner, used in update_lending_market_owner */
  readonly lendingMarketOwnerCached: PublicKey
  /**
   * Currency market prices are quoted in
   * e.g. "USD" null padded (`*b"USD\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"`) or a SPL token mint pubkey
   */
  readonly quoteCurrency: Array<number>
  /** Referral fee for the lending market, as bps out of the total protocol fee */
  readonly referralFeeBps: number
  readonly emergencyMode: number
  /**
   * Whether the obligations on this market should be subject to auto-deleveraging after deposit
   * or borrow limit is crossed.
   * Besides this flag, the particular reserve's flag also needs to be enabled (logical `AND`).
   * **NOTE:** the manual "target LTV" deleveraging (enabled by the risk council for individual
   * obligations) is NOT affected by this flag.
   */
  readonly autodeleverageEnabled: number
  readonly borrowDisabled: number
  /**
   * Refresh price from oracle only if it's older than this percentage of the price max age.
   * e.g. if the max age is set to 100s and this is set to 80%, the price will be refreshed if it's older than 80s.
   * Price is always refreshed if this set to 0.
   */
  readonly priceRefreshTriggerToMaxAgePct: number
  /** Percentage of the total borrowed value in an obligation available for liquidation */
  readonly liquidationMaxDebtCloseFactorPct: number
  /** Minimum acceptable unhealthy LTV before max_debt_close_factor_pct becomes 100% */
  readonly insolvencyRiskUnhealthyLtvPct: number
  /** Minimum liquidation value threshold triggering full liquidation for an obligation */
  readonly minFullLiquidationValueThreshold: BN
  /** Max allowed liquidation value in one ix call */
  readonly maxLiquidatableDebtMarketValueAtOnce: BN
  /** [DEPRECATED] Global maximum unhealthy borrow value allowed for any obligation */
  readonly reserved0: Array<number>
  /** Global maximum allowed borrow value allowed for any obligation */
  readonly globalAllowedBorrowValue: BN
  /** The address of the risk council, in charge of making parameter and risk decisions on behalf of the protocol */
  readonly riskCouncil: PublicKey
  /** [DEPRECATED] Reward points multiplier per obligation type */
  readonly reserved1: Array<number>
  /** Elevation groups are used to group together reserves that have the same risk parameters and can bump the ltv and liquidation threshold */
  readonly elevationGroups: Array<types.ElevationGroup>
  readonly elevationGroupPadding: Array<BN>
  /** Min net value accepted to be found in a position after any lending action in an obligation (scaled by quote currency decimals) */
  readonly minNetValueInObligationSf: BN
  /** Minimum value to enforce smallest ltv priority checks on the collateral reserves on liquidation */
  readonly minValueSkipLiquidationLtvChecks: BN
  /** Market name, zero-padded. */
  readonly name: Array<number>
  /** Minimum value to enforce highest borrow factor priority checks on the debt reserves on liquidation */
  readonly minValueSkipLiquidationBfChecks: BN
  /**
   * Time (in seconds) that must pass before liquidation is allowed on an obligation that has
   * been individually marked for auto-deleveraging (by the risk council).
   */
  readonly individualAutodeleverageMarginCallPeriodSecs: BN
  /**
   * Minimum amount of deposit at creation of a reserve to prevent artificial inflation
   * Note: this amount cannot be recovered, the ctoken associated are never minted
   */
  readonly minInitialDepositAmount: BN
  readonly padding1: Array<BN>

  static readonly discriminator = Buffer.from([
    246, 114, 50, 98, 72, 157, 28, 120,
  ])

  static readonly layout = borsh.struct([
    borsh.u64("version"),
    borsh.u64("bumpSeed"),
    borsh.publicKey("lendingMarketOwner"),
    borsh.publicKey("lendingMarketOwnerCached"),
    borsh.array(borsh.u8(), 32, "quoteCurrency"),
    borsh.u16("referralFeeBps"),
    borsh.u8("emergencyMode"),
    borsh.u8("autodeleverageEnabled"),
    borsh.u8("borrowDisabled"),
    borsh.u8("priceRefreshTriggerToMaxAgePct"),
    borsh.u8("liquidationMaxDebtCloseFactorPct"),
    borsh.u8("insolvencyRiskUnhealthyLtvPct"),
    borsh.u64("minFullLiquidationValueThreshold"),
    borsh.u64("maxLiquidatableDebtMarketValueAtOnce"),
    borsh.array(borsh.u8(), 8, "reserved0"),
    borsh.u64("globalAllowedBorrowValue"),
    borsh.publicKey("riskCouncil"),
    borsh.array(borsh.u8(), 8, "reserved1"),
    borsh.array(types.ElevationGroup.layout(), 32, "elevationGroups"),
    borsh.array(borsh.u64(), 90, "elevationGroupPadding"),
    borsh.u128("minNetValueInObligationSf"),
    borsh.u64("minValueSkipLiquidationLtvChecks"),
    borsh.array(borsh.u8(), 32, "name"),
    borsh.u64("minValueSkipLiquidationBfChecks"),
    borsh.u64("individualAutodeleverageMarginCallPeriodSecs"),
    borsh.u64("minInitialDepositAmount"),
    borsh.array(borsh.u64(), 170, "padding1"),
  ])

  constructor(fields: LendingMarketFields) {
    this.version = fields.version
    this.bumpSeed = fields.bumpSeed
    this.lendingMarketOwner = fields.lendingMarketOwner
    this.lendingMarketOwnerCached = fields.lendingMarketOwnerCached
    this.quoteCurrency = fields.quoteCurrency
    this.referralFeeBps = fields.referralFeeBps
    this.emergencyMode = fields.emergencyMode
    this.autodeleverageEnabled = fields.autodeleverageEnabled
    this.borrowDisabled = fields.borrowDisabled
    this.priceRefreshTriggerToMaxAgePct = fields.priceRefreshTriggerToMaxAgePct
    this.liquidationMaxDebtCloseFactorPct =
      fields.liquidationMaxDebtCloseFactorPct
    this.insolvencyRiskUnhealthyLtvPct = fields.insolvencyRiskUnhealthyLtvPct
    this.minFullLiquidationValueThreshold =
      fields.minFullLiquidationValueThreshold
    this.maxLiquidatableDebtMarketValueAtOnce =
      fields.maxLiquidatableDebtMarketValueAtOnce
    this.reserved0 = fields.reserved0
    this.globalAllowedBorrowValue = fields.globalAllowedBorrowValue
    this.riskCouncil = fields.riskCouncil
    this.reserved1 = fields.reserved1
    this.elevationGroups = fields.elevationGroups.map(
      (item) => new types.ElevationGroup({ ...item })
    )
    this.elevationGroupPadding = fields.elevationGroupPadding
    this.minNetValueInObligationSf = fields.minNetValueInObligationSf
    this.minValueSkipLiquidationLtvChecks =
      fields.minValueSkipLiquidationLtvChecks
    this.name = fields.name
    this.minValueSkipLiquidationBfChecks =
      fields.minValueSkipLiquidationBfChecks
    this.individualAutodeleverageMarginCallPeriodSecs =
      fields.individualAutodeleverageMarginCallPeriodSecs
    this.minInitialDepositAmount = fields.minInitialDepositAmount
    this.padding1 = fields.padding1
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<LendingMarket | null> {
    const info = await c.getAccountInfo(address)

    if (info === null) {
      return null
    }
    if (!info.owner.equals(programId)) {
      throw new Error("account doesn't belong to this program")
    }

    return this.decode(info.data)
  }

  static async fetchMultiple(
    c: Connection,
    addresses: PublicKey[],
    programId: PublicKey = PROGRAM_ID
  ): Promise<Array<LendingMarket | null>> {
    const infos = await c.getMultipleAccountsInfo(addresses)

    return infos.map((info) => {
      if (info === null) {
        return null
      }
      if (!info.owner.equals(programId)) {
        throw new Error("account doesn't belong to this program")
      }

      return this.decode(info.data)
    })
  }

  static decode(data: Buffer): LendingMarket {
    if (!data.slice(0, 8).equals(LendingMarket.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = LendingMarket.layout.decode(data.slice(8))

    return new LendingMarket({
      version: dec.version,
      bumpSeed: dec.bumpSeed,
      lendingMarketOwner: dec.lendingMarketOwner,
      lendingMarketOwnerCached: dec.lendingMarketOwnerCached,
      quoteCurrency: dec.quoteCurrency,
      referralFeeBps: dec.referralFeeBps,
      emergencyMode: dec.emergencyMode,
      autodeleverageEnabled: dec.autodeleverageEnabled,
      borrowDisabled: dec.borrowDisabled,
      priceRefreshTriggerToMaxAgePct: dec.priceRefreshTriggerToMaxAgePct,
      liquidationMaxDebtCloseFactorPct: dec.liquidationMaxDebtCloseFactorPct,
      insolvencyRiskUnhealthyLtvPct: dec.insolvencyRiskUnhealthyLtvPct,
      minFullLiquidationValueThreshold: dec.minFullLiquidationValueThreshold,
      maxLiquidatableDebtMarketValueAtOnce:
        dec.maxLiquidatableDebtMarketValueAtOnce,
      reserved0: dec.reserved0,
      globalAllowedBorrowValue: dec.globalAllowedBorrowValue,
      riskCouncil: dec.riskCouncil,
      reserved1: dec.reserved1,
      elevationGroups: dec.elevationGroups.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ElevationGroup.fromDecoded(item)
      ),
      elevationGroupPadding: dec.elevationGroupPadding,
      minNetValueInObligationSf: dec.minNetValueInObligationSf,
      minValueSkipLiquidationLtvChecks: dec.minValueSkipLiquidationLtvChecks,
      name: dec.name,
      minValueSkipLiquidationBfChecks: dec.minValueSkipLiquidationBfChecks,
      individualAutodeleverageMarginCallPeriodSecs:
        dec.individualAutodeleverageMarginCallPeriodSecs,
      minInitialDepositAmount: dec.minInitialDepositAmount,
      padding1: dec.padding1,
    })
  }

  toJSON(): LendingMarketJSON {
    return {
      version: this.version.toString(),
      bumpSeed: this.bumpSeed.toString(),
      lendingMarketOwner: this.lendingMarketOwner.toString(),
      lendingMarketOwnerCached: this.lendingMarketOwnerCached.toString(),
      quoteCurrency: this.quoteCurrency,
      referralFeeBps: this.referralFeeBps,
      emergencyMode: this.emergencyMode,
      autodeleverageEnabled: this.autodeleverageEnabled,
      borrowDisabled: this.borrowDisabled,
      priceRefreshTriggerToMaxAgePct: this.priceRefreshTriggerToMaxAgePct,
      liquidationMaxDebtCloseFactorPct: this.liquidationMaxDebtCloseFactorPct,
      insolvencyRiskUnhealthyLtvPct: this.insolvencyRiskUnhealthyLtvPct,
      minFullLiquidationValueThreshold:
        this.minFullLiquidationValueThreshold.toString(),
      maxLiquidatableDebtMarketValueAtOnce:
        this.maxLiquidatableDebtMarketValueAtOnce.toString(),
      reserved0: this.reserved0,
      globalAllowedBorrowValue: this.globalAllowedBorrowValue.toString(),
      riskCouncil: this.riskCouncil.toString(),
      reserved1: this.reserved1,
      elevationGroups: this.elevationGroups.map((item) => item.toJSON()),
      elevationGroupPadding: this.elevationGroupPadding.map((item) =>
        item.toString()
      ),
      minNetValueInObligationSf: this.minNetValueInObligationSf.toString(),
      minValueSkipLiquidationLtvChecks:
        this.minValueSkipLiquidationLtvChecks.toString(),
      name: this.name,
      minValueSkipLiquidationBfChecks:
        this.minValueSkipLiquidationBfChecks.toString(),
      individualAutodeleverageMarginCallPeriodSecs:
        this.individualAutodeleverageMarginCallPeriodSecs.toString(),
      minInitialDepositAmount: this.minInitialDepositAmount.toString(),
      padding1: this.padding1.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: LendingMarketJSON): LendingMarket {
    return new LendingMarket({
      version: new BN(obj.version),
      bumpSeed: new BN(obj.bumpSeed),
      lendingMarketOwner: new PublicKey(obj.lendingMarketOwner),
      lendingMarketOwnerCached: new PublicKey(obj.lendingMarketOwnerCached),
      quoteCurrency: obj.quoteCurrency,
      referralFeeBps: obj.referralFeeBps,
      emergencyMode: obj.emergencyMode,
      autodeleverageEnabled: obj.autodeleverageEnabled,
      borrowDisabled: obj.borrowDisabled,
      priceRefreshTriggerToMaxAgePct: obj.priceRefreshTriggerToMaxAgePct,
      liquidationMaxDebtCloseFactorPct: obj.liquidationMaxDebtCloseFactorPct,
      insolvencyRiskUnhealthyLtvPct: obj.insolvencyRiskUnhealthyLtvPct,
      minFullLiquidationValueThreshold: new BN(
        obj.minFullLiquidationValueThreshold
      ),
      maxLiquidatableDebtMarketValueAtOnce: new BN(
        obj.maxLiquidatableDebtMarketValueAtOnce
      ),
      reserved0: obj.reserved0,
      globalAllowedBorrowValue: new BN(obj.globalAllowedBorrowValue),
      riskCouncil: new PublicKey(obj.riskCouncil),
      reserved1: obj.reserved1,
      elevationGroups: obj.elevationGroups.map((item) =>
        types.ElevationGroup.fromJSON(item)
      ),
      elevationGroupPadding: obj.elevationGroupPadding.map(
        (item) => new BN(item)
      ),
      minNetValueInObligationSf: new BN(obj.minNetValueInObligationSf),
      minValueSkipLiquidationLtvChecks: new BN(
        obj.minValueSkipLiquidationLtvChecks
      ),
      name: obj.name,
      minValueSkipLiquidationBfChecks: new BN(
        obj.minValueSkipLiquidationBfChecks
      ),
      individualAutodeleverageMarginCallPeriodSecs: new BN(
        obj.individualAutodeleverageMarginCallPeriodSecs
      ),
      minInitialDepositAmount: new BN(obj.minInitialDepositAmount),
      padding1: obj.padding1.map((item) => new BN(item)),
    })
  }
}
