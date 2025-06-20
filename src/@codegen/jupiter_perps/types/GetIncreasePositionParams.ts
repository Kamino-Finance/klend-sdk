import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetIncreasePositionParamsFields {
  collateralTokenDelta: BN
  sizeUsdDelta: BN
  side: types.SideKind
}

export interface GetIncreasePositionParamsJSON {
  collateralTokenDelta: string
  sizeUsdDelta: string
  side: types.SideJSON
}

export class GetIncreasePositionParams {
  readonly collateralTokenDelta: BN
  readonly sizeUsdDelta: BN
  readonly side: types.SideKind

  constructor(fields: GetIncreasePositionParamsFields) {
    this.collateralTokenDelta = fields.collateralTokenDelta
    this.sizeUsdDelta = fields.sizeUsdDelta
    this.side = fields.side
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("collateralTokenDelta"),
        borsh.u64("sizeUsdDelta"),
        types.Side.layout("side"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetIncreasePositionParams({
      collateralTokenDelta: obj.collateralTokenDelta,
      sizeUsdDelta: obj.sizeUsdDelta,
      side: types.Side.fromDecoded(obj.side),
    })
  }

  static toEncodable(fields: GetIncreasePositionParamsFields) {
    return {
      collateralTokenDelta: fields.collateralTokenDelta,
      sizeUsdDelta: fields.sizeUsdDelta,
      side: fields.side.toEncodable(),
    }
  }

  toJSON(): GetIncreasePositionParamsJSON {
    return {
      collateralTokenDelta: this.collateralTokenDelta.toString(),
      sizeUsdDelta: this.sizeUsdDelta.toString(),
      side: this.side.toJSON(),
    }
  }

  static fromJSON(
    obj: GetIncreasePositionParamsJSON
  ): GetIncreasePositionParams {
    return new GetIncreasePositionParams({
      collateralTokenDelta: new BN(obj.collateralTokenDelta),
      sizeUsdDelta: new BN(obj.sizeUsdDelta),
      side: types.Side.fromJSON(obj.side),
    })
  }

  toEncodable() {
    return GetIncreasePositionParams.toEncodable(this)
  }
}
