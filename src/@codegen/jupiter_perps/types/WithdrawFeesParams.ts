import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface WithdrawFeesParamsFields {}

export interface WithdrawFeesParamsJSON {}

export class WithdrawFeesParams {
  constructor(fields: WithdrawFeesParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new WithdrawFeesParams({})
  }

  static toEncodable(fields: WithdrawFeesParamsFields) {
    return {}
  }

  toJSON(): WithdrawFeesParamsJSON {
    return {}
  }

  static fromJSON(obj: WithdrawFeesParamsJSON): WithdrawFeesParams {
    return new WithdrawFeesParams({})
  }

  toEncodable() {
    return WithdrawFeesParams.toEncodable(this)
  }
}
