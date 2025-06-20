import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface MerklePriceUpdateFields {
  message: Uint8Array
  proof: Array<Array<number>>
}

export interface MerklePriceUpdateJSON {
  message: Array<number>
  proof: Array<Array<number>>
}

export class MerklePriceUpdate {
  readonly message: Uint8Array
  readonly proof: Array<Array<number>>

  constructor(fields: MerklePriceUpdateFields) {
    this.message = fields.message
    this.proof = fields.proof
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.vecU8("message"), borsh.vec(borsh.array(borsh.u8(), 20), "proof")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new MerklePriceUpdate({
      message: new Uint8Array(
        obj.message.buffer,
        obj.message.byteOffset,
        obj.message.length
      ),
      proof: obj.proof,
    })
  }

  static toEncodable(fields: MerklePriceUpdateFields) {
    return {
      message: Buffer.from(
        fields.message.buffer,
        fields.message.byteOffset,
        fields.message.length
      ),
      proof: fields.proof,
    }
  }

  toJSON(): MerklePriceUpdateJSON {
    return {
      message: Array.from(this.message.values()),
      proof: this.proof,
    }
  }

  static fromJSON(obj: MerklePriceUpdateJSON): MerklePriceUpdate {
    return new MerklePriceUpdate({
      message: Uint8Array.from(obj.message),
      proof: obj.proof,
    })
  }

  toEncodable() {
    return MerklePriceUpdate.toEncodable(this)
  }
}
