import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SwapParamsFields {
  amountIn: BN
  minAmountOut: BN
}

export interface SwapParamsJSON {
  amountIn: string
  minAmountOut: string
}

export class SwapParams {
  readonly amountIn: BN
  readonly minAmountOut: BN

  constructor(fields: SwapParamsFields) {
    this.amountIn = fields.amountIn
    this.minAmountOut = fields.minAmountOut
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("amountIn"), borsh.u64("minAmountOut")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SwapParams({
      amountIn: obj.amountIn,
      minAmountOut: obj.minAmountOut,
    })
  }

  static toEncodable(fields: SwapParamsFields) {
    return {
      amountIn: fields.amountIn,
      minAmountOut: fields.minAmountOut,
    }
  }

  toJSON(): SwapParamsJSON {
    return {
      amountIn: this.amountIn.toString(),
      minAmountOut: this.minAmountOut.toString(),
    }
  }

  static fromJSON(obj: SwapParamsJSON): SwapParams {
    return new SwapParams({
      amountIn: new BN(obj.amountIn),
      minAmountOut: new BN(obj.minAmountOut),
    })
  }

  toEncodable() {
    return SwapParams.toEncodable(this)
  }
}
