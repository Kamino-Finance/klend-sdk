import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface CreateDecreasePositionRequestParamsFields {
  collateralUsdDelta: BN
  sizeUsdDelta: BN
  requestType: types.RequestTypeKind
  priceSlippage: BN | null
  jupiterMinimumOut: BN | null
  triggerPrice: BN | null
  triggerAboveThreshold: boolean | null
  entirePosition: boolean | null
  counter: BN
}

export interface CreateDecreasePositionRequestParamsJSON {
  collateralUsdDelta: string
  sizeUsdDelta: string
  requestType: types.RequestTypeJSON
  priceSlippage: string | null
  jupiterMinimumOut: string | null
  triggerPrice: string | null
  triggerAboveThreshold: boolean | null
  entirePosition: boolean | null
  counter: string
}

export class CreateDecreasePositionRequestParams {
  readonly collateralUsdDelta: BN
  readonly sizeUsdDelta: BN
  readonly requestType: types.RequestTypeKind
  readonly priceSlippage: BN | null
  readonly jupiterMinimumOut: BN | null
  readonly triggerPrice: BN | null
  readonly triggerAboveThreshold: boolean | null
  readonly entirePosition: boolean | null
  readonly counter: BN

  constructor(fields: CreateDecreasePositionRequestParamsFields) {
    this.collateralUsdDelta = fields.collateralUsdDelta
    this.sizeUsdDelta = fields.sizeUsdDelta
    this.requestType = fields.requestType
    this.priceSlippage = fields.priceSlippage
    this.jupiterMinimumOut = fields.jupiterMinimumOut
    this.triggerPrice = fields.triggerPrice
    this.triggerAboveThreshold = fields.triggerAboveThreshold
    this.entirePosition = fields.entirePosition
    this.counter = fields.counter
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("collateralUsdDelta"),
        borsh.u64("sizeUsdDelta"),
        types.RequestType.layout("requestType"),
        borsh.option(borsh.u64(), "priceSlippage"),
        borsh.option(borsh.u64(), "jupiterMinimumOut"),
        borsh.option(borsh.u64(), "triggerPrice"),
        borsh.option(borsh.bool(), "triggerAboveThreshold"),
        borsh.option(borsh.bool(), "entirePosition"),
        borsh.u64("counter"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new CreateDecreasePositionRequestParams({
      collateralUsdDelta: obj.collateralUsdDelta,
      sizeUsdDelta: obj.sizeUsdDelta,
      requestType: types.RequestType.fromDecoded(obj.requestType),
      priceSlippage: obj.priceSlippage,
      jupiterMinimumOut: obj.jupiterMinimumOut,
      triggerPrice: obj.triggerPrice,
      triggerAboveThreshold: obj.triggerAboveThreshold,
      entirePosition: obj.entirePosition,
      counter: obj.counter,
    })
  }

  static toEncodable(fields: CreateDecreasePositionRequestParamsFields) {
    return {
      collateralUsdDelta: fields.collateralUsdDelta,
      sizeUsdDelta: fields.sizeUsdDelta,
      requestType: fields.requestType.toEncodable(),
      priceSlippage: fields.priceSlippage,
      jupiterMinimumOut: fields.jupiterMinimumOut,
      triggerPrice: fields.triggerPrice,
      triggerAboveThreshold: fields.triggerAboveThreshold,
      entirePosition: fields.entirePosition,
      counter: fields.counter,
    }
  }

  toJSON(): CreateDecreasePositionRequestParamsJSON {
    return {
      collateralUsdDelta: this.collateralUsdDelta.toString(),
      sizeUsdDelta: this.sizeUsdDelta.toString(),
      requestType: this.requestType.toJSON(),
      priceSlippage:
        (this.priceSlippage && this.priceSlippage.toString()) || null,
      jupiterMinimumOut:
        (this.jupiterMinimumOut && this.jupiterMinimumOut.toString()) || null,
      triggerPrice: (this.triggerPrice && this.triggerPrice.toString()) || null,
      triggerAboveThreshold: this.triggerAboveThreshold,
      entirePosition: this.entirePosition,
      counter: this.counter.toString(),
    }
  }

  static fromJSON(
    obj: CreateDecreasePositionRequestParamsJSON
  ): CreateDecreasePositionRequestParams {
    return new CreateDecreasePositionRequestParams({
      collateralUsdDelta: new BN(obj.collateralUsdDelta),
      sizeUsdDelta: new BN(obj.sizeUsdDelta),
      requestType: types.RequestType.fromJSON(obj.requestType),
      priceSlippage: (obj.priceSlippage && new BN(obj.priceSlippage)) || null,
      jupiterMinimumOut:
        (obj.jupiterMinimumOut && new BN(obj.jupiterMinimumOut)) || null,
      triggerPrice: (obj.triggerPrice && new BN(obj.triggerPrice)) || null,
      triggerAboveThreshold: obj.triggerAboveThreshold,
      entirePosition: obj.entirePosition,
      counter: new BN(obj.counter),
    })
  }

  toEncodable() {
    return CreateDecreasePositionRequestParams.toEncodable(this)
  }
}
