import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface OraclePriceFields {
  price: BN
  exponent: number
}

export interface OraclePriceJSON {
  price: string
  exponent: number
}

export class OraclePrice {
  readonly price: BN
  readonly exponent: number

  constructor(fields: OraclePriceFields) {
    this.price = fields.price
    this.exponent = fields.exponent
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u64("price"), borsh.i32("exponent")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new OraclePrice({
      price: obj.price,
      exponent: obj.exponent,
    })
  }

  static toEncodable(fields: OraclePriceFields) {
    return {
      price: fields.price,
      exponent: fields.exponent,
    }
  }

  toJSON(): OraclePriceJSON {
    return {
      price: this.price.toString(),
      exponent: this.exponent,
    }
  }

  static fromJSON(obj: OraclePriceJSON): OraclePrice {
    return new OraclePrice({
      price: new BN(obj.price),
      exponent: obj.exponent,
    })
  }

  toEncodable() {
    return OraclePrice.toEncodable(this)
  }
}
