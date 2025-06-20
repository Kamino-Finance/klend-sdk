import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface AddPoolParamsFields {
  name: string
  limit: types.LimitFields
  fees: types.FeesFields
  maxRequestExecutionSec: BN
}

export interface AddPoolParamsJSON {
  name: string
  limit: types.LimitJSON
  fees: types.FeesJSON
  maxRequestExecutionSec: string
}

export class AddPoolParams {
  readonly name: string
  readonly limit: types.Limit
  readonly fees: types.Fees
  readonly maxRequestExecutionSec: BN

  constructor(fields: AddPoolParamsFields) {
    this.name = fields.name
    this.limit = new types.Limit({ ...fields.limit })
    this.fees = new types.Fees({ ...fields.fees })
    this.maxRequestExecutionSec = fields.maxRequestExecutionSec
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.str("name"),
        types.Limit.layout("limit"),
        types.Fees.layout("fees"),
        borsh.i64("maxRequestExecutionSec"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new AddPoolParams({
      name: obj.name,
      limit: types.Limit.fromDecoded(obj.limit),
      fees: types.Fees.fromDecoded(obj.fees),
      maxRequestExecutionSec: obj.maxRequestExecutionSec,
    })
  }

  static toEncodable(fields: AddPoolParamsFields) {
    return {
      name: fields.name,
      limit: types.Limit.toEncodable(fields.limit),
      fees: types.Fees.toEncodable(fields.fees),
      maxRequestExecutionSec: fields.maxRequestExecutionSec,
    }
  }

  toJSON(): AddPoolParamsJSON {
    return {
      name: this.name,
      limit: this.limit.toJSON(),
      fees: this.fees.toJSON(),
      maxRequestExecutionSec: this.maxRequestExecutionSec.toString(),
    }
  }

  static fromJSON(obj: AddPoolParamsJSON): AddPoolParams {
    return new AddPoolParams({
      name: obj.name,
      limit: types.Limit.fromJSON(obj.limit),
      fees: types.Fees.fromJSON(obj.fees),
      maxRequestExecutionSec: new BN(obj.maxRequestExecutionSec),
    })
  }

  toEncodable() {
    return AddPoolParams.toEncodable(this)
  }
}
