import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface BorrowOrderFields {
  /**
   * The asset to be borrowed.
   * The reserves used for [Obligation::borrows] *must* all provide exactly this asset.
   */
  debtLiquidityMint: Address
  /** The amount of debt that still needs to be filled, in lamports. */
  remainingDebtAmount: BN
  /**
   * The token account owned by the [Obligation::owner] and holding [Self::debt_liquidity_mint],
   * where the filled funds should be transferred to.
   */
  filledDebtDestination: Address
  /**
   * The minimum allowed debt term that the obligation owner agrees to.
   * The reserves used to fill this order *cannot* define their debt term *lower* than this.
   *
   * If zeroed, then only indefinite-term reserves may be used.
   */
  minDebtTermSeconds: BN
  /** The time until which the borrow order can still be filled. */
  fillableUntilTimestamp: BN
  /**
   * The time at which this order was placed.
   * Currently, this is only a piece of metadata.
   */
  placedAtTimestamp: BN
  /**
   * The time at which this order was most-recently updated (including: created).
   * Currently, this is only a piece of metadata.
   */
  lastUpdatedAtTimestamp: BN
  /**
   * The amount of debt that was originally requested when this order was most-recently updated.
   * In other words: this field holds a value of [Self::remaining_debt_amount] captured at
   * [Self::last_updated_at_timestamp].
   * Currently, this is only a piece of metadata.
   */
  requestedDebtAmount: BN
  /**
   * The maximum borrow rate that the obligation owner agrees to.
   * The reserves used for [Obligation::borrows] *cannot* define their maximum borrow rate
   * *higher* than this.
   */
  maxBorrowRateBps: number
  /** Alignment padding. */
  padding1: Array<number>
  /** End padding. */
  endPadding: Array<BN>
}

export interface BorrowOrderJSON {
  /**
   * The asset to be borrowed.
   * The reserves used for [Obligation::borrows] *must* all provide exactly this asset.
   */
  debtLiquidityMint: string
  /** The amount of debt that still needs to be filled, in lamports. */
  remainingDebtAmount: string
  /**
   * The token account owned by the [Obligation::owner] and holding [Self::debt_liquidity_mint],
   * where the filled funds should be transferred to.
   */
  filledDebtDestination: string
  /**
   * The minimum allowed debt term that the obligation owner agrees to.
   * The reserves used to fill this order *cannot* define their debt term *lower* than this.
   *
   * If zeroed, then only indefinite-term reserves may be used.
   */
  minDebtTermSeconds: string
  /** The time until which the borrow order can still be filled. */
  fillableUntilTimestamp: string
  /**
   * The time at which this order was placed.
   * Currently, this is only a piece of metadata.
   */
  placedAtTimestamp: string
  /**
   * The time at which this order was most-recently updated (including: created).
   * Currently, this is only a piece of metadata.
   */
  lastUpdatedAtTimestamp: string
  /**
   * The amount of debt that was originally requested when this order was most-recently updated.
   * In other words: this field holds a value of [Self::remaining_debt_amount] captured at
   * [Self::last_updated_at_timestamp].
   * Currently, this is only a piece of metadata.
   */
  requestedDebtAmount: string
  /**
   * The maximum borrow rate that the obligation owner agrees to.
   * The reserves used for [Obligation::borrows] *cannot* define their maximum borrow rate
   * *higher* than this.
   */
  maxBorrowRateBps: number
  /** Alignment padding. */
  padding1: Array<number>
  /** End padding. */
  endPadding: Array<string>
}

/**
 * A borrow order.
 *
 * When the [Obligation::borrow_order] is populated (i.e. non-zeroed) on an Obligation, then the
 * permissionless "fill" operations may borrow liquidity to the owner according to this
 * specification.
 */
export class BorrowOrder {
  /**
   * The asset to be borrowed.
   * The reserves used for [Obligation::borrows] *must* all provide exactly this asset.
   */
  readonly debtLiquidityMint: Address
  /** The amount of debt that still needs to be filled, in lamports. */
  readonly remainingDebtAmount: BN
  /**
   * The token account owned by the [Obligation::owner] and holding [Self::debt_liquidity_mint],
   * where the filled funds should be transferred to.
   */
  readonly filledDebtDestination: Address
  /**
   * The minimum allowed debt term that the obligation owner agrees to.
   * The reserves used to fill this order *cannot* define their debt term *lower* than this.
   *
   * If zeroed, then only indefinite-term reserves may be used.
   */
  readonly minDebtTermSeconds: BN
  /** The time until which the borrow order can still be filled. */
  readonly fillableUntilTimestamp: BN
  /**
   * The time at which this order was placed.
   * Currently, this is only a piece of metadata.
   */
  readonly placedAtTimestamp: BN
  /**
   * The time at which this order was most-recently updated (including: created).
   * Currently, this is only a piece of metadata.
   */
  readonly lastUpdatedAtTimestamp: BN
  /**
   * The amount of debt that was originally requested when this order was most-recently updated.
   * In other words: this field holds a value of [Self::remaining_debt_amount] captured at
   * [Self::last_updated_at_timestamp].
   * Currently, this is only a piece of metadata.
   */
  readonly requestedDebtAmount: BN
  /**
   * The maximum borrow rate that the obligation owner agrees to.
   * The reserves used for [Obligation::borrows] *cannot* define their maximum borrow rate
   * *higher* than this.
   */
  readonly maxBorrowRateBps: number
  /** Alignment padding. */
  readonly padding1: Array<number>
  /** End padding. */
  readonly endPadding: Array<BN>

