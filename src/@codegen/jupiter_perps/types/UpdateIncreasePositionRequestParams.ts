import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface UpdateIncreasePositionRequestParamsFields {
  sizeUsdDelta: BN
  triggerPrice: BN
}

export interface UpdateIncreasePositionRequestParamsJSON {
  sizeUsdDelta: string
  triggerPrice: string
}

export class UpdateIncreasePositionRequestParams {
  readonly sizeUsdDelta: BN
  readonly triggerPrice: BN

  constructor(fields: UpdateIncreasePositionRequestParamsFields) {
    this.sizeUsdDelta = fields.sizeUsdDelta
    this.triggerPrice = fields.triggerPrice
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("sizeUsdDelta"), borsh.u64("triggerPrice")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new UpdateIncreasePositionRequestParams({
      sizeUsdDelta: obj.sizeUsdDelta,
      triggerPrice: obj.triggerPrice,
    })
  }

  static toEncodable(fields: UpdateIncreasePositionRequestParamsFields) {
    return {
      sizeUsdDelta: fields.sizeUsdDelta,
      triggerPrice: fields.triggerPrice,
    }
  }

  toJSON(): UpdateIncreasePositionRequestParamsJSON {
    return {
      sizeUsdDelta: this.sizeUsdDelta.toString(),
      triggerPrice: this.triggerPrice.toString(),
    }
  }

  static fromJSON(
    obj: UpdateIncreasePositionRequestParamsJSON
  ): UpdateIncreasePositionRequestParams {
    return new UpdateIncreasePositionRequestParams({
      sizeUsdDelta: new BN(obj.sizeUsdDelta),
      triggerPrice: new BN(obj.triggerPrice),
    })
  }

  toEncodable() {
    return UpdateIncreasePositionRequestParams.toEncodable(this)
  }
}
