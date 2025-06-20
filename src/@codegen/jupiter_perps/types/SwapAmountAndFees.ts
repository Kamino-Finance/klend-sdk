import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SwapAmountAndFeesFields {
  amountIn: BN
  amountOut: BN
  feeBps: BN
  feeToken: BN
}

export interface SwapAmountAndFeesJSON {
  amountIn: string
  amountOut: string
  feeBps: string
  feeToken: string
}

export class SwapAmountAndFees {
  readonly amountIn: BN
  readonly amountOut: BN
  readonly feeBps: BN
  readonly feeToken: BN

  constructor(fields: SwapAmountAndFeesFields) {
    this.amountIn = fields.amountIn
    this.amountOut = fields.amountOut
    this.feeBps = fields.feeBps
    this.feeToken = fields.feeToken
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("amountIn"),
        borsh.u64("amountOut"),
        borsh.u64("feeBps"),
        borsh.u64("feeToken"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SwapAmountAndFees({
      amountIn: obj.amountIn,
      amountOut: obj.amountOut,
      feeBps: obj.feeBps,
      feeToken: obj.feeToken,
    })
  }

  static toEncodable(fields: SwapAmountAndFeesFields) {
    return {
      amountIn: fields.amountIn,
      amountOut: fields.amountOut,
      feeBps: fields.feeBps,
      feeToken: fields.feeToken,
    }
  }

  toJSON(): SwapAmountAndFeesJSON {
    return {
      amountIn: this.amountIn.toString(),
      amountOut: this.amountOut.toString(),
      feeBps: this.feeBps.toString(),
      feeToken: this.feeToken.toString(),
    }
  }

  static fromJSON(obj: SwapAmountAndFeesJSON): SwapAmountAndFees {
    return new SwapAmountAndFees({
      amountIn: new BN(obj.amountIn),
      amountOut: new BN(obj.amountOut),
      feeBps: new BN(obj.feeBps),
      feeToken: new BN(obj.feeToken),
    })
  }

  toEncodable() {
    return SwapAmountAndFees.toEncodable(this)
  }
}
