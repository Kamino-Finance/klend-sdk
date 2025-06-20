import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SetCustodyGlobalLimitParamsFields {
  maxGlobalLongSizes: BN
  maxGlobalShortSizes: BN
}

export interface SetCustodyGlobalLimitParamsJSON {
  maxGlobalLongSizes: string
  maxGlobalShortSizes: string
}

export class SetCustodyGlobalLimitParams {
  readonly maxGlobalLongSizes: BN
  readonly maxGlobalShortSizes: BN

  constructor(fields: SetCustodyGlobalLimitParamsFields) {
    this.maxGlobalLongSizes = fields.maxGlobalLongSizes
    this.maxGlobalShortSizes = fields.maxGlobalShortSizes
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("maxGlobalLongSizes"), borsh.u64("maxGlobalShortSizes")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SetCustodyGlobalLimitParams({
      maxGlobalLongSizes: obj.maxGlobalLongSizes,
      maxGlobalShortSizes: obj.maxGlobalShortSizes,
    })
  }

  static toEncodable(fields: SetCustodyGlobalLimitParamsFields) {
    return {
      maxGlobalLongSizes: fields.maxGlobalLongSizes,
      maxGlobalShortSizes: fields.maxGlobalShortSizes,
    }
  }

  toJSON(): SetCustodyGlobalLimitParamsJSON {
    return {
      maxGlobalLongSizes: this.maxGlobalLongSizes.toString(),
      maxGlobalShortSizes: this.maxGlobalShortSizes.toString(),
    }
  }

  static fromJSON(
    obj: SetCustodyGlobalLimitParamsJSON
  ): SetCustodyGlobalLimitParams {
    return new SetCustodyGlobalLimitParams({
      maxGlobalLongSizes: new BN(obj.maxGlobalLongSizes),
      maxGlobalShortSizes: new BN(obj.maxGlobalShortSizes),
    })
  }

  toEncodable() {
    return SetCustodyGlobalLimitParams.toEncodable(this)
  }
}
