import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PricingParamsFields {
  tradeSpreadLong: BN
  tradeSpreadShort: BN
  swapSpread: BN
  maxLeverage: BN
  maxGlobalLongSizes: BN
  maxGlobalShortSizes: BN
}

export interface PricingParamsJSON {
  tradeSpreadLong: string
  tradeSpreadShort: string
  swapSpread: string
  maxLeverage: string
  maxGlobalLongSizes: string
  maxGlobalShortSizes: string
}

export class PricingParams {
  readonly tradeSpreadLong: BN
  readonly tradeSpreadShort: BN
  readonly swapSpread: BN
  readonly maxLeverage: BN
  readonly maxGlobalLongSizes: BN
  readonly maxGlobalShortSizes: BN

  constructor(fields: PricingParamsFields) {
    this.tradeSpreadLong = fields.tradeSpreadLong
    this.tradeSpreadShort = fields.tradeSpreadShort
    this.swapSpread = fields.swapSpread
    this.maxLeverage = fields.maxLeverage
    this.maxGlobalLongSizes = fields.maxGlobalLongSizes
    this.maxGlobalShortSizes = fields.maxGlobalShortSizes
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("tradeSpreadLong"),
        borsh.u64("tradeSpreadShort"),
        borsh.u64("swapSpread"),
        borsh.u64("maxLeverage"),
        borsh.u64("maxGlobalLongSizes"),
        borsh.u64("maxGlobalShortSizes"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PricingParams({
      tradeSpreadLong: obj.tradeSpreadLong,
      tradeSpreadShort: obj.tradeSpreadShort,
      swapSpread: obj.swapSpread,
      maxLeverage: obj.maxLeverage,
      maxGlobalLongSizes: obj.maxGlobalLongSizes,
      maxGlobalShortSizes: obj.maxGlobalShortSizes,
    })
  }

  static toEncodable(fields: PricingParamsFields) {
    return {
      tradeSpreadLong: fields.tradeSpreadLong,
      tradeSpreadShort: fields.tradeSpreadShort,
      swapSpread: fields.swapSpread,
      maxLeverage: fields.maxLeverage,
      maxGlobalLongSizes: fields.maxGlobalLongSizes,
      maxGlobalShortSizes: fields.maxGlobalShortSizes,
    }
  }

  toJSON(): PricingParamsJSON {
    return {
      tradeSpreadLong: this.tradeSpreadLong.toString(),
      tradeSpreadShort: this.tradeSpreadShort.toString(),
      swapSpread: this.swapSpread.toString(),
      maxLeverage: this.maxLeverage.toString(),
      maxGlobalLongSizes: this.maxGlobalLongSizes.toString(),
      maxGlobalShortSizes: this.maxGlobalShortSizes.toString(),
    }
  }

  static fromJSON(obj: PricingParamsJSON): PricingParams {
    return new PricingParams({
      tradeSpreadLong: new BN(obj.tradeSpreadLong),
      tradeSpreadShort: new BN(obj.tradeSpreadShort),
      swapSpread: new BN(obj.swapSpread),
      maxLeverage: new BN(obj.maxLeverage),
      maxGlobalLongSizes: new BN(obj.maxGlobalLongSizes),
      maxGlobalShortSizes: new BN(obj.maxGlobalShortSizes),
    })
  }

  toEncodable() {
    return PricingParams.toEncodable(this)
  }
}
