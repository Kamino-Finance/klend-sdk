import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface DecreasePositionInfoFields {
  price: BN
  liquidationPrice: BN
  feeUsd: BN
  collateralUsd: BN
  hasProfit: boolean
  pnlDelta: BN
  transferAmountUsd: BN
  transferToken: BN
}

export interface DecreasePositionInfoJSON {
  price: string
  liquidationPrice: string
  feeUsd: string
  collateralUsd: string
  hasProfit: boolean
  pnlDelta: string
  transferAmountUsd: string
  transferToken: string
}

export class DecreasePositionInfo {
  readonly price: BN
  readonly liquidationPrice: BN
  readonly feeUsd: BN
  readonly collateralUsd: BN
  readonly hasProfit: boolean
  readonly pnlDelta: BN
  readonly transferAmountUsd: BN
  readonly transferToken: BN

  constructor(fields: DecreasePositionInfoFields) {
    this.price = fields.price
    this.liquidationPrice = fields.liquidationPrice
    this.feeUsd = fields.feeUsd
    this.collateralUsd = fields.collateralUsd
    this.hasProfit = fields.hasProfit
    this.pnlDelta = fields.pnlDelta
    this.transferAmountUsd = fields.transferAmountUsd
    this.transferToken = fields.transferToken
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("price"),
        borsh.u64("liquidationPrice"),
        borsh.u64("feeUsd"),
        borsh.u64("collateralUsd"),
        borsh.bool("hasProfit"),
        borsh.u64("pnlDelta"),
        borsh.u64("transferAmountUsd"),
        borsh.u64("transferToken"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new DecreasePositionInfo({
      price: obj.price,
      liquidationPrice: obj.liquidationPrice,
      feeUsd: obj.feeUsd,
      collateralUsd: obj.collateralUsd,
      hasProfit: obj.hasProfit,
      pnlDelta: obj.pnlDelta,
      transferAmountUsd: obj.transferAmountUsd,
      transferToken: obj.transferToken,
    })
  }

  static toEncodable(fields: DecreasePositionInfoFields) {
    return {
      price: fields.price,
      liquidationPrice: fields.liquidationPrice,
      feeUsd: fields.feeUsd,
      collateralUsd: fields.collateralUsd,
      hasProfit: fields.hasProfit,
      pnlDelta: fields.pnlDelta,
      transferAmountUsd: fields.transferAmountUsd,
      transferToken: fields.transferToken,
    }
  }

  toJSON(): DecreasePositionInfoJSON {
    return {
      price: this.price.toString(),
      liquidationPrice: this.liquidationPrice.toString(),
      feeUsd: this.feeUsd.toString(),
      collateralUsd: this.collateralUsd.toString(),
      hasProfit: this.hasProfit,
      pnlDelta: this.pnlDelta.toString(),
      transferAmountUsd: this.transferAmountUsd.toString(),
      transferToken: this.transferToken.toString(),
    }
  }

  static fromJSON(obj: DecreasePositionInfoJSON): DecreasePositionInfo {
    return new DecreasePositionInfo({
      price: new BN(obj.price),
      liquidationPrice: new BN(obj.liquidationPrice),
      feeUsd: new BN(obj.feeUsd),
      collateralUsd: new BN(obj.collateralUsd),
      hasProfit: obj.hasProfit,
      pnlDelta: new BN(obj.pnlDelta),
      transferAmountUsd: new BN(obj.transferAmountUsd),
      transferToken: new BN(obj.transferToken),
    })
  }

  toEncodable() {
    return DecreasePositionInfo.toEncodable(this)
  }
}
