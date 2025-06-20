import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface AggregatorSetHistoryBufferParamsFields {}

export interface AggregatorSetHistoryBufferParamsJSON {}

export class AggregatorSetHistoryBufferParams {
  constructor(fields: AggregatorSetHistoryBufferParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new AggregatorSetHistoryBufferParams({})
  }

  static toEncodable(fields: AggregatorSetHistoryBufferParamsFields) {
    return {}
  }

  toJSON(): AggregatorSetHistoryBufferParamsJSON {
    return {}
  }

  static fromJSON(
    obj: AggregatorSetHistoryBufferParamsJSON
  ): AggregatorSetHistoryBufferParams {
    return new AggregatorSetHistoryBufferParams({})
  }

  toEncodable() {
    return AggregatorSetHistoryBufferParams.toEncodable(this)
  }
}
