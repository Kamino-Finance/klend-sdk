import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface OracleParamsFields {
  oracleAccount: Address
  oracleType: types.OracleTypeKind
  maxPriceError: BN
  maxPriceAgeSec: number
}

export interface OracleParamsJSON {
  oracleAccount: string
  oracleType: types.OracleTypeJSON
  maxPriceError: string
  maxPriceAgeSec: number
}

export class OracleParams {
  readonly oracleAccount: Address
  readonly oracleType: types.OracleTypeKind
  readonly maxPriceError: BN
  readonly maxPriceAgeSec: number

  constructor(fields: OracleParamsFields) {
    this.oracleAccount = fields.oracleAccount
    this.oracleType = fields.oracleType
    this.maxPriceError = fields.maxPriceError
    this.maxPriceAgeSec = fields.maxPriceAgeSec
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("oracleAccount"),
        types.OracleType.layout("oracleType"),
        borsh.u64("maxPriceError"),
        borsh.u32("maxPriceAgeSec"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new OracleParams({
      oracleAccount: obj.oracleAccount,
      oracleType: types.OracleType.fromDecoded(obj.oracleType),
      maxPriceError: obj.maxPriceError,
      maxPriceAgeSec: obj.maxPriceAgeSec,
    })
  }

  static toEncodable(fields: OracleParamsFields) {
    return {
      oracleAccount: fields.oracleAccount,
      oracleType: fields.oracleType.toEncodable(),
      maxPriceError: fields.maxPriceError,
      maxPriceAgeSec: fields.maxPriceAgeSec,
    }
  }

  toJSON(): OracleParamsJSON {
    return {
      oracleAccount: this.oracleAccount,
      oracleType: this.oracleType.toJSON(),
      maxPriceError: this.maxPriceError.toString(),
      maxPriceAgeSec: this.maxPriceAgeSec,
    }
  }

  static fromJSON(obj: OracleParamsJSON): OracleParams {
    return new OracleParams({
      oracleAccount: address(obj.oracleAccount),
      oracleType: types.OracleType.fromJSON(obj.oracleType),
      maxPriceError: new BN(obj.maxPriceError),
      maxPriceAgeSec: obj.maxPriceAgeSec,
    })
  }

  toEncodable() {
    return OracleParams.toEncodable(this)
  }
}
