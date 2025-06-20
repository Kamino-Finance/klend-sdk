import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface UpdateDecreasePositionRequestParamsFields {
  sizeUsdDelta: BN
  triggerPrice: BN
}

export interface UpdateDecreasePositionRequestParamsJSON {
  sizeUsdDelta: string
  triggerPrice: string
}

export class UpdateDecreasePositionRequestParams {
  readonly sizeUsdDelta: BN
  readonly triggerPrice: BN

  constructor(fields: UpdateDecreasePositionRequestParamsFields) {
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
    return new UpdateDecreasePositionRequestParams({
      sizeUsdDelta: obj.sizeUsdDelta,
      triggerPrice: obj.triggerPrice,
    })
  }

  static toEncodable(fields: UpdateDecreasePositionRequestParamsFields) {
    return {
      sizeUsdDelta: fields.sizeUsdDelta,
      triggerPrice: fields.triggerPrice,
    }
  }

  toJSON(): UpdateDecreasePositionRequestParamsJSON {
    return {
      sizeUsdDelta: this.sizeUsdDelta.toString(),
      triggerPrice: this.triggerPrice.toString(),
    }
  }

  static fromJSON(
    obj: UpdateDecreasePositionRequestParamsJSON
  ): UpdateDecreasePositionRequestParams {
    return new UpdateDecreasePositionRequestParams({
      sizeUsdDelta: new BN(obj.sizeUsdDelta),
      triggerPrice: new BN(obj.triggerPrice),
    })
  }

  toEncodable() {
    return UpdateDecreasePositionRequestParams.toEncodable(this)
  }
}
