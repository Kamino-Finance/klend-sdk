import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface FundingRateStateFields {
  cumulativeInterestRate: BN
  lastUpdate: BN
  hourlyFundingBps: BN
}

export interface FundingRateStateJSON {
  cumulativeInterestRate: string
  lastUpdate: string
  hourlyFundingBps: string
}

export class FundingRateState {
  readonly cumulativeInterestRate: BN
  readonly lastUpdate: BN
  readonly hourlyFundingBps: BN

  constructor(fields: FundingRateStateFields) {
    this.cumulativeInterestRate = fields.cumulativeInterestRate
    this.lastUpdate = fields.lastUpdate
    this.hourlyFundingBps = fields.hourlyFundingBps
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u128("cumulativeInterestRate"),
        borsh.i64("lastUpdate"),
        borsh.u64("hourlyFundingBps"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new FundingRateState({
      cumulativeInterestRate: obj.cumulativeInterestRate,
      lastUpdate: obj.lastUpdate,
      hourlyFundingBps: obj.hourlyFundingBps,
    })
  }

  static toEncodable(fields: FundingRateStateFields) {
    return {
      cumulativeInterestRate: fields.cumulativeInterestRate,
      lastUpdate: fields.lastUpdate,
      hourlyFundingBps: fields.hourlyFundingBps,
    }
  }

  toJSON(): FundingRateStateJSON {
    return {
      cumulativeInterestRate: this.cumulativeInterestRate.toString(),
      lastUpdate: this.lastUpdate.toString(),
      hourlyFundingBps: this.hourlyFundingBps.toString(),
    }
  }

  static fromJSON(obj: FundingRateStateJSON): FundingRateState {
    return new FundingRateState({
      cumulativeInterestRate: new BN(obj.cumulativeInterestRate),
      lastUpdate: new BN(obj.lastUpdate),
      hourlyFundingBps: new BN(obj.hourlyFundingBps),
    })
  }

  toEncodable() {
    return FundingRateState.toEncodable(this)
  }
}
