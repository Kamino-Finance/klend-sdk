import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ClosePositionRequestParamsFields {}

export interface ClosePositionRequestParamsJSON {}

export class ClosePositionRequestParams {
  constructor(fields: ClosePositionRequestParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ClosePositionRequestParams({})
  }

  static toEncodable(fields: ClosePositionRequestParamsFields) {
    return {}
  }

  toJSON(): ClosePositionRequestParamsJSON {
    return {}
  }

  static fromJSON(
    obj: ClosePositionRequestParamsJSON
  ): ClosePositionRequestParams {
    return new ClosePositionRequestParams({})
  }

  toEncodable() {
    return ClosePositionRequestParams.toEncodable(this)
  }
}
