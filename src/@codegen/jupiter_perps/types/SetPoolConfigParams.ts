import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SetPoolConfigParamsFields {
  fees: types.FeesFields
  limit: types.LimitFields
  maxRequestExecutionSec: BN
}

export interface SetPoolConfigParamsJSON {
  fees: types.FeesJSON
  limit: types.LimitJSON
  maxRequestExecutionSec: string
}

export class SetPoolConfigParams {
  readonly fees: types.Fees
  readonly limit: types.Limit
  readonly maxRequestExecutionSec: BN

  constructor(fields: SetPoolConfigParamsFields) {
    this.fees = new types.Fees({ ...fields.fees })
    this.limit = new types.Limit({ ...fields.limit })
    this.maxRequestExecutionSec = fields.maxRequestExecutionSec
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        types.Fees.layout("fees"),
        types.Limit.layout("limit"),
        borsh.i64("maxRequestExecutionSec"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SetPoolConfigParams({
      fees: types.Fees.fromDecoded(obj.fees),
      limit: types.Limit.fromDecoded(obj.limit),
      maxRequestExecutionSec: obj.maxRequestExecutionSec,
    })
  }

  static toEncodable(fields: SetPoolConfigParamsFields) {
    return {
      fees: types.Fees.toEncodable(fields.fees),
      limit: types.Limit.toEncodable(fields.limit),
      maxRequestExecutionSec: fields.maxRequestExecutionSec,
    }
  }

  toJSON(): SetPoolConfigParamsJSON {
    return {
      fees: this.fees.toJSON(),
      limit: this.limit.toJSON(),
      maxRequestExecutionSec: this.maxRequestExecutionSec.toString(),
    }
  }

  static fromJSON(obj: SetPoolConfigParamsJSON): SetPoolConfigParams {
    return new SetPoolConfigParams({
      fees: types.Fees.fromJSON(obj.fees),
      limit: types.Limit.fromJSON(obj.limit),
      maxRequestExecutionSec: new BN(obj.maxRequestExecutionSec),
    })
  }

  toEncodable() {
    return SetPoolConfigParams.toEncodable(this)
  }
}
