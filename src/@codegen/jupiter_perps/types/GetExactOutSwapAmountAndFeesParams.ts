import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetExactOutSwapAmountAndFeesParamsFields {
  amountOut: BN
}

export interface GetExactOutSwapAmountAndFeesParamsJSON {
  amountOut: string
}

export class GetExactOutSwapAmountAndFeesParams {
  readonly amountOut: BN

  constructor(fields: GetExactOutSwapAmountAndFeesParamsFields) {
    this.amountOut = fields.amountOut
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u64("amountOut")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetExactOutSwapAmountAndFeesParams({
      amountOut: obj.amountOut,
    })
  }

  static toEncodable(fields: GetExactOutSwapAmountAndFeesParamsFields) {
    return {
      amountOut: fields.amountOut,
    }
  }

  toJSON(): GetExactOutSwapAmountAndFeesParamsJSON {
    return {
      amountOut: this.amountOut.toString(),
    }
  }

  static fromJSON(
    obj: GetExactOutSwapAmountAndFeesParamsJSON
  ): GetExactOutSwapAmountAndFeesParams {
    return new GetExactOutSwapAmountAndFeesParams({
      amountOut: new BN(obj.amountOut),
    })
  }

  toEncodable() {
    return GetExactOutSwapAmountAndFeesParams.toEncodable(this)
  }
}
