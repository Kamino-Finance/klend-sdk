import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface LimitFields {
  maxAumUsd: BN
  maxIndividualLpToken: BN
  maxPositionUsd: BN
}

export interface LimitJSON {
  maxAumUsd: string
  maxIndividualLpToken: string
  maxPositionUsd: string
}

export class Limit {
  readonly maxAumUsd: BN
  readonly maxIndividualLpToken: BN
  readonly maxPositionUsd: BN

  constructor(fields: LimitFields) {
    this.maxAumUsd = fields.maxAumUsd
    this.maxIndividualLpToken = fields.maxIndividualLpToken
    this.maxPositionUsd = fields.maxPositionUsd
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u128("maxAumUsd"),
        borsh.u128("maxIndividualLpToken"),
        borsh.u64("maxPositionUsd"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new Limit({
      maxAumUsd: obj.maxAumUsd,
      maxIndividualLpToken: obj.maxIndividualLpToken,
      maxPositionUsd: obj.maxPositionUsd,
    })
  }

  static toEncodable(fields: LimitFields) {
    return {
      maxAumUsd: fields.maxAumUsd,
      maxIndividualLpToken: fields.maxIndividualLpToken,
      maxPositionUsd: fields.maxPositionUsd,
    }
  }

  toJSON(): LimitJSON {
    return {
      maxAumUsd: this.maxAumUsd.toString(),
      maxIndividualLpToken: this.maxIndividualLpToken.toString(),
      maxPositionUsd: this.maxPositionUsd.toString(),
    }
  }

  static fromJSON(obj: LimitJSON): Limit {
    return new Limit({
      maxAumUsd: new BN(obj.maxAumUsd),
      maxIndividualLpToken: new BN(obj.maxIndividualLpToken),
      maxPositionUsd: new BN(obj.maxPositionUsd),
    })
  }

  toEncodable() {
    return Limit.toEncodable(this)
  }
}
