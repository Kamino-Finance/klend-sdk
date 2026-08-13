import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface BorrowOrderConfigArgsFields {
  remainingDebtAmount: BN
  maxBorrowRateBps: number
  minDebtTermSeconds: BN
  fillableUntilTimestamp: BN
  enableAutoRolloverOnFilledBorrows: boolean
}

export interface BorrowOrderConfigArgsJSON {
  remainingDebtAmount: string
  maxBorrowRateBps: number
  minDebtTermSeconds: string
  fillableUntilTimestamp: string
  enableAutoRolloverOnFilledBorrows: boolean
}

export class BorrowOrderConfigArgs {
  readonly remainingDebtAmount: BN
  readonly maxBorrowRateBps: number
  readonly minDebtTermSeconds: BN
  readonly fillableUntilTimestamp: BN
  readonly enableAutoRolloverOnFilledBorrows: boolean

  constructor(fields: BorrowOrderConfigArgsFields) {
    this.remainingDebtAmount = fields.remainingDebtAmount
    this.maxBorrowRateBps = fields.maxBorrowRateBps
    this.minDebtTermSeconds = fields.minDebtTermSeconds
    this.fillableUntilTimestamp = fields.fillableUntilTimestamp
    this.enableAutoRolloverOnFilledBorrows =
      fields.enableAutoRolloverOnFilledBorrows
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("remainingDebtAmount"),
        borsh.u32("maxBorrowRateBps"),
        borsh.u64("minDebtTermSeconds"),
        borsh.u64("fillableUntilTimestamp"),
        borsh.bool("enableAutoRolloverOnFilledBorrows"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new BorrowOrderConfigArgs({
      remainingDebtAmount: obj.remainingDebtAmount,
      maxBorrowRateBps: obj.maxBorrowRateBps,
      minDebtTermSeconds: obj.minDebtTermSeconds,
      fillableUntilTimestamp: obj.fillableUntilTimestamp,
      enableAutoRolloverOnFilledBorrows: obj.enableAutoRolloverOnFilledBorrows,
    })
  }

  static toEncodable(fields: BorrowOrderConfigArgsFields) {
    return {
      remainingDebtAmount: fields.remainingDebtAmount,
      maxBorrowRateBps: fields.maxBorrowRateBps,
      minDebtTermSeconds: fields.minDebtTermSeconds,
      fillableUntilTimestamp: fields.fillableUntilTimestamp,
      enableAutoRolloverOnFilledBorrows:
        fields.enableAutoRolloverOnFilledBorrows,
    }
  }

  toJSON(): BorrowOrderConfigArgsJSON {
    return {
      remainingDebtAmount: this.remainingDebtAmount.toString(),
      maxBorrowRateBps: this.maxBorrowRateBps,
      minDebtTermSeconds: this.minDebtTermSeconds.toString(),
      fillableUntilTimestamp: this.fillableUntilTimestamp.toString(),
      enableAutoRolloverOnFilledBorrows: this.enableAutoRolloverOnFilledBorrows,
    }
  }

  static fromJSON(obj: BorrowOrderConfigArgsJSON): BorrowOrderConfigArgs {
    return new BorrowOrderConfigArgs({
      remainingDebtAmount: new BN(obj.remainingDebtAmount),
      maxBorrowRateBps: obj.maxBorrowRateBps,
      minDebtTermSeconds: new BN(obj.minDebtTermSeconds),
      fillableUntilTimestamp: new BN(obj.fillableUntilTimestamp),
      enableAutoRolloverOnFilledBorrows: obj.enableAutoRolloverOnFilledBorrows,
    })
  }

  toEncodable() {
    return BorrowOrderConfigArgs.toEncodable(this)
  }
}
