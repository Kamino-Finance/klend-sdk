import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface IncreasePositionInfoFields {
  price: BN
  liquidationPrice: BN
  feeUsd: BN
  collateralUsd: BN
}

export interface IncreasePositionInfoJSON {
  price: string
  liquidationPrice: string
  feeUsd: string
  collateralUsd: string
}

export class IncreasePositionInfo {
  readonly price: BN
  readonly liquidationPrice: BN
  readonly feeUsd: BN
  readonly collateralUsd: BN

  constructor(fields: IncreasePositionInfoFields) {
    this.price = fields.price
    this.liquidationPrice = fields.liquidationPrice
    this.feeUsd = fields.feeUsd
    this.collateralUsd = fields.collateralUsd
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("price"),
        borsh.u64("liquidationPrice"),
        borsh.u64("feeUsd"),
        borsh.u64("collateralUsd"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new IncreasePositionInfo({
      price: obj.price,
      liquidationPrice: obj.liquidationPrice,
      feeUsd: obj.feeUsd,
      collateralUsd: obj.collateralUsd,
    })
  }

  static toEncodable(fields: IncreasePositionInfoFields) {
    return {
      price: fields.price,
      liquidationPrice: fields.liquidationPrice,
      feeUsd: fields.feeUsd,
      collateralUsd: fields.collateralUsd,
    }
  }

  toJSON(): IncreasePositionInfoJSON {
    return {
      price: this.price.toString(),
      liquidationPrice: this.liquidationPrice.toString(),
      feeUsd: this.feeUsd.toString(),
      collateralUsd: this.collateralUsd.toString(),
    }
  }

  static fromJSON(obj: IncreasePositionInfoJSON): IncreasePositionInfo {
    return new IncreasePositionInfo({
      price: new BN(obj.price),
      liquidationPrice: new BN(obj.liquidationPrice),
      feeUsd: new BN(obj.feeUsd),
      collateralUsd: new BN(obj.collateralUsd),
    })
  }

  toEncodable() {
    return IncreasePositionInfo.toEncodable(this)
  }
}
