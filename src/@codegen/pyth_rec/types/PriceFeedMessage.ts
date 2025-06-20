import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PriceFeedMessageFields {
  feedId: Array<number>
  price: BN
  conf: BN
  exponent: number
  publishTime: BN
  prevPublishTime: BN
  emaPrice: BN
  emaConf: BN
}

export interface PriceFeedMessageJSON {
  feedId: Array<number>
  price: string
  conf: string
  exponent: number
  publishTime: string
  prevPublishTime: string
  emaPrice: string
  emaConf: string
}

export class PriceFeedMessage {
  readonly feedId: Array<number>
  readonly price: BN
  readonly conf: BN
  readonly exponent: number
  readonly publishTime: BN
  readonly prevPublishTime: BN
  readonly emaPrice: BN
  readonly emaConf: BN

  constructor(fields: PriceFeedMessageFields) {
    this.feedId = fields.feedId
    this.price = fields.price
    this.conf = fields.conf
    this.exponent = fields.exponent
    this.publishTime = fields.publishTime
    this.prevPublishTime = fields.prevPublishTime
    this.emaPrice = fields.emaPrice
    this.emaConf = fields.emaConf
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.array(borsh.u8(), 32, "feedId"),
        borsh.i64("price"),
        borsh.u64("conf"),
        borsh.i32("exponent"),
        borsh.i64("publishTime"),
        borsh.i64("prevPublishTime"),
        borsh.i64("emaPrice"),
        borsh.u64("emaConf"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PriceFeedMessage({
      feedId: obj.feedId,
      price: obj.price,
      conf: obj.conf,
      exponent: obj.exponent,
      publishTime: obj.publishTime,
      prevPublishTime: obj.prevPublishTime,
      emaPrice: obj.emaPrice,
      emaConf: obj.emaConf,
    })
  }

  static toEncodable(fields: PriceFeedMessageFields) {
    return {
      feedId: fields.feedId,
      price: fields.price,
      conf: fields.conf,
      exponent: fields.exponent,
      publishTime: fields.publishTime,
      prevPublishTime: fields.prevPublishTime,
      emaPrice: fields.emaPrice,
      emaConf: fields.emaConf,
    }
  }

  toJSON(): PriceFeedMessageJSON {
    return {
      feedId: this.feedId,
      price: this.price.toString(),
      conf: this.conf.toString(),
      exponent: this.exponent,
      publishTime: this.publishTime.toString(),
      prevPublishTime: this.prevPublishTime.toString(),
      emaPrice: this.emaPrice.toString(),
      emaConf: this.emaConf.toString(),
    }
  }

  static fromJSON(obj: PriceFeedMessageJSON): PriceFeedMessage {
    return new PriceFeedMessage({
      feedId: obj.feedId,
      price: new BN(obj.price),
      conf: new BN(obj.conf),
      exponent: obj.exponent,
      publishTime: new BN(obj.publishTime),
      prevPublishTime: new BN(obj.prevPublishTime),
      emaPrice: new BN(obj.emaPrice),
      emaConf: new BN(obj.emaConf),
    })
  }

  toEncodable() {
    return PriceFeedMessage.toEncodable(this)
  }
}
