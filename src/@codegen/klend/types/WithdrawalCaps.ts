import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface WithdrawalCapsFields {
  configCapacity: BN
  currentTotal: BN
  lastIntervalStartTimestamp: BN
  configIntervalLengthSeconds: BN
}

export interface WithdrawalCapsJSON {
  configCapacity: string
  currentTotal: string
  lastIntervalStartTimestamp: string
  configIntervalLengthSeconds: string
}

/** Reserve Withdrawal Caps State */
export class WithdrawalCaps {
  readonly configCapacity: BN
  readonly currentTotal: BN
  readonly lastIntervalStartTimestamp: BN
  readonly configIntervalLengthSeconds: BN

  constructor(fields: WithdrawalCapsFields) {
    this.configCapacity = fields.configCapacity
    this.currentTotal = fields.currentTotal
    this.lastIntervalStartTimestamp = fields.lastIntervalStartTimestamp
    this.configIntervalLengthSeconds = fields.configIntervalLengthSeconds
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.i64("configCapacity"),
        borsh.i64("currentTotal"),
        borsh.u64("lastIntervalStartTimestamp"),
        borsh.u64("configIntervalLengthSeconds"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new WithdrawalCaps({
      configCapacity: obj.configCapacity,
      currentTotal: obj.currentTotal,
      lastIntervalStartTimestamp: obj.lastIntervalStartTimestamp,
      configIntervalLengthSeconds: obj.configIntervalLengthSeconds,
    })
  }

  static toEncodable(fields: WithdrawalCapsFields) {
    return {
      configCapacity: fields.configCapacity,
      currentTotal: fields.currentTotal,
      lastIntervalStartTimestamp: fields.lastIntervalStartTimestamp,
      configIntervalLengthSeconds: fields.configIntervalLengthSeconds,
    }
  }

  toJSON(): WithdrawalCapsJSON {
    return {
      configCapacity: this.configCapacity.toString(),
      currentTotal: this.currentTotal.toString(),
      lastIntervalStartTimestamp: this.lastIntervalStartTimestamp.toString(),
      configIntervalLengthSeconds: this.configIntervalLengthSeconds.toString(),
    }
  }

  static fromJSON(obj: WithdrawalCapsJSON): WithdrawalCaps {
    return new WithdrawalCaps({
      configCapacity: new BN(obj.configCapacity),
      currentTotal: new BN(obj.currentTotal),
      lastIntervalStartTimestamp: new BN(obj.lastIntervalStartTimestamp),
      configIntervalLengthSeconds: new BN(obj.configIntervalLengthSeconds),
    })
  }

  toEncodable() {
    return WithdrawalCaps.toEncodable(this)
  }
}
