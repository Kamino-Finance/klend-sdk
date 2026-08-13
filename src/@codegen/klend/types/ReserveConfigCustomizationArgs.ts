import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveConfigCustomizationArgsFields {
  overrideFixedRateBps: number
  fixedBorrowRateBps: number
  overrideDebtTermSeconds: number
  debtTermSeconds: BN
  clearElevationGroups: number
}

export interface ReserveConfigCustomizationArgsJSON {
  overrideFixedRateBps: number
  fixedBorrowRateBps: number
  overrideDebtTermSeconds: number
  debtTermSeconds: string
  clearElevationGroups: number
}

export class ReserveConfigCustomizationArgs {
  readonly overrideFixedRateBps: number
  readonly fixedBorrowRateBps: number
  readonly overrideDebtTermSeconds: number
  readonly debtTermSeconds: BN
  readonly clearElevationGroups: number

  constructor(fields: ReserveConfigCustomizationArgsFields) {
    this.overrideFixedRateBps = fields.overrideFixedRateBps
    this.fixedBorrowRateBps = fields.fixedBorrowRateBps
    this.overrideDebtTermSeconds = fields.overrideDebtTermSeconds
    this.debtTermSeconds = fields.debtTermSeconds
    this.clearElevationGroups = fields.clearElevationGroups
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u8("overrideFixedRateBps"),
        borsh.u32("fixedBorrowRateBps"),
        borsh.u8("overrideDebtTermSeconds"),
        borsh.u64("debtTermSeconds"),
        borsh.u8("clearElevationGroups"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveConfigCustomizationArgs({
      overrideFixedRateBps: obj.overrideFixedRateBps,
      fixedBorrowRateBps: obj.fixedBorrowRateBps,
      overrideDebtTermSeconds: obj.overrideDebtTermSeconds,
      debtTermSeconds: obj.debtTermSeconds,
      clearElevationGroups: obj.clearElevationGroups,
    })
  }

  static toEncodable(fields: ReserveConfigCustomizationArgsFields) {
    return {
      overrideFixedRateBps: fields.overrideFixedRateBps,
      fixedBorrowRateBps: fields.fixedBorrowRateBps,
      overrideDebtTermSeconds: fields.overrideDebtTermSeconds,
      debtTermSeconds: fields.debtTermSeconds,
      clearElevationGroups: fields.clearElevationGroups,
    }
  }

  toJSON(): ReserveConfigCustomizationArgsJSON {
    return {
      overrideFixedRateBps: this.overrideFixedRateBps,
      fixedBorrowRateBps: this.fixedBorrowRateBps,
      overrideDebtTermSeconds: this.overrideDebtTermSeconds,
      debtTermSeconds: this.debtTermSeconds.toString(),
      clearElevationGroups: this.clearElevationGroups,
    }
  }

  static fromJSON(
    obj: ReserveConfigCustomizationArgsJSON
  ): ReserveConfigCustomizationArgs {
    return new ReserveConfigCustomizationArgs({
      overrideFixedRateBps: obj.overrideFixedRateBps,
      fixedBorrowRateBps: obj.fixedBorrowRateBps,
      overrideDebtTermSeconds: obj.overrideDebtTermSeconds,
      debtTermSeconds: new BN(obj.debtTermSeconds),
      clearElevationGroups: obj.clearElevationGroups,
    })
  }

  toEncodable() {
    return ReserveConfigCustomizationArgs.toEncodable(this)
  }
}
