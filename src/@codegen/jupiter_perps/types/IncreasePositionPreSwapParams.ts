import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface IncreasePositionPreSwapParamsFields {}

export interface IncreasePositionPreSwapParamsJSON {}

export class IncreasePositionPreSwapParams {
  constructor(fields: IncreasePositionPreSwapParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new IncreasePositionPreSwapParams({})
  }

  static toEncodable(fields: IncreasePositionPreSwapParamsFields) {
    return {}
  }

  toJSON(): IncreasePositionPreSwapParamsJSON {
    return {}
  }

  static fromJSON(
    obj: IncreasePositionPreSwapParamsJSON
  ): IncreasePositionPreSwapParams {
    return new IncreasePositionPreSwapParams({})
  }

  toEncodable() {
    return IncreasePositionPreSwapParams.toEncodable(this)
  }
}
