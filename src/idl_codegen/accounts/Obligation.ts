import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ObligationFields {
  /** Version of the struct */
  tag: BN
  /** Last update to collateral, liquidity, or their market values */
  lastUpdate: types.LastUpdateFields
  /** Lending market address */
  lendingMarket: PublicKey
  /** Owner authority which can borrow liquidity */
  owner: PublicKey
  /**
   * TODO: Does this break the stack size when copied onto the stack, if too big?
   * Deposited collateral for the obligation, unique by deposit reserve address
   */
  deposits: Array<types.ObligationCollateralFields>
  /** Worst LTV for the collaterals backing the loan, represented as a percentage */
  lowestReserveDepositLtv: BN
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
  /** The number of deprecated reserves the obligation has a deposit */
  numOfObsoleteReserves: number
  /** Marked = 1 if borrows array is not empty, 0 = borrows empty */
  hasDebt: number
  /** Wallet address of the referrer */
  referrer: PublicKey
  /** Marked = 1 if borrowing disabled, 0 = borrowing enabled */
  borrowingDisabled: number
  reserved: Array<number>
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
  /**
   * TODO: Does this break the stack size when copied onto the stack, if too big?
   * Deposited collateral for the obligation, unique by deposit reserve address
   */
  deposits: Array<types.ObligationCollateralJSON>
  /** Worst LTV for the collaterals backing the loan, represented as a percentage */
  lowestReserveDepositLtv: string
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
  /** The number of deprecated reserves the obligation has a deposit */
  numOfObsoleteReserves: number
  /** Marked = 1 if borrows array is not empty, 0 = borrows empty */
  hasDebt: number
  /** Wallet address of the referrer */
  referrer: string
  /** Marked = 1 if borrowing disabled, 0 = borrowing enabled */
  borrowingDisabled: number
  reserved: Array<number>
  padding3: Array<string>
}

/** Lending market obligation state */
export class Obligation {
  /** Version of the struct */
  readonly tag: BN
  /** Last update to collateral, liquidity, or their market values */
  readonly lastUpdate: types.LastUpdate
  /** Lending market address */
  readonly lendingMarket: PublicKey
  /** Owner authority which can borrow liquidity */
  readonly owner: PublicKey
  /**
   * TODO: Does this break the stack size when copied onto the stack, if too big?
   * Deposited collateral for the obligation, unique by deposit reserve address
   */
  readonly deposits: Array<types.ObligationCollateral>
  /** Worst LTV for the collaterals backing the loan, represented as a percentage */
  readonly lowestReserveDepositLtv: BN
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
  /** The number of deprecated reserves the obligation has a deposit */
  readonly numOfObsoleteReserves: number
  /** Marked = 1 if borrows array is not empty, 0 = borrows empty */
  readonly hasDebt: number
  /** Wallet address of the referrer */
  readonly referrer: PublicKey
  /** Marked = 1 if borrowing disabled, 0 = borrowing enabled */
  readonly borrowingDisabled: number
  readonly reserved: Array<number>
  readonly padding3: Array<BN>

  static readonly discriminator = Buffer.from([
    168, 206, 141, 106, 88, 76, 172, 167,
  ])

  static readonly layout = borsh.struct([
    borsh.u64("tag"),
    types.LastUpdate.layout("lastUpdate"),
    borsh.publicKey("lendingMarket"),
    borsh.publicKey("owner"),
    borsh.array(types.ObligationCollateral.layout(), 8, "deposits"),
    borsh.u64("lowestReserveDepositLtv"),
    borsh.u128("depositedValueSf"),
    borsh.array(types.ObligationLiquidity.layout(), 5, "borrows"),
    borsh.u128("borrowFactorAdjustedDebtValueSf"),
    borsh.u128("borrowedAssetsMarketValueSf"),
    borsh.u128("allowedBorrowValueSf"),
    borsh.u128("unhealthyBorrowValueSf"),
    borsh.array(borsh.u8(), 8, "depositsAssetTiers"),
    borsh.array(borsh.u8(), 5, "borrowsAssetTiers"),
    borsh.u8("elevationGroup"),
    borsh.u8("numOfObsoleteReserves"),
    borsh.u8("hasDebt"),
    borsh.publicKey("referrer"),
    borsh.u8("borrowingDisabled"),
    borsh.array(borsh.u8(), 7, "reserved"),
    borsh.array(borsh.u64(), 127, "padding3"),
  ])

  constructor(fields: ObligationFields) {
    this.tag = fields.tag
    this.lastUpdate = new types.LastUpdate({ ...fields.lastUpdate })
    this.lendingMarket = fields.lendingMarket
    this.owner = fields.owner
    this.deposits = fields.deposits.map(
      (item) => new types.ObligationCollateral({ ...item })
    )
    this.lowestReserveDepositLtv = fields.lowestReserveDepositLtv
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
    this.numOfObsoleteReserves = fields.numOfObsoleteReserves
    this.hasDebt = fields.hasDebt
    this.referrer = fields.referrer
    this.borrowingDisabled = fields.borrowingDisabled
    this.reserved = fields.reserved
    this.padding3 = fields.padding3
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<Obligation | null> {
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
  ): Promise<Array<Obligation | null>> {
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
      lowestReserveDepositLtv: dec.lowestReserveDepositLtv,
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
      numOfObsoleteReserves: dec.numOfObsoleteReserves,
      hasDebt: dec.hasDebt,
      referrer: dec.referrer,
      borrowingDisabled: dec.borrowingDisabled,
      reserved: dec.reserved,
      padding3: dec.padding3,
    })
  }

  toJSON(): ObligationJSON {
    return {
      tag: this.tag.toString(),
      lastUpdate: this.lastUpdate.toJSON(),
      lendingMarket: this.lendingMarket.toString(),
      owner: this.owner.toString(),
      deposits: this.deposits.map((item) => item.toJSON()),
      lowestReserveDepositLtv: this.lowestReserveDepositLtv.toString(),
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
      numOfObsoleteReserves: this.numOfObsoleteReserves,
      hasDebt: this.hasDebt,
      referrer: this.referrer.toString(),
      borrowingDisabled: this.borrowingDisabled,
      reserved: this.reserved,
      padding3: this.padding3.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObligationJSON): Obligation {
    return new Obligation({
      tag: new BN(obj.tag),
      lastUpdate: types.LastUpdate.fromJSON(obj.lastUpdate),
      lendingMarket: new PublicKey(obj.lendingMarket),
      owner: new PublicKey(obj.owner),
      deposits: obj.deposits.map((item) =>
        types.ObligationCollateral.fromJSON(item)
      ),
      lowestReserveDepositLtv: new BN(obj.lowestReserveDepositLtv),
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
      numOfObsoleteReserves: obj.numOfObsoleteReserves,
      hasDebt: obj.hasDebt,
      referrer: new PublicKey(obj.referrer),
      borrowingDisabled: obj.borrowingDisabled,
      reserved: obj.reserved,
      padding3: obj.padding3.map((item) => new BN(item)),
    })
  }
}
