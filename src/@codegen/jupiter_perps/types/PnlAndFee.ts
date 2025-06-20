import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PnlAndFeeFields {
  hasProfit: boolean
  pnlDelta: BN
  openPositionFeeUsd: BN
  closePositionFeeUsd: BN
  fundingFeeUsd: BN
  liquidationPrice: BN
}

export interface PnlAndFeeJSON {
  hasProfit: boolean
  pnlDelta: string
  openPositionFeeUsd: string
  closePositionFeeUsd: string
  fundingFeeUsd: string
  liquidationPrice: string
}

export class PnlAndFee {
  readonly hasProfit: boolean
  readonly pnlDelta: BN
  readonly openPositionFeeUsd: BN
  readonly closePositionFeeUsd: BN
  readonly fundingFeeUsd: BN
  readonly liquidationPrice: BN

  constructor(fields: PnlAndFeeFields) {
    this.hasProfit = fields.hasProfit
    this.pnlDelta = fields.pnlDelta
    this.openPositionFeeUsd = fields.openPositionFeeUsd
    this.closePositionFeeUsd = fields.closePositionFeeUsd
    this.fundingFeeUsd = fields.fundingFeeUsd
    this.liquidationPrice = fields.liquidationPrice
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.bool("hasProfit"),
        borsh.u64("pnlDelta"),
        borsh.u64("openPositionFeeUsd"),
        borsh.u64("closePositionFeeUsd"),
        borsh.u64("fundingFeeUsd"),
        borsh.u64("liquidationPrice"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PnlAndFee({
      hasProfit: obj.hasProfit,
      pnlDelta: obj.pnlDelta,
      openPositionFeeUsd: obj.openPositionFeeUsd,
      closePositionFeeUsd: obj.closePositionFeeUsd,
      fundingFeeUsd: obj.fundingFeeUsd,
      liquidationPrice: obj.liquidationPrice,
    })
  }

  static toEncodable(fields: PnlAndFeeFields) {
    return {
      hasProfit: fields.hasProfit,
      pnlDelta: fields.pnlDelta,
      openPositionFeeUsd: fields.openPositionFeeUsd,
      closePositionFeeUsd: fields.closePositionFeeUsd,
      fundingFeeUsd: fields.fundingFeeUsd,
      liquidationPrice: fields.liquidationPrice,
    }
  }

  toJSON(): PnlAndFeeJSON {
    return {
      hasProfit: this.hasProfit,
      pnlDelta: this.pnlDelta.toString(),
      openPositionFeeUsd: this.openPositionFeeUsd.toString(),
      closePositionFeeUsd: this.closePositionFeeUsd.toString(),
      fundingFeeUsd: this.fundingFeeUsd.toString(),
      liquidationPrice: this.liquidationPrice.toString(),
    }
  }

  static fromJSON(obj: PnlAndFeeJSON): PnlAndFee {
    return new PnlAndFee({
      hasProfit: obj.hasProfit,
      pnlDelta: new BN(obj.pnlDelta),
      openPositionFeeUsd: new BN(obj.openPositionFeeUsd),
      closePositionFeeUsd: new BN(obj.closePositionFeeUsd),
      fundingFeeUsd: new BN(obj.fundingFeeUsd),
      liquidationPrice: new BN(obj.liquidationPrice),
    })
  }

  toEncodable() {
    return PnlAndFee.toEncodable(this)
  }
}
