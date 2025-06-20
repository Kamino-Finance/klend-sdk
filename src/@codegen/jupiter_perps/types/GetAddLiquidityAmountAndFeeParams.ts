import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface GetAddLiquidityAmountAndFeeParamsFields {
  tokenAmountIn: BN
}

export interface GetAddLiquidityAmountAndFeeParamsJSON {
  tokenAmountIn: string
}

export class GetAddLiquidityAmountAndFeeParams {
  readonly tokenAmountIn: BN

  constructor(fields: GetAddLiquidityAmountAndFeeParamsFields) {
    this.tokenAmountIn = fields.tokenAmountIn
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u64("tokenAmountIn")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new GetAddLiquidityAmountAndFeeParams({
      tokenAmountIn: obj.tokenAmountIn,
    })
  }

  static toEncodable(fields: GetAddLiquidityAmountAndFeeParamsFields) {
    return {
      tokenAmountIn: fields.tokenAmountIn,
    }
  }

  toJSON(): GetAddLiquidityAmountAndFeeParamsJSON {
    return {
      tokenAmountIn: this.tokenAmountIn.toString(),
    }
  }

  static fromJSON(
    obj: GetAddLiquidityAmountAndFeeParamsJSON
  ): GetAddLiquidityAmountAndFeeParams {
    return new GetAddLiquidityAmountAndFeeParams({
      tokenAmountIn: new BN(obj.tokenAmountIn),
    })
  }

  toEncodable() {
    return GetAddLiquidityAmountAndFeeParams.toEncodable(this)
  }
}
