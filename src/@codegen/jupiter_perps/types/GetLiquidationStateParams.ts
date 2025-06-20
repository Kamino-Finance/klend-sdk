import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetLiquidationStateParamsFields {}

export interface GetLiquidationStateParamsJSON {}

export class GetLiquidationStateParams {
  constructor(fields: GetLiquidationStateParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetLiquidationStateParams({})
  }

  static toEncodable(fields: GetLiquidationStateParamsFields) {
    return {}
  }

  toJSON(): GetLiquidationStateParamsJSON {
    return {}
  }

  static fromJSON(
    obj: GetLiquidationStateParamsJSON
  ): GetLiquidationStateParams {
    return new GetLiquidationStateParams({})
  }

  toEncodable() {
    return GetLiquidationStateParams.toEncodable(this)
  }
}
