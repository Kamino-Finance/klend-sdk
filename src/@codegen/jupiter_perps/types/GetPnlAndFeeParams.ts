import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetPnlAndFeeParamsFields {}

export interface GetPnlAndFeeParamsJSON {}

export class GetPnlAndFeeParams {
  constructor(fields: GetPnlAndFeeParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetPnlAndFeeParams({})
  }

  static toEncodable(fields: GetPnlAndFeeParamsFields) {
    return {}
  }

  toJSON(): GetPnlAndFeeParamsJSON {
    return {}
  }

  static fromJSON(obj: GetPnlAndFeeParamsJSON): GetPnlAndFeeParams {
    return new GetPnlAndFeeParams({})
  }

  toEncodable() {
    return GetPnlAndFeeParams.toEncodable(this)
  }
}
