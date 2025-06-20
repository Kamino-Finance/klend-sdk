import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface CrankRowFields {
  pubkey: Address
  nextTimestamp: BN
}

export interface CrankRowJSON {
  pubkey: string
  nextTimestamp: string
}

export class CrankRow {
  readonly pubkey: Address
  readonly nextTimestamp: BN

  constructor(fields: CrankRowFields) {
    this.pubkey = fields.pubkey
    this.nextTimestamp = fields.nextTimestamp
  }

  static layout(property?: string) {
    return borsh.struct(
      [borshAddress("pubkey"), borsh.i64("nextTimestamp")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new CrankRow({
      pubkey: obj.pubkey,
      nextTimestamp: obj.nextTimestamp,
    })
  }

  static toEncodable(fields: CrankRowFields) {
    return {
      pubkey: fields.pubkey,
      nextTimestamp: fields.nextTimestamp,
    }
  }

  toJSON(): CrankRowJSON {
    return {
      pubkey: this.pubkey,
      nextTimestamp: this.nextTimestamp.toString(),
    }
  }

  static fromJSON(obj: CrankRowJSON): CrankRow {
    return new CrankRow({
      pubkey: address(obj.pubkey),
      nextTimestamp: new BN(obj.nextTimestamp),
    })
  }

  toEncodable() {
    return CrankRow.toEncodable(this)
  }
}
