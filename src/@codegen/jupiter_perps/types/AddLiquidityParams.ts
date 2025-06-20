import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface AddLiquidityParamsFields {
  tokenAmountIn: BN
  minLpAmountOut: BN
  tokenAmountPreSwap: BN | null
}

export interface AddLiquidityParamsJSON {
  tokenAmountIn: string
  minLpAmountOut: string
  tokenAmountPreSwap: string | null
}

export class AddLiquidityParams {
  readonly tokenAmountIn: BN
  readonly minLpAmountOut: BN
  readonly tokenAmountPreSwap: BN | null

  constructor(fields: AddLiquidityParamsFields) {
    this.tokenAmountIn = fields.tokenAmountIn
    this.minLpAmountOut = fields.minLpAmountOut
    this.tokenAmountPreSwap = fields.tokenAmountPreSwap
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("tokenAmountIn"),
        borsh.u64("minLpAmountOut"),
        borsh.option(borsh.u64(), "tokenAmountPreSwap"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new AddLiquidityParams({
      tokenAmountIn: obj.tokenAmountIn,
      minLpAmountOut: obj.minLpAmountOut,
      tokenAmountPreSwap: obj.tokenAmountPreSwap,
    })
  }

  static toEncodable(fields: AddLiquidityParamsFields) {
    return {
      tokenAmountIn: fields.tokenAmountIn,
      minLpAmountOut: fields.minLpAmountOut,
      tokenAmountPreSwap: fields.tokenAmountPreSwap,
    }
  }

  toJSON(): AddLiquidityParamsJSON {
    return {
      tokenAmountIn: this.tokenAmountIn.toString(),
      minLpAmountOut: this.minLpAmountOut.toString(),
      tokenAmountPreSwap:
        (this.tokenAmountPreSwap && this.tokenAmountPreSwap.toString()) || null,
    }
  }

  static fromJSON(obj: AddLiquidityParamsJSON): AddLiquidityParams {
    return new AddLiquidityParams({
      tokenAmountIn: new BN(obj.tokenAmountIn),
      minLpAmountOut: new BN(obj.minLpAmountOut),
      tokenAmountPreSwap:
        (obj.tokenAmountPreSwap && new BN(obj.tokenAmountPreSwap)) || null,
    })
  }

  toEncodable() {
    return AddLiquidityParams.toEncodable(this)
  }
}
