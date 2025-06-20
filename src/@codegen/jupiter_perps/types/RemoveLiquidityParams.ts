import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface RemoveLiquidityParamsFields {
  lpAmountIn: BN
  minAmountOut: BN
}

export interface RemoveLiquidityParamsJSON {
  lpAmountIn: string
  minAmountOut: string
}

export class RemoveLiquidityParams {
  readonly lpAmountIn: BN
  readonly minAmountOut: BN

  constructor(fields: RemoveLiquidityParamsFields) {
    this.lpAmountIn = fields.lpAmountIn
    this.minAmountOut = fields.minAmountOut
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("lpAmountIn"), borsh.u64("minAmountOut")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new RemoveLiquidityParams({
      lpAmountIn: obj.lpAmountIn,
      minAmountOut: obj.minAmountOut,
    })
  }

  static toEncodable(fields: RemoveLiquidityParamsFields) {
    return {
      lpAmountIn: fields.lpAmountIn,
      minAmountOut: fields.minAmountOut,
    }
  }

  toJSON(): RemoveLiquidityParamsJSON {
    return {
      lpAmountIn: this.lpAmountIn.toString(),
      minAmountOut: this.minAmountOut.toString(),
    }
  }

  static fromJSON(obj: RemoveLiquidityParamsJSON): RemoveLiquidityParams {
    return new RemoveLiquidityParams({
      lpAmountIn: new BN(obj.lpAmountIn),
      minAmountOut: new BN(obj.minAmountOut),
    })
  }

  toEncodable() {
    return RemoveLiquidityParams.toEncodable(this)
  }
}
