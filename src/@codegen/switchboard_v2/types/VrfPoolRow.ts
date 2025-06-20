import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface VrfPoolRowFields {
  timestamp: BN
  pubkey: Address
}

export interface VrfPoolRowJSON {
  timestamp: string
  pubkey: string
}

export class VrfPoolRow {
  readonly timestamp: BN
  readonly pubkey: Address

  constructor(fields: VrfPoolRowFields) {
    this.timestamp = fields.timestamp
    this.pubkey = fields.pubkey
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.i64("timestamp"), borshAddress("pubkey")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new VrfPoolRow({
      timestamp: obj.timestamp,
      pubkey: obj.pubkey,
    })
  }

  static toEncodable(fields: VrfPoolRowFields) {
    return {
      timestamp: fields.timestamp,
      pubkey: fields.pubkey,
    }
  }

  toJSON(): VrfPoolRowJSON {
    return {
      timestamp: this.timestamp.toString(),
      pubkey: this.pubkey,
    }
  }

  static fromJSON(obj: VrfPoolRowJSON): VrfPoolRow {
    return new VrfPoolRow({
      timestamp: new BN(obj.timestamp),
      pubkey: address(obj.pubkey),
    })
  }

  toEncodable() {
    return VrfPoolRow.toEncodable(this)
  }
}
