import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface AmountAndFeeFields {
  amount: BN
  fee: BN
  feeBps: BN
}

export interface AmountAndFeeJSON {
  amount: string
  fee: string
  feeBps: string
}

export class AmountAndFee {
  readonly amount: BN
  readonly fee: BN
  readonly feeBps: BN

  constructor(fields: AmountAndFeeFields) {
    this.amount = fields.amount
    this.fee = fields.fee
    this.feeBps = fields.feeBps
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("amount"), borsh.u64("fee"), borsh.u64("feeBps")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new AmountAndFee({
      amount: obj.amount,
      fee: obj.fee,
      feeBps: obj.feeBps,
    })
  }

  static toEncodable(fields: AmountAndFeeFields) {
    return {
      amount: fields.amount,
      fee: fields.fee,
      feeBps: fields.feeBps,
    }
  }

  toJSON(): AmountAndFeeJSON {
    return {
      amount: this.amount.toString(),
      fee: this.fee.toString(),
      feeBps: this.feeBps.toString(),
    }
  }

  static fromJSON(obj: AmountAndFeeJSON): AmountAndFee {
    return new AmountAndFee({
      amount: new BN(obj.amount),
      fee: new BN(obj.fee),
      feeBps: new BN(obj.feeBps),
    })
  }

  toEncodable() {
    return AmountAndFee.toEncodable(this)
  }
}
