import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface LastUpdateFields {
  slot: BN
  stale: number
  priceStatus: number
  alignmentPadding: Array<number>
  timestamp: number
}

export interface LastUpdateJSON {
  slot: string
  stale: number
  priceStatus: number
  alignmentPadding: Array<number>
  timestamp: number
}

export class LastUpdate {
  readonly slot: BN
  readonly stale: number
  readonly priceStatus: number
  readonly alignmentPadding: Array<number>
  readonly timestamp: number

  constructor(fields: LastUpdateFields) {
    this.slot = fields.slot
    this.stale = fields.stale
    this.priceStatus = fields.priceStatus
    this.alignmentPadding = fields.alignmentPadding
    this.timestamp = fields.timestamp
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("slot"),
        borsh.u8("stale"),
        borsh.u8("priceStatus"),
        borsh.array(borsh.u8(), 2, "alignmentPadding"),
        borsh.u32("timestamp"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new LastUpdate({
      slot: obj.slot,
      stale: obj.stale,
      priceStatus: obj.priceStatus,
      alignmentPadding: obj.alignmentPadding,
      timestamp: obj.timestamp,
    })
  }

  static toEncodable(fields: LastUpdateFields) {
    return {
      slot: fields.slot,
      stale: fields.stale,
      priceStatus: fields.priceStatus,
      alignmentPadding: fields.alignmentPadding,
      timestamp: fields.timestamp,
    }
  }

  toJSON(): LastUpdateJSON {
    return {
      slot: this.slot.toString(),
      stale: this.stale,
      priceStatus: this.priceStatus,
      alignmentPadding: this.alignmentPadding,
      timestamp: this.timestamp,
    }
  }

  static fromJSON(obj: LastUpdateJSON): LastUpdate {
    return new LastUpdate({
      slot: new BN(obj.slot),
      stale: obj.stale,
      priceStatus: obj.priceStatus,
      alignmentPadding: obj.alignmentPadding,
      timestamp: obj.timestamp,
    })
  }

  toEncodable() {
    return LastUpdate.toEncodable(this)
  }
}
