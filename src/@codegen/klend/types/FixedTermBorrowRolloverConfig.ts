import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface FixedTermBorrowRolloverConfigFields {
  autoRolloverEnabled: number
  openTermAllowed: number
  migrationToFixedEnabled: number
  fixedTermRolloverWindowDurationDays: number
  maxBorrowRateBps: number
  minDebtTermSeconds: BN
}

export interface FixedTermBorrowRolloverConfigJSON {
  autoRolloverEnabled: number
  openTermAllowed: number
  migrationToFixedEnabled: number
  fixedTermRolloverWindowDurationDays: number
  maxBorrowRateBps: number
  minDebtTermSeconds: string
}

export class FixedTermBorrowRolloverConfig {
  readonly autoRolloverEnabled: number
  readonly openTermAllowed: number
  readonly migrationToFixedEnabled: number
  readonly fixedTermRolloverWindowDurationDays: number
  readonly maxBorrowRateBps: number
  readonly minDebtTermSeconds: BN

  constructor(fields: FixedTermBorrowRolloverConfigFields) {
    this.autoRolloverEnabled = fields.autoRolloverEnabled
    this.openTermAllowed = fields.openTermAllowed
    this.migrationToFixedEnabled = fields.migrationToFixedEnabled
    this.fixedTermRolloverWindowDurationDays =
      fields.fixedTermRolloverWindowDurationDays
    this.maxBorrowRateBps = fields.maxBorrowRateBps
    this.minDebtTermSeconds = fields.minDebtTermSeconds
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u8("autoRolloverEnabled"),
        borsh.u8("openTermAllowed"),
        borsh.u8("migrationToFixedEnabled"),
        borsh.u8("fixedTermRolloverWindowDurationDays"),
        borsh.u32("maxBorrowRateBps"),
        borsh.u64("minDebtTermSeconds"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new FixedTermBorrowRolloverConfig({
      autoRolloverEnabled: obj.autoRolloverEnabled,
      openTermAllowed: obj.openTermAllowed,
      migrationToFixedEnabled: obj.migrationToFixedEnabled,
      fixedTermRolloverWindowDurationDays:
        obj.fixedTermRolloverWindowDurationDays,
      maxBorrowRateBps: obj.maxBorrowRateBps,
      minDebtTermSeconds: obj.minDebtTermSeconds,
    })
  }

  static toEncodable(fields: FixedTermBorrowRolloverConfigFields) {
    return {
      autoRolloverEnabled: fields.autoRolloverEnabled,
      openTermAllowed: fields.openTermAllowed,
      migrationToFixedEnabled: fields.migrationToFixedEnabled,
      fixedTermRolloverWindowDurationDays:
        fields.fixedTermRolloverWindowDurationDays,
      maxBorrowRateBps: fields.maxBorrowRateBps,
      minDebtTermSeconds: fields.minDebtTermSeconds,
    }
  }

  toJSON(): FixedTermBorrowRolloverConfigJSON {
    return {
      autoRolloverEnabled: this.autoRolloverEnabled,
      openTermAllowed: this.openTermAllowed,
      migrationToFixedEnabled: this.migrationToFixedEnabled,
      fixedTermRolloverWindowDurationDays:
        this.fixedTermRolloverWindowDurationDays,
      maxBorrowRateBps: this.maxBorrowRateBps,
      minDebtTermSeconds: this.minDebtTermSeconds.toString(),
    }
  }

  static fromJSON(
    obj: FixedTermBorrowRolloverConfigJSON
  ): FixedTermBorrowRolloverConfig {
    return new FixedTermBorrowRolloverConfig({
      autoRolloverEnabled: obj.autoRolloverEnabled,
      openTermAllowed: obj.openTermAllowed,
      migrationToFixedEnabled: obj.migrationToFixedEnabled,
      fixedTermRolloverWindowDurationDays:
        obj.fixedTermRolloverWindowDurationDays,
      maxBorrowRateBps: obj.maxBorrowRateBps,
      minDebtTermSeconds: new BN(obj.minDebtTermSeconds),
    })
  }

  toEncodable() {
    return FixedTermBorrowRolloverConfig.toEncodable(this)
  }
}
