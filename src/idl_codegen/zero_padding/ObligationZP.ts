import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"
import { Obligation, ObligationFields } from '../accounts';

/** Lending market obligation state */
export class ObligationZP {
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
  readonly padding3: Array<BN> = new Array(0);

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
    this.padding3 = new Array<BN>(0);
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

    const dec = ObligationZP.layout.decode(data.slice(8))

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
      padding3: [],
    })
  }
}
