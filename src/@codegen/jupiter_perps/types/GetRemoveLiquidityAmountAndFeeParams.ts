import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetRemoveLiquidityAmountAndFeeParamsFields {
  lpAmountIn: BN
}

export interface GetRemoveLiquidityAmountAndFeeParamsJSON {
  lpAmountIn: string
}

export class GetRemoveLiquidityAmountAndFeeParams {
  readonly lpAmountIn: BN

  constructor(fields: GetRemoveLiquidityAmountAndFeeParamsFields) {
    this.lpAmountIn = fields.lpAmountIn
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u64("lpAmountIn")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetRemoveLiquidityAmountAndFeeParams({
      lpAmountIn: obj.lpAmountIn,
    })
  }

  static toEncodable(fields: GetRemoveLiquidityAmountAndFeeParamsFields) {
    return {
      lpAmountIn: fields.lpAmountIn,
    }
  }

  toJSON(): GetRemoveLiquidityAmountAndFeeParamsJSON {
    return {
      lpAmountIn: this.lpAmountIn.toString(),
    }
  }

  static fromJSON(
    obj: GetRemoveLiquidityAmountAndFeeParamsJSON
  ): GetRemoveLiquidityAmountAndFeeParams {
    return new GetRemoveLiquidityAmountAndFeeParams({
      lpAmountIn: new BN(obj.lpAmountIn),
    })
  }

  toEncodable() {
    return GetRemoveLiquidityAmountAndFeeParams.toEncodable(this)
  }
}
