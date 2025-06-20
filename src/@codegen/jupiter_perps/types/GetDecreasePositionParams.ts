import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetDecreasePositionParamsFields {
  collateralUsdDelta: BN
  sizeUsdDelta: BN
}

export interface GetDecreasePositionParamsJSON {
  collateralUsdDelta: string
  sizeUsdDelta: string
}

export class GetDecreasePositionParams {
  readonly collateralUsdDelta: BN
  readonly sizeUsdDelta: BN

  constructor(fields: GetDecreasePositionParamsFields) {
    this.collateralUsdDelta = fields.collateralUsdDelta
    this.sizeUsdDelta = fields.sizeUsdDelta
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("collateralUsdDelta"), borsh.u64("sizeUsdDelta")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetDecreasePositionParams({
      collateralUsdDelta: obj.collateralUsdDelta,
      sizeUsdDelta: obj.sizeUsdDelta,
    })
  }

  static toEncodable(fields: GetDecreasePositionParamsFields) {
    return {
      collateralUsdDelta: fields.collateralUsdDelta,
      sizeUsdDelta: fields.sizeUsdDelta,
    }
  }

  toJSON(): GetDecreasePositionParamsJSON {
    return {
      collateralUsdDelta: this.collateralUsdDelta.toString(),
      sizeUsdDelta: this.sizeUsdDelta.toString(),
    }
  }

  static fromJSON(
    obj: GetDecreasePositionParamsJSON
  ): GetDecreasePositionParams {
    return new GetDecreasePositionParams({
      collateralUsdDelta: new BN(obj.collateralUsdDelta),
      sizeUsdDelta: new BN(obj.sizeUsdDelta),
    })
  }

  toEncodable() {
    return GetDecreasePositionParams.toEncodable(this)
  }
}
