import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface IncreasePositionParamsFields {}

export interface IncreasePositionParamsJSON {}

export class IncreasePositionParams {
  constructor(fields: IncreasePositionParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new IncreasePositionParams({})
  }

  static toEncodable(fields: IncreasePositionParamsFields) {
    return {}
  }

  toJSON(): IncreasePositionParamsJSON {
    return {}
  }

  static fromJSON(obj: IncreasePositionParamsJSON): IncreasePositionParams {
    return new IncreasePositionParams({})
  }

  toEncodable() {
    return IncreasePositionParams.toEncodable(this)
  }
}
