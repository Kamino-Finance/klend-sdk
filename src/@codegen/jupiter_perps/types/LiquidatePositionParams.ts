import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface LiquidatePositionParamsFields {}

export interface LiquidatePositionParamsJSON {}

export class LiquidatePositionParams {
  constructor(fields: LiquidatePositionParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new LiquidatePositionParams({})
  }

  static toEncodable(fields: LiquidatePositionParamsFields) {
    return {}
  }

  toJSON(): LiquidatePositionParamsJSON {
    return {}
  }

  static fromJSON(obj: LiquidatePositionParamsJSON): LiquidatePositionParams {
    return new LiquidatePositionParams({})
  }

  toEncodable() {
    return LiquidatePositionParams.toEncodable(this)
  }
}
