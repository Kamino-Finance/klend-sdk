import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetSwapAmountAndFeesParamsFields {
  amountIn: BN
}

export interface GetSwapAmountAndFeesParamsJSON {
  amountIn: string
}

export class GetSwapAmountAndFeesParams {
  readonly amountIn: BN

  constructor(fields: GetSwapAmountAndFeesParamsFields) {
    this.amountIn = fields.amountIn
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u64("amountIn")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetSwapAmountAndFeesParams({
      amountIn: obj.amountIn,
    })
  }

  static toEncodable(fields: GetSwapAmountAndFeesParamsFields) {
    return {
      amountIn: fields.amountIn,
    }
  }

  toJSON(): GetSwapAmountAndFeesParamsJSON {
    return {
      amountIn: this.amountIn.toString(),
    }
  }

  static fromJSON(
    obj: GetSwapAmountAndFeesParamsJSON
  ): GetSwapAmountAndFeesParams {
    return new GetSwapAmountAndFeesParams({
      amountIn: new BN(obj.amountIn),
    })
  }

  toEncodable() {
    return GetSwapAmountAndFeesParams.toEncodable(this)
  }
}
