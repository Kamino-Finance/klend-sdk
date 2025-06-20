import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SetTestTimeParamsFields {
  time: BN
}

export interface SetTestTimeParamsJSON {
  time: string
}

export class SetTestTimeParams {
  readonly time: BN

  constructor(fields: SetTestTimeParamsFields) {
    this.time = fields.time
  }

  static layout(property?: string) {
    return borsh.struct([borsh.i64("time")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SetTestTimeParams({
      time: obj.time,
    })
  }

  static toEncodable(fields: SetTestTimeParamsFields) {
    return {
      time: fields.time,
    }
  }

  toJSON(): SetTestTimeParamsJSON {
    return {
      time: this.time.toString(),
    }
  }

  static fromJSON(obj: SetTestTimeParamsJSON): SetTestTimeParams {
    return new SetTestTimeParams({
      time: new BN(obj.time),
    })
  }

  toEncodable() {
    return SetTestTimeParams.toEncodable(this)
  }
}
