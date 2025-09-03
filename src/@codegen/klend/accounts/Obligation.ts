/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  address,
  Address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ObligationFields {
  /** Version of the struct */
  tag: BN
  /** Last update to collateral, liquidity, or their market values */
  lastUpdate: types.LastUpdateFields
  /** Lending market address */
  lendingMarket: Address
  /** Owner authority which can borrow liquidity */
  owner: Address
  /** Deposited collateral for the obligation, unique by deposit reserve address */
  deposits: Array<types.ObligationCollateralFields>
  /** Worst LTV for the collaterals backing the loan, represented as a percentage */
  lowestReserveDepositLiquidationLtv: BN
  /** Market value of deposits (scaled fraction) */
  depositedValueSf: BN
  /** Borrowed liquidity for the obligation, unique by borrow reserve address */
  borrows: Array<types.ObligationLiquidityFields>
  /** Risk adjusted market value of borrows/debt (sum of price * borrowed_amount * borrow_factor) (scaled fraction) */
  borrowFactorAdjustedDebtValueSf: BN
  /** Market value of borrows - used for max_liquidatable_borrowed_amount (scaled fraction) */
  borrowedAssetsMarketValueSf: BN
  /** The maximum borrow value at the weighted average loan to value ratio (scaled fraction) */
  allowedBorrowValueSf: BN
  /** The dangerous borrow value at the weighted average liquidation threshold (scaled fraction) */
  unhealthyBorrowValueSf: BN
  /** The asset tier of the deposits */
  depositsAssetTiers: Array<number>
  /** The asset tier of the borrows */
  borrowsAssetTiers: Array<number>
  /** The elevation group id the obligation opted into. */
  elevationGroup: number
  /** The number of obsolete reserves the obligation has a deposit in */
  numOfObsoleteDepositReserves: number
  /** Marked = 1 if borrows array is not empty, 0 = borrows empty */
  hasDebt: number
  /** Wallet address of the referrer */
  referrer: Address
  /** Marked = 1 if borrowing disabled, 0 = borrowing enabled */
  borrowingDisabled: number
  /**
   * A target LTV set by the risk council when marking this obligation for deleveraging.
   * Only effective when `deleveraging_margin_call_started_slot != 0`.
   */
  autodeleverageTargetLtvPct: number
  /** The lowest max LTV found amongst the collateral deposits */
  lowestReserveDepositMaxLtvPct: number
  /** The number of obsolete reserves the obligation has a borrow in */
  numOfObsoleteBorrowReserves: number
  reserved: Array<number>
  highestBorrowFactorPct: BN
  /**
   * A timestamp at which the risk council most-recently marked this obligation for deleveraging.
   * Zero if not currently subject to deleveraging.
   */
  autodeleverageMarginCallStartedTimestamp: BN
  /**
   * Owner-defined, liquidator-executed orders applicable to this obligation.
   * Typical use-cases would be a stop-loss and a take-profit (possibly co-existing).
   */
  orders: Array<types.ObligationOrderFields>
  padding3: Array<BN>
}

export interface ObligationJSON {
  /** Version of the struct */
  tag: string
  /** Last update to collateral, liquidity, or their market values */
  lastUpdate: types.LastUpdateJSON
  /** Lending market address */
  lendingMarket: string
  /** Owner authority which can borrow liquidity */
  owner: string
  /** Deposited collateral for the obligation, unique by deposit reserve address */
  deposits: Array<types.ObligationCollateralJSON>
  /** Worst LTV for the collaterals backing the loan, represented as a percentage */
  lowestReserveDepositLiquidationLtv: string
  /** Market value of deposits (scaled fraction) */
  depositedValueSf: string
  /** Borrowed liquidity for the obligation, unique by borrow reserve address */
  borrows: Array<types.ObligationLiquidityJSON>
  /** Risk adjusted market value of borrows/debt (sum of price * borrowed_amount * borrow_factor) (scaled fraction) */
  borrowFactorAdjustedDebtValueSf: string
  /** Market value of borrows - used for max_liquidatable_borrowed_amount (scaled fraction) */
  borrowedAssetsMarketValueSf: string
  /** The maximum borrow value at the weighted average loan to value ratio (scaled fraction) */
  allowedBorrowValueSf: string
  /** The dangerous borrow value at the weighted average liquidation threshold (scaled fraction) */
  unhealthyBorrowValueSf: string
  /** The asset tier of the deposits */
  depositsAssetTiers: Array<number>
  /** The asset tier of the borrows */
  borrowsAssetTiers: Array<number>
  /** The elevation group id the obligation opted into. */
  elevationGroup: number
  /** The number of obsolete reserves the obligation has a deposit in */
  numOfObsoleteDepositReserves: number
  /** Marked = 1 if borrows array is not empty, 0 = borrows empty */
  hasDebt: number
  /** Wallet address of the referrer */
  referrer: string
  /** Marked = 1 if borrowing disabled, 0 = borrowing enabled */
  borrowingDisabled: number
  /**
   * A target LTV set by the risk council when marking this obligation for deleveraging.
   * Only effective when `deleveraging_margin_call_started_slot != 0`.
   */
  autodeleverageTargetLtvPct: number
  /** The lowest max LTV found amongst the collateral deposits */
  lowestReserveDepositMaxLtvPct: number
  /** The number of obsolete reserves the obligation has a borrow in */
  numOfObsoleteBorrowReserves: number
  reserved: Array<number>
  highestBorrowFactorPct: string
  /**
   * A timestamp at which the risk council most-recently marked this obligation for deleveraging.
   * Zero if not currently subject to deleveraging.
   */
  autodeleverageMarginCallStartedTimestamp: string
  /**
   * Owner-defined, liquidator-executed orders applicable to this obligation.
   * Typical use-cases would be a stop-loss and a take-profit (possibly co-existing).
   */
  orders: Array<types.ObligationOrderJSON>
  padding3: Array<string>
}

