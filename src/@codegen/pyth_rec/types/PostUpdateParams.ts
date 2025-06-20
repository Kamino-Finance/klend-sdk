import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PostUpdateParamsFields {
  merklePriceUpdate: types.MerklePriceUpdateFields
  treasuryId: number
}

export interface PostUpdateParamsJSON {
  merklePriceUpdate: types.MerklePriceUpdateJSON
  treasuryId: number
}

export class PostUpdateParams {
  readonly merklePriceUpdate: types.MerklePriceUpdate
  readonly treasuryId: number

  constructor(fields: PostUpdateParamsFields) {
    this.merklePriceUpdate = new types.MerklePriceUpdate({
      ...fields.merklePriceUpdate,
    })
    this.treasuryId = fields.treasuryId
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        types.MerklePriceUpdate.layout("merklePriceUpdate"),
        borsh.u8("treasuryId"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PostUpdateParams({
      merklePriceUpdate: types.MerklePriceUpdate.fromDecoded(
        obj.merklePriceUpdate
      ),
      treasuryId: obj.treasuryId,
    })
  }

  static toEncodable(fields: PostUpdateParamsFields) {
    return {
      merklePriceUpdate: types.MerklePriceUpdate.toEncodable(
        fields.merklePriceUpdate
      ),
      treasuryId: fields.treasuryId,
    }
  }

  toJSON(): PostUpdateParamsJSON {
    return {
      merklePriceUpdate: this.merklePriceUpdate.toJSON(),
      treasuryId: this.treasuryId,
    }
  }

  static fromJSON(obj: PostUpdateParamsJSON): PostUpdateParams {
    return new PostUpdateParams({
      merklePriceUpdate: types.MerklePriceUpdate.fromJSON(
        obj.merklePriceUpdate
      ),
      treasuryId: obj.treasuryId,
    })
  }

  toEncodable() {
    return PostUpdateParams.toEncodable(this)
  }
}
