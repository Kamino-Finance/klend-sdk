import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface InitObligationArgsFields {
  tag: number
  id: number
}

export interface InitObligationArgsJSON {
  tag: number
  id: number
}

export class InitObligationArgs {
  readonly tag: number
  readonly id: number

  constructor(fields: InitObligationArgsFields) {
    this.tag = fields.tag
    this.id = fields.id
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u8("tag"), borsh.u8("id")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new InitObligationArgs({
      tag: obj.tag,
      id: obj.id,
    })
  }

  static toEncodable(fields: InitObligationArgsFields) {
    return {
      tag: fields.tag,
      id: fields.id,
    }
  }

  toJSON(): InitObligationArgsJSON {
    return {
      tag: this.tag,
      id: this.id,
    }
  }

  static fromJSON(obj: InitObligationArgsJSON): InitObligationArgs {
    return new InitObligationArgs({
      tag: obj.tag,
      id: obj.id,
    })
  }

  toEncodable() {
    return InitObligationArgs.toEncodable(this)
  }
}