/** Lending market obligation state */
export class Obligation {
  /** Version of the struct */
  readonly tag: BN
  /** Last update to collateral, liquidity, or their market values */
  readonly lastUpdate: types.LastUpdate
  /** Lending market address */
  readonly lendingMarket: Address
  /** Owner authority which can borrow liquidity */
  readonly owner: Address
  /** Deposited collateral for the obligation, unique by deposit reserve address */
  readonly deposits: Array<types.ObligationCollateral>
  /** Worst LTV for the collaterals backing the loan, represented as a percentage */
  readonly lowestReserveDepositLiquidationLtv: BN
  /** Market value of deposits (scaled fraction) */
  readonly depositedValueSf: BN
  /** Borrowed liquidity for the obligation, unique by borrow reserve address */
  readonly borrows: Array<types.ObligationLiquidity>
  /** Risk adjusted market value of borrows/debt (sum of price * borrowed_amount * borrow_factor) (scaled fraction) */
  readonly borrowFactorAdjustedDebtValueSf: BN
  /** Market value of borrows - used for max_liquidatable_borrowed_amount (scaled fraction) */
  readonly borrowedAssetsMarketValueSf: BN
  /** The maximum borrow value at the weighted average loan to value ratio (scaled fraction) */
  readonly allowedBorrowValueSf: BN
  /** The dangerous borrow value at the weighted average liquidation threshold (scaled fraction) */
  readonly unhealthyBorrowValueSf: BN
  /** The asset tier of the deposits */
  readonly depositsAssetTiers: Array<number>
  /** The asset tier of the borrows */
  readonly borrowsAssetTiers: Array<number>
  /** The elevation group id the obligation opted into. */
  readonly elevationGroup: number
  /** The number of obsolete reserves the obligation has a deposit in */
  readonly numOfObsoleteDepositReserves: number
  /** Marked = 1 if borrows array is not empty, 0 = borrows empty */
  readonly hasDebt: number
  /** Wallet address of the referrer */
  readonly referrer: Address
  /** Marked = 1 if borrowing disabled, 0 = borrowing enabled */
  readonly borrowingDisabled: number
  /**
   * A target LTV set by the risk council when marking this obligation for deleveraging.
   * Only effective when `deleveraging_margin_call_started_slot != 0`.
   */
  readonly autodeleverageTargetLtvPct: number
  /** The lowest max LTV found amongst the collateral deposits */
  readonly lowestReserveDepositMaxLtvPct: number
  /** The number of obsolete reserves the obligation has a borrow in */
  readonly numOfObsoleteBorrowReserves: number
  readonly reserved: Array<number>
  readonly highestBorrowFactorPct: BN
  /**
   * A timestamp at which the risk council most-recently marked this obligation for deleveraging.
   * Zero if not currently subject to deleveraging.
   */
  readonly autodeleverageMarginCallStartedTimestamp: BN
  /**
   * Owner-defined, liquidator-executed orders applicable to this obligation.
   * Typical use-cases would be a stop-loss and a take-profit (possibly co-existing).
   */
  readonly orders: Array<types.ObligationOrder>
  readonly padding3: Array<BN>

  static readonly discriminator = Buffer.from([
    168, 206, 141, 106, 88, 76, 172, 167,
  ])

