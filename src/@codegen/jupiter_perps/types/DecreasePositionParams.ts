import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface DecreasePositionParamsFields {}

export interface DecreasePositionParamsJSON {}

export class DecreasePositionParams {
  constructor(fields: DecreasePositionParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new DecreasePositionParams({})
  }

  static toEncodable(fields: DecreasePositionParamsFields) {
    return {}
  }

  toJSON(): DecreasePositionParamsJSON {
    return {}
  }

  static fromJSON(obj: DecreasePositionParamsJSON): DecreasePositionParams {
    return new DecreasePositionParams({})
  }

  toEncodable() {
    return DecreasePositionParams.toEncodable(this)
  }
}
