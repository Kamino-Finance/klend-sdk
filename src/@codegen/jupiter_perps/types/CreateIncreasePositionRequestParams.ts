import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface CreateIncreasePositionRequestParamsFields {
  sizeUsdDelta: BN
  collateralTokenDelta: BN
  side: types.SideKind
  requestType: types.RequestTypeKind
  priceSlippage: BN | null
  jupiterMinimumOut: BN | null
  triggerPrice: BN | null
  triggerAboveThreshold: boolean | null
  counter: BN
}

export interface CreateIncreasePositionRequestParamsJSON {
  sizeUsdDelta: string
  collateralTokenDelta: string
  side: types.SideJSON
  requestType: types.RequestTypeJSON
  priceSlippage: string | null
  jupiterMinimumOut: string | null
  triggerPrice: string | null
  triggerAboveThreshold: boolean | null
  counter: string
}

export class CreateIncreasePositionRequestParams {
  readonly sizeUsdDelta: BN
  readonly collateralTokenDelta: BN
  readonly side: types.SideKind
  readonly requestType: types.RequestTypeKind
  readonly priceSlippage: BN | null
  readonly jupiterMinimumOut: BN | null
  readonly triggerPrice: BN | null
  readonly triggerAboveThreshold: boolean | null
  readonly counter: BN

  constructor(fields: CreateIncreasePositionRequestParamsFields) {
    this.sizeUsdDelta = fields.sizeUsdDelta
    this.collateralTokenDelta = fields.collateralTokenDelta
    this.side = fields.side
    this.requestType = fields.requestType
    this.priceSlippage = fields.priceSlippage
    this.jupiterMinimumOut = fields.jupiterMinimumOut
    this.triggerPrice = fields.triggerPrice
    this.triggerAboveThreshold = fields.triggerAboveThreshold
    this.counter = fields.counter
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("sizeUsdDelta"),
        borsh.u64("collateralTokenDelta"),
        types.Side.layout("side"),
        types.RequestType.layout("requestType"),
        borsh.option(borsh.u64(), "priceSlippage"),
        borsh.option(borsh.u64(), "jupiterMinimumOut"),
        borsh.option(borsh.u64(), "triggerPrice"),
        borsh.option(borsh.bool(), "triggerAboveThreshold"),
        borsh.u64("counter"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new CreateIncreasePositionRequestParams({
      sizeUsdDelta: obj.sizeUsdDelta,
      collateralTokenDelta: obj.collateralTokenDelta,
      side: types.Side.fromDecoded(obj.side),
      requestType: types.RequestType.fromDecoded(obj.requestType),
      priceSlippage: obj.priceSlippage,
      jupiterMinimumOut: obj.jupiterMinimumOut,
      triggerPrice: obj.triggerPrice,
      triggerAboveThreshold: obj.triggerAboveThreshold,
      counter: obj.counter,
    })
  }

  static toEncodable(fields: CreateIncreasePositionRequestParamsFields) {
    return {
      sizeUsdDelta: fields.sizeUsdDelta,
      collateralTokenDelta: fields.collateralTokenDelta,
      side: fields.side.toEncodable(),
      requestType: fields.requestType.toEncodable(),
      priceSlippage: fields.priceSlippage,
      jupiterMinimumOut: fields.jupiterMinimumOut,
      triggerPrice: fields.triggerPrice,
      triggerAboveThreshold: fields.triggerAboveThreshold,
      counter: fields.counter,
    }
  }

  toJSON(): CreateIncreasePositionRequestParamsJSON {
    return {
      sizeUsdDelta: this.sizeUsdDelta.toString(),
      collateralTokenDelta: this.collateralTokenDelta.toString(),
      side: this.side.toJSON(),
      requestType: this.requestType.toJSON(),
      priceSlippage:
        (this.priceSlippage && this.priceSlippage.toString()) || null,
      jupiterMinimumOut:
        (this.jupiterMinimumOut && this.jupiterMinimumOut.toString()) || null,
      triggerPrice: (this.triggerPrice && this.triggerPrice.toString()) || null,
      triggerAboveThreshold: this.triggerAboveThreshold,
      counter: this.counter.toString(),
    }
  }

  static fromJSON(
    obj: CreateIncreasePositionRequestParamsJSON
  ): CreateIncreasePositionRequestParams {
    return new CreateIncreasePositionRequestParams({
      sizeUsdDelta: new BN(obj.sizeUsdDelta),
      collateralTokenDelta: new BN(obj.collateralTokenDelta),
      side: types.Side.fromJSON(obj.side),
      requestType: types.RequestType.fromJSON(obj.requestType),
      priceSlippage: (obj.priceSlippage && new BN(obj.priceSlippage)) || null,
      jupiterMinimumOut:
        (obj.jupiterMinimumOut && new BN(obj.jupiterMinimumOut)) || null,
      triggerPrice: (obj.triggerPrice && new BN(obj.triggerPrice)) || null,
      triggerAboveThreshold: obj.triggerAboveThreshold,
      counter: new BN(obj.counter),
    })
  }

  toEncodable() {
    return CreateIncreasePositionRequestParams.toEncodable(this)
  }
}