  static readonly layout = borsh.struct<Obligation>([
    borsh.u64("tag"),
    types.LastUpdate.layout("lastUpdate"),
    borshAddress("lendingMarket"),
    borshAddress("owner"),
    borsh.array(types.ObligationCollateral.layout(), 8, "deposits"),
    borsh.u64("lowestReserveDepositLiquidationLtv"),
    borsh.u128("depositedValueSf"),
    borsh.array(types.ObligationLiquidity.layout(), 5, "borrows"),
    borsh.u128("borrowFactorAdjustedDebtValueSf"),
    borsh.u128("borrowedAssetsMarketValueSf"),
    borsh.u128("allowedBorrowValueSf"),
    borsh.u128("unhealthyBorrowValueSf"),
    borsh.array(borsh.u8(), 8, "depositsAssetTiers"),
    borsh.array(borsh.u8(), 5, "borrowsAssetTiers"),
    borsh.u8("elevationGroup"),
    borsh.u8("numOfObsoleteDepositReserves"),
    borsh.u8("hasDebt"),
    borshAddress("referrer"),
    borsh.u8("borrowingDisabled"),
    borsh.u8("autodeleverageTargetLtvPct"),
    borsh.u8("lowestReserveDepositMaxLtvPct"),
    borsh.u8("numOfObsoleteBorrowReserves"),
    borsh.array(borsh.u8(), 4, "reserved"),
    borsh.u64("highestBorrowFactorPct"),
    borsh.u64("autodeleverageMarginCallStartedTimestamp"),
    borsh.array(types.ObligationOrder.layout(), 2, "orders"),
    borsh.array(borsh.u64(), 93, "padding3"),
  ])

