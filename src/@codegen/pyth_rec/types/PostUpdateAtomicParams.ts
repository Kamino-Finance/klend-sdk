import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PostUpdateAtomicParamsFields {
  vaa: Uint8Array
  merklePriceUpdate: types.MerklePriceUpdateFields
  treasuryId: number
}

export interface PostUpdateAtomicParamsJSON {
  vaa: Array<number>
  merklePriceUpdate: types.MerklePriceUpdateJSON
  treasuryId: number
}

export class PostUpdateAtomicParams {
  readonly vaa: Uint8Array
  readonly merklePriceUpdate: types.MerklePriceUpdate
  readonly treasuryId: number

  constructor(fields: PostUpdateAtomicParamsFields) {
    this.vaa = fields.vaa
    this.merklePriceUpdate = new types.MerklePriceUpdate({
      ...fields.merklePriceUpdate,
    })
    this.treasuryId = fields.treasuryId
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.vecU8("vaa"),
        types.MerklePriceUpdate.layout("merklePriceUpdate"),
        borsh.u8("treasuryId"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PostUpdateAtomicParams({
      vaa: new Uint8Array(obj.vaa.buffer, obj.vaa.byteOffset, obj.vaa.length),
      merklePriceUpdate: types.MerklePriceUpdate.fromDecoded(
        obj.merklePriceUpdate
      ),
      treasuryId: obj.treasuryId,
    })
  }

  static toEncodable(fields: PostUpdateAtomicParamsFields) {
    return {
      vaa: Buffer.from(
        fields.vaa.buffer,
        fields.vaa.byteOffset,
        fields.vaa.length
      ),
      merklePriceUpdate: types.MerklePriceUpdate.toEncodable(
        fields.merklePriceUpdate
      ),
      treasuryId: fields.treasuryId,
    }
  }

  toJSON(): PostUpdateAtomicParamsJSON {
    return {
      vaa: Array.from(this.vaa.values()),
      merklePriceUpdate: this.merklePriceUpdate.toJSON(),
      treasuryId: this.treasuryId,
    }
  }

  static fromJSON(obj: PostUpdateAtomicParamsJSON): PostUpdateAtomicParams {
    return new PostUpdateAtomicParams({
      vaa: Uint8Array.from(obj.vaa),
      merklePriceUpdate: types.MerklePriceUpdate.fromJSON(
        obj.merklePriceUpdate
      ),
      treasuryId: obj.treasuryId,
    })
  }

  toEncodable() {
    return PostUpdateAtomicParams.toEncodable(this)
  }
}
