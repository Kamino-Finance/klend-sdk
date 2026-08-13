import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface BorrowOrderFields {
  debtLiquidityMint: Address
  remainingDebtAmount: BN
  filledDebtDestination: Address
  minDebtTermSeconds: BN
  fillableUntilTimestamp: BN
  placedAtTimestamp: BN
  lastUpdatedAtTimestamp: BN
  requestedDebtAmount: BN
  maxBorrowRateBps: number
  active: number
  enableAutoRolloverOnFilledBorrows: number
  padding1: Array<number>
  endPadding: Array<BN>
}

export interface BorrowOrderJSON {
  debtLiquidityMint: string
  remainingDebtAmount: string
  filledDebtDestination: string
  minDebtTermSeconds: string
  fillableUntilTimestamp: string
  placedAtTimestamp: string
  lastUpdatedAtTimestamp: string
  requestedDebtAmount: string
  maxBorrowRateBps: number
  active: number
  enableAutoRolloverOnFilledBorrows: number
  padding1: Array<number>
  endPadding: Array<string>
}

export class BorrowOrder {
  readonly debtLiquidityMint: Address
  readonly remainingDebtAmount: BN
  readonly filledDebtDestination: Address
  readonly minDebtTermSeconds: BN
  readonly fillableUntilTimestamp: BN
  readonly placedAtTimestamp: BN
  readonly lastUpdatedAtTimestamp: BN
  readonly requestedDebtAmount: BN
  readonly maxBorrowRateBps: number
  readonly active: number
  readonly enableAutoRolloverOnFilledBorrows: number
  readonly padding1: Array<number>
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
    this.active = fields.active
    this.enableAutoRolloverOnFilledBorrows =
      fields.enableAutoRolloverOnFilledBorrows
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
        borsh.u8("active"),
        borsh.u8("enableAutoRolloverOnFilledBorrows"),
        borsh.array(borsh.u8(), 2, "padding1"),
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
      active: obj.active,
      enableAutoRolloverOnFilledBorrows: obj.enableAutoRolloverOnFilledBorrows,
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
      active: fields.active,
      enableAutoRolloverOnFilledBorrows:
        fields.enableAutoRolloverOnFilledBorrows,
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
      active: this.active,
      enableAutoRolloverOnFilledBorrows: this.enableAutoRolloverOnFilledBorrows,
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
      active: obj.active,
      enableAutoRolloverOnFilledBorrows: obj.enableAutoRolloverOnFilledBorrows,
      padding1: obj.padding1,
      endPadding: obj.endPadding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return BorrowOrder.toEncodable(this)
  }
}
