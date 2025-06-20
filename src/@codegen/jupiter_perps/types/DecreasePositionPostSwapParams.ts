import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface DecreasePositionPostSwapParamsFields {}

export interface DecreasePositionPostSwapParamsJSON {}

export class DecreasePositionPostSwapParams {
  constructor(fields: DecreasePositionPostSwapParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new DecreasePositionPostSwapParams({})
  }

  static toEncodable(fields: DecreasePositionPostSwapParamsFields) {
    return {}
  }

  toJSON(): DecreasePositionPostSwapParamsJSON {
    return {}
  }

  static fromJSON(
    obj: DecreasePositionPostSwapParamsJSON
  ): DecreasePositionPostSwapParams {
    return new DecreasePositionPostSwapParams({})
  }

  toEncodable() {
    return DecreasePositionPostSwapParams.toEncodable(this)
  }
}