  constructor(fields: BorrowOrderFields) {
    this.debtLiquidityMint = fields.debtLiquidityMint
    this.remainingDebtAmount = fields.remainingDebtAmount
    this.filledDebtDestination = fields.filledDebtDestination
    this.minDebtTermSeconds = fields.minDebtTermSeconds
    this.fillableUntilTimestamp = fields.fillableUntilTimestamp
    this.placedAtTimestamp = fields.placedAtTimestamp
    this.lastUpdatedAtTimestamp = fields.lastUpdatedAtTimestamp
    this.requestedDebtAmount = fields.requestedDebtAmount
    this.maxBorrowRateBps = fields.maxBorrowRateBps
    this.padding1 = fields.padding1
    this.endPadding = fields.endPadding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("debtLiquidityMint"),
        borsh.u64("remainingDebtAmount"),
        borshAddress("filledDebtDestination"),
        borsh.u64("minDebtTermSeconds"),
        borsh.u64("fillableUntilTimestamp"),
        borsh.u64("placedAtTimestamp"),
        borsh.u64("lastUpdatedAtTimestamp"),
        borsh.u64("requestedDebtAmount"),
        borsh.u32("maxBorrowRateBps"),
        borsh.array(borsh.u8(), 4, "padding1"),
        borsh.array(borsh.u64(), 5, "endPadding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new BorrowOrder({
      debtLiquidityMint: obj.debtLiquidityMint,
      remainingDebtAmount: obj.remainingDebtAmount,
      filledDebtDestination: obj.filledDebtDestination,
      minDebtTermSeconds: obj.minDebtTermSeconds,
      fillableUntilTimestamp: obj.fillableUntilTimestamp,
      placedAtTimestamp: obj.placedAtTimestamp,
      lastUpdatedAtTimestamp: obj.lastUpdatedAtTimestamp,
      requestedDebtAmount: obj.requestedDebtAmount,
      maxBorrowRateBps: obj.maxBorrowRateBps,
      padding1: obj.padding1,
      endPadding: obj.endPadding,
    })
  }

  static toEncodable(fields: BorrowOrderFields) {
    return {
      debtLiquidityMint: fields.debtLiquidityMint,
      remainingDebtAmount: fields.remainingDebtAmount,
      filledDebtDestination: fields.filledDebtDestination,
      minDebtTermSeconds: fields.minDebtTermSeconds,
      fillableUntilTimestamp: fields.fillableUntilTimestamp,
      placedAtTimestamp: fields.placedAtTimestamp,
      lastUpdatedAtTimestamp: fields.lastUpdatedAtTimestamp,
      requestedDebtAmount: fields.requestedDebtAmount,
      maxBorrowRateBps: fields.maxBorrowRateBps,
      padding1: fields.padding1,
      endPadding: fields.endPadding,
    }
  }

  toJSON(): BorrowOrderJSON {
    return {
      debtLiquidityMint: this.debtLiquidityMint,
      remainingDebtAmount: this.remainingDebtAmount.toString(),
      filledDebtDestination: this.filledDebtDestination,
      minDebtTermSeconds: this.minDebtTermSeconds.toString(),
      fillableUntilTimestamp: this.fillableUntilTimestamp.toString(),
      placedAtTimestamp: this.placedAtTimestamp.toString(),
      lastUpdatedAtTimestamp: this.lastUpdatedAtTimestamp.toString(),
      requestedDebtAmount: this.requestedDebtAmount.toString(),
      maxBorrowRateBps: this.maxBorrowRateBps,
      padding1: this.padding1,
      endPadding: this.endPadding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: BorrowOrderJSON): BorrowOrder {
    return new BorrowOrder({
      debtLiquidityMint: address(obj.debtLiquidityMint),
      remainingDebtAmount: new BN(obj.remainingDebtAmount),
      filledDebtDestination: address(obj.filledDebtDestination),
      minDebtTermSeconds: new BN(obj.minDebtTermSeconds),
      fillableUntilTimestamp: new BN(obj.fillableUntilTimestamp),
      placedAtTimestamp: new BN(obj.placedAtTimestamp),
      lastUpdatedAtTimestamp: new BN(obj.lastUpdatedAtTimestamp),
      requestedDebtAmount: new BN(obj.requestedDebtAmount),
      maxBorrowRateBps: obj.maxBorrowRateBps,
      padding1: obj.padding1,
      endPadding: obj.endPadding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return BorrowOrder.toEncodable(this)
  }
}
