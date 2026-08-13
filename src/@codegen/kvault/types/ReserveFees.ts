import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveFeesFields {
  originationFeeSf: BN
  flashLoanFeeSf: BN
  padding: Array<number>
}

export interface ReserveFeesJSON {
  originationFeeSf: string
  flashLoanFeeSf: string
  padding: Array<number>
}

export class ReserveFees {
  readonly originationFeeSf: BN
  readonly flashLoanFeeSf: BN
  readonly padding: Array<number>

  constructor(fields: ReserveFeesFields) {
    this.originationFeeSf = fields.originationFeeSf
    this.flashLoanFeeSf = fields.flashLoanFeeSf
    this.padding = fields.padding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("originationFeeSf"),
        borsh.u64("flashLoanFeeSf"),
        borsh.array(borsh.u8(), 8, "padding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveFees({
      originationFeeSf: obj.originationFeeSf,
      flashLoanFeeSf: obj.flashLoanFeeSf,
      padding: obj.padding,
    })
  }

  static toEncodable(fields: ReserveFeesFields) {
    return {
      originationFeeSf: fields.originationFeeSf,
      flashLoanFeeSf: fields.flashLoanFeeSf,
      padding: fields.padding,
    }
  }

  toJSON(): ReserveFeesJSON {
    return {
      originationFeeSf: this.originationFeeSf.toString(),
      flashLoanFeeSf: this.flashLoanFeeSf.toString(),
      padding: this.padding,
    }
  }

  static fromJSON(obj: ReserveFeesJSON): ReserveFees {
    return new ReserveFees({
      originationFeeSf: new BN(obj.originationFeeSf),
      flashLoanFeeSf: new BN(obj.flashLoanFeeSf),
      padding: obj.padding,
    })
  }

  toEncodable() {
    return ReserveFees.toEncodable(this)
  }
}
