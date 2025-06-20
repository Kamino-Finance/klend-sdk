import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PostTwapUpdateParamsFields {
  startMerklePriceUpdate: types.MerklePriceUpdateFields
  endMerklePriceUpdate: types.MerklePriceUpdateFields
  treasuryId: number
}

export interface PostTwapUpdateParamsJSON {
  startMerklePriceUpdate: types.MerklePriceUpdateJSON
  endMerklePriceUpdate: types.MerklePriceUpdateJSON
  treasuryId: number
}

export class PostTwapUpdateParams {
  readonly startMerklePriceUpdate: types.MerklePriceUpdate
  readonly endMerklePriceUpdate: types.MerklePriceUpdate
  readonly treasuryId: number

  constructor(fields: PostTwapUpdateParamsFields) {
    this.startMerklePriceUpdate = new types.MerklePriceUpdate({
      ...fields.startMerklePriceUpdate,
    })
    this.endMerklePriceUpdate = new types.MerklePriceUpdate({
      ...fields.endMerklePriceUpdate,
    })
    this.treasuryId = fields.treasuryId
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        types.MerklePriceUpdate.layout("startMerklePriceUpdate"),
        types.MerklePriceUpdate.layout("endMerklePriceUpdate"),
        borsh.u8("treasuryId"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PostTwapUpdateParams({
      startMerklePriceUpdate: types.MerklePriceUpdate.fromDecoded(
        obj.startMerklePriceUpdate
      ),
      endMerklePriceUpdate: types.MerklePriceUpdate.fromDecoded(
        obj.endMerklePriceUpdate
      ),
      treasuryId: obj.treasuryId,
    })
  }

  static toEncodable(fields: PostTwapUpdateParamsFields) {
    return {
      startMerklePriceUpdate: types.MerklePriceUpdate.toEncodable(
        fields.startMerklePriceUpdate
      ),
      endMerklePriceUpdate: types.MerklePriceUpdate.toEncodable(
        fields.endMerklePriceUpdate
      ),
      treasuryId: fields.treasuryId,
    }
  }

  toJSON(): PostTwapUpdateParamsJSON {
    return {
      startMerklePriceUpdate: this.startMerklePriceUpdate.toJSON(),
      endMerklePriceUpdate: this.endMerklePriceUpdate.toJSON(),
      treasuryId: this.treasuryId,
    }
  }

  static fromJSON(obj: PostTwapUpdateParamsJSON): PostTwapUpdateParams {
    return new PostTwapUpdateParams({
      startMerklePriceUpdate: types.MerklePriceUpdate.fromJSON(
        obj.startMerklePriceUpdate
      ),
      endMerklePriceUpdate: types.MerklePriceUpdate.fromJSON(
        obj.endMerklePriceUpdate
      ),
      treasuryId: obj.treasuryId,
    })
  }

  toEncodable() {
    return PostTwapUpdateParams.toEncodable(this)
  }
}
