import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PoolAprFields {
  lastUpdated: BN
  feeAprBps: BN
  realizedFeeUsd: BN
}

export interface PoolAprJSON {
  lastUpdated: string
  feeAprBps: string
  realizedFeeUsd: string
}

export class PoolApr {
  readonly lastUpdated: BN
  readonly feeAprBps: BN
  readonly realizedFeeUsd: BN

  constructor(fields: PoolAprFields) {
    this.lastUpdated = fields.lastUpdated
    this.feeAprBps = fields.feeAprBps
    this.realizedFeeUsd = fields.realizedFeeUsd
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.i64("lastUpdated"),
        borsh.u64("feeAprBps"),
        borsh.u64("realizedFeeUsd"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PoolApr({
      lastUpdated: obj.lastUpdated,
      feeAprBps: obj.feeAprBps,
      realizedFeeUsd: obj.realizedFeeUsd,
    })
  }

  static toEncodable(fields: PoolAprFields) {
    return {
      lastUpdated: fields.lastUpdated,
      feeAprBps: fields.feeAprBps,
      realizedFeeUsd: fields.realizedFeeUsd,
    }
  }

  toJSON(): PoolAprJSON {
    return {
      lastUpdated: this.lastUpdated.toString(),
      feeAprBps: this.feeAprBps.toString(),
      realizedFeeUsd: this.realizedFeeUsd.toString(),
    }
  }

  static fromJSON(obj: PoolAprJSON): PoolApr {
    return new PoolApr({
      lastUpdated: new BN(obj.lastUpdated),
      feeAprBps: new BN(obj.feeAprBps),
      realizedFeeUsd: new BN(obj.realizedFeeUsd),
    })
  }

  toEncodable() {
    return PoolApr.toEncodable(this)
  }
}
