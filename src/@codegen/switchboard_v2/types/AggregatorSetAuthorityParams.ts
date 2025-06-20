import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface AggregatorSetAuthorityParamsFields {}

export interface AggregatorSetAuthorityParamsJSON {}

export class AggregatorSetAuthorityParams {
  constructor(fields: AggregatorSetAuthorityParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new AggregatorSetAuthorityParams({})
  }

  static toEncodable(fields: AggregatorSetAuthorityParamsFields) {
    return {}
  }

  toJSON(): AggregatorSetAuthorityParamsJSON {
    return {}
  }

  static fromJSON(
    obj: AggregatorSetAuthorityParamsJSON
  ): AggregatorSetAuthorityParams {
    return new AggregatorSetAuthorityParams({})
  }

  toEncodable() {
    return AggregatorSetAuthorityParams.toEncodable(this)
  }
}
