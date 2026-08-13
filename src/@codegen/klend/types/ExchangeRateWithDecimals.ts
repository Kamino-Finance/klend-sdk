import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ExchangeRateWithDecimalsFields {
  exchangeRateSf: BN
  mintDecimals: number
}

export interface ExchangeRateWithDecimalsJSON {
  exchangeRateSf: string
  mintDecimals: number
}

export class ExchangeRateWithDecimals {
  readonly exchangeRateSf: BN
  readonly mintDecimals: number

  constructor(fields: ExchangeRateWithDecimalsFields) {
    this.exchangeRateSf = fields.exchangeRateSf
    this.mintDecimals = fields.mintDecimals
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u128("exchangeRateSf"), borsh.u8("mintDecimals")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ExchangeRateWithDecimals({
      exchangeRateSf: obj.exchangeRateSf,
      mintDecimals: obj.mintDecimals,
    })
  }

  static toEncodable(fields: ExchangeRateWithDecimalsFields) {
    return {
      exchangeRateSf: fields.exchangeRateSf,
      mintDecimals: fields.mintDecimals,
    }
  }

  toJSON(): ExchangeRateWithDecimalsJSON {
    return {
      exchangeRateSf: this.exchangeRateSf.toString(),
      mintDecimals: this.mintDecimals,
    }
  }

  static fromJSON(obj: ExchangeRateWithDecimalsJSON): ExchangeRateWithDecimals {
    return new ExchangeRateWithDecimals({
      exchangeRateSf: new BN(obj.exchangeRateSf),
      mintDecimals: obj.mintDecimals,
    })
  }

  toEncodable() {
    return ExchangeRateWithDecimals.toEncodable(this)
  }
}