  constructor(fields: ObligationFields) {
    this.tag = fields.tag
    this.lastUpdate = new types.LastUpdate({ ...fields.lastUpdate })
    this.lendingMarket = fields.lendingMarket
    this.owner = fields.owner
    this.deposits = fields.deposits.map(
      (item) => new types.ObligationCollateral({ ...item })
    )
    this.lowestReserveDepositLiquidationLtv =
      fields.lowestReserveDepositLiquidationLtv
    this.depositedValueSf = fields.depositedValueSf
    this.borrows = fields.borrows.map(
      (item) => new types.ObligationLiquidity({ ...item })
    )
    this.borrowFactorAdjustedDebtValueSf =
      fields.borrowFactorAdjustedDebtValueSf
    this.borrowedAssetsMarketValueSf = fields.borrowedAssetsMarketValueSf
    this.allowedBorrowValueSf = fields.allowedBorrowValueSf
    this.unhealthyBorrowValueSf = fields.unhealthyBorrowValueSf
    this.depositsAssetTiers = fields.depositsAssetTiers
    this.borrowsAssetTiers = fields.borrowsAssetTiers
    this.elevationGroup = fields.elevationGroup
    this.numOfObsoleteDepositReserves = fields.numOfObsoleteDepositReserves
    this.hasDebt = fields.hasDebt
    this.referrer = fields.referrer
    this.borrowingDisabled = fields.borrowingDisabled
    this.autodeleverageTargetLtvPct = fields.autodeleverageTargetLtvPct
    this.lowestReserveDepositMaxLtvPct = fields.lowestReserveDepositMaxLtvPct
    this.numOfObsoleteBorrowReserves = fields.numOfObsoleteBorrowReserves
    this.reserved = fields.reserved
    this.highestBorrowFactorPct = fields.highestBorrowFactorPct
    this.autodeleverageMarginCallStartedTimestamp =
      fields.autodeleverageMarginCallStartedTimestamp
    this.orders = fields.orders.map(
      (item) => new types.ObligationOrder({ ...item })
    )
    this.padding3 = fields.padding3
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<Obligation | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ObligationFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<Obligation | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ObligationFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): Obligation {
    if (!data.slice(0, 8).equals(Obligation.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Obligation.layout.decode(data.slice(8))

    return new Obligation({
      tag: dec.tag,
      lastUpdate: types.LastUpdate.fromDecoded(dec.lastUpdate),
      lendingMarket: dec.lendingMarket,
      owner: dec.owner,
      deposits: dec.deposits.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ObligationCollateral.fromDecoded(item)
      ),
      lowestReserveDepositLiquidationLtv:
        dec.lowestReserveDepositLiquidationLtv,
      depositedValueSf: dec.depositedValueSf,
      borrows: dec.borrows.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ObligationLiquidity.fromDecoded(item)
      ),
      borrowFactorAdjustedDebtValueSf: dec.borrowFactorAdjustedDebtValueSf,
      borrowedAssetsMarketValueSf: dec.borrowedAssetsMarketValueSf,
      allowedBorrowValueSf: dec.allowedBorrowValueSf,
      unhealthyBorrowValueSf: dec.unhealthyBorrowValueSf,
      depositsAssetTiers: dec.depositsAssetTiers,
      borrowsAssetTiers: dec.borrowsAssetTiers,
      elevationGroup: dec.elevationGroup,
      numOfObsoleteDepositReserves: dec.numOfObsoleteDepositReserves,
      hasDebt: dec.hasDebt,
      referrer: dec.referrer,
      borrowingDisabled: dec.borrowingDisabled,
      autodeleverageTargetLtvPct: dec.autodeleverageTargetLtvPct,
      lowestReserveDepositMaxLtvPct: dec.lowestReserveDepositMaxLtvPct,
      numOfObsoleteBorrowReserves: dec.numOfObsoleteBorrowReserves,
      reserved: dec.reserved,
      highestBorrowFactorPct: dec.highestBorrowFactorPct,
      autodeleverageMarginCallStartedTimestamp:
        dec.autodeleverageMarginCallStartedTimestamp,
      orders: dec.orders.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ObligationOrder.fromDecoded(item)
      ),
      padding3: dec.padding3,
    })
  }

  toJSON(): ObligationJSON {
    return {
      tag: this.tag.toString(),
      lastUpdate: this.lastUpdate.toJSON(),
      lendingMarket: this.lendingMarket,
      owner: this.owner,
      deposits: this.deposits.map((item) => item.toJSON()),
      lowestReserveDepositLiquidationLtv:
        this.lowestReserveDepositLiquidationLtv.toString(),
      depositedValueSf: this.depositedValueSf.toString(),
      borrows: this.borrows.map((item) => item.toJSON()),
      borrowFactorAdjustedDebtValueSf:
        this.borrowFactorAdjustedDebtValueSf.toString(),
      borrowedAssetsMarketValueSf: this.borrowedAssetsMarketValueSf.toString(),
      allowedBorrowValueSf: this.allowedBorrowValueSf.toString(),
      unhealthyBorrowValueSf: this.unhealthyBorrowValueSf.toString(),
      depositsAssetTiers: this.depositsAssetTiers,
      borrowsAssetTiers: this.borrowsAssetTiers,
      elevationGroup: this.elevationGroup,
      numOfObsoleteDepositReserves: this.numOfObsoleteDepositReserves,
      hasDebt: this.hasDebt,
      referrer: this.referrer,
      borrowingDisabled: this.borrowingDisabled,
      autodeleverageTargetLtvPct: this.autodeleverageTargetLtvPct,
      lowestReserveDepositMaxLtvPct: this.lowestReserveDepositMaxLtvPct,
      numOfObsoleteBorrowReserves: this.numOfObsoleteBorrowReserves,
      reserved: this.reserved,
      highestBorrowFactorPct: this.highestBorrowFactorPct.toString(),
      autodeleverageMarginCallStartedTimestamp:
        this.autodeleverageMarginCallStartedTimestamp.toString(),
      orders: this.orders.map((item) => item.toJSON()),
      padding3: this.padding3.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObligationJSON): Obligation {
    return new Obligation({
      tag: new BN(obj.tag),
      lastUpdate: types.LastUpdate.fromJSON(obj.lastUpdate),
      lendingMarket: address(obj.lendingMarket),
      owner: address(obj.owner),
      deposits: obj.deposits.map((item) =>
        types.ObligationCollateral.fromJSON(item)
      ),
      lowestReserveDepositLiquidationLtv: new BN(
        obj.lowestReserveDepositLiquidationLtv
      ),
      depositedValueSf: new BN(obj.depositedValueSf),
      borrows: obj.borrows.map((item) =>
        types.ObligationLiquidity.fromJSON(item)
      ),
      borrowFactorAdjustedDebtValueSf: new BN(
        obj.borrowFactorAdjustedDebtValueSf
      ),
      borrowedAssetsMarketValueSf: new BN(obj.borrowedAssetsMarketValueSf),
      allowedBorrowValueSf: new BN(obj.allowedBorrowValueSf),
      unhealthyBorrowValueSf: new BN(obj.unhealthyBorrowValueSf),
      depositsAssetTiers: obj.depositsAssetTiers,
      borrowsAssetTiers: obj.borrowsAssetTiers,
      elevationGroup: obj.elevationGroup,
      numOfObsoleteDepositReserves: obj.numOfObsoleteDepositReserves,
      hasDebt: obj.hasDebt,
      referrer: address(obj.referrer),
      borrowingDisabled: obj.borrowingDisabled,
      autodeleverageTargetLtvPct: obj.autodeleverageTargetLtvPct,
      lowestReserveDepositMaxLtvPct: obj.lowestReserveDepositMaxLtvPct,
      numOfObsoleteBorrowReserves: obj.numOfObsoleteBorrowReserves,
      reserved: obj.reserved,
      highestBorrowFactorPct: new BN(obj.highestBorrowFactorPct),
      autodeleverageMarginCallStartedTimestamp: new BN(
        obj.autodeleverageMarginCallStartedTimestamp
      ),
      orders: obj.orders.map((item) => types.ObligationOrder.fromJSON(item)),
      padding3: obj.padding3.map((item) => new BN(item)),
    })
  }
}
