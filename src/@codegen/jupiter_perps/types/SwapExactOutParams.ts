import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SwapExactOutParamsFields {
  amountOut: BN
  maxAmountIn: BN
}

export interface SwapExactOutParamsJSON {
  amountOut: string
  maxAmountIn: string
}

export class SwapExactOutParams {
  readonly amountOut: BN
  readonly maxAmountIn: BN

  constructor(fields: SwapExactOutParamsFields) {
    this.amountOut = fields.amountOut
    this.maxAmountIn = fields.maxAmountIn
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("amountOut"), borsh.u64("maxAmountIn")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SwapExactOutParams({
      amountOut: obj.amountOut,
      maxAmountIn: obj.maxAmountIn,
    })
  }

  static toEncodable(fields: SwapExactOutParamsFields) {
    return {
      amountOut: fields.amountOut,
      maxAmountIn: fields.maxAmountIn,
    }
  }

  toJSON(): SwapExactOutParamsJSON {
    return {
      amountOut: this.amountOut.toString(),
      maxAmountIn: this.maxAmountIn.toString(),
    }
  }

  static fromJSON(obj: SwapExactOutParamsJSON): SwapExactOutParams {
    return new SwapExactOutParams({
      amountOut: new BN(obj.amountOut),
      maxAmountIn: new BN(obj.maxAmountIn),
    })
  }

  toEncodable() {
    return SwapExactOutParams.toEncodable(this)
  }
}
