import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SetTestOraclePriceParamsFields {
  price: BN
  expo: number
  conf: BN
  publishTime: BN
}

export interface SetTestOraclePriceParamsJSON {
  price: string
  expo: number
  conf: string
  publishTime: string
}

export class SetTestOraclePriceParams {
  readonly price: BN
  readonly expo: number
  readonly conf: BN
  readonly publishTime: BN

  constructor(fields: SetTestOraclePriceParamsFields) {
    this.price = fields.price
    this.expo = fields.expo
    this.conf = fields.conf
    this.publishTime = fields.publishTime
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("price"),
        borsh.i32("expo"),
        borsh.u64("conf"),
        borsh.i64("publishTime"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SetTestOraclePriceParams({
      price: obj.price,
      expo: obj.expo,
      conf: obj.conf,
      publishTime: obj.publishTime,
    })
  }

  static toEncodable(fields: SetTestOraclePriceParamsFields) {
    return {
      price: fields.price,
      expo: fields.expo,
      conf: fields.conf,
      publishTime: fields.publishTime,
    }
  }

  toJSON(): SetTestOraclePriceParamsJSON {
    return {
      price: this.price.toString(),
      expo: this.expo,
      conf: this.conf.toString(),
      publishTime: this.publishTime.toString(),
    }
  }

  static fromJSON(obj: SetTestOraclePriceParamsJSON): SetTestOraclePriceParams {
    return new SetTestOraclePriceParams({
      price: new BN(obj.price),
      expo: obj.expo,
      conf: new BN(obj.conf),
      publishTime: new BN(obj.publishTime),
    })
  }

  toEncodable() {
    return SetTestOraclePriceParams.toEncodable(this)
  }
}
