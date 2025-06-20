import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface TwapPriceFields {
  feedId: Array<number>
  startTime: BN
  endTime: BN
  price: BN
  conf: BN
  exponent: number
  /**
   * Ratio out of 1_000_000, where a value of 1_000_000 represents
   * all slots were missed and 0 represents no slots were missed.
   */
  downSlotsRatio: number
}

export interface TwapPriceJSON {
  feedId: Array<number>
  startTime: string
  endTime: string
  price: string
  conf: string
  exponent: number
  /**
   * Ratio out of 1_000_000, where a value of 1_000_000 represents
   * all slots were missed and 0 represents no slots were missed.
   */
  downSlotsRatio: number
}

/**
 * The time weighted average price & conf for a feed over the window [start_time, end_time].
 * This type is used to persist the calculated TWAP in TwapUpdate accounts on Solana.
 */
export class TwapPrice {
  readonly feedId: Array<number>
  readonly startTime: BN
  readonly endTime: BN
  readonly price: BN
  readonly conf: BN
  readonly exponent: number
  /**
   * Ratio out of 1_000_000, where a value of 1_000_000 represents
   * all slots were missed and 0 represents no slots were missed.
   */
  readonly downSlotsRatio: number

  constructor(fields: TwapPriceFields) {
    this.feedId = fields.feedId
    this.startTime = fields.startTime
    this.endTime = fields.endTime
    this.price = fields.price
    this.conf = fields.conf
    this.exponent = fields.exponent
    this.downSlotsRatio = fields.downSlotsRatio
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.array(borsh.u8(), 32, "feedId"),
        borsh.i64("startTime"),
        borsh.i64("endTime"),
        borsh.i64("price"),
        borsh.u64("conf"),
        borsh.i32("exponent"),
        borsh.u32("downSlotsRatio"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new TwapPrice({
      feedId: obj.feedId,
      startTime: obj.startTime,
      endTime: obj.endTime,
      price: obj.price,
      conf: obj.conf,
      exponent: obj.exponent,
      downSlotsRatio: obj.downSlotsRatio,
    })
  }

  static toEncodable(fields: TwapPriceFields) {
    return {
      feedId: fields.feedId,
      startTime: fields.startTime,
      endTime: fields.endTime,
      price: fields.price,
      conf: fields.conf,
      exponent: fields.exponent,
      downSlotsRatio: fields.downSlotsRatio,
    }
  }

  toJSON(): TwapPriceJSON {
    return {
      feedId: this.feedId,
      startTime: this.startTime.toString(),
      endTime: this.endTime.toString(),
      price: this.price.toString(),
      conf: this.conf.toString(),
      exponent: this.exponent,
      downSlotsRatio: this.downSlotsRatio,
    }
  }

  static fromJSON(obj: TwapPriceJSON): TwapPrice {
    return new TwapPrice({
      feedId: obj.feedId,
      startTime: new BN(obj.startTime),
      endTime: new BN(obj.endTime),
      price: new BN(obj.price),
      conf: new BN(obj.conf),
      exponent: obj.exponent,
      downSlotsRatio: obj.downSlotsRatio,
    })
  }

  toEncodable() {
    return TwapPrice.toEncodable(this)
  }
}
