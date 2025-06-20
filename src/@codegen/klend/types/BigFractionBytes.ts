import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface BigFractionBytesFields {
  value: Array<BN>
  padding: Array<BN>
}

export interface BigFractionBytesJSON {
  value: Array<string>
  padding: Array<string>
}

export class BigFractionBytes {
  readonly value: Array<BN>
  readonly padding: Array<BN>

  constructor(fields: BigFractionBytesFields) {
    this.value = fields.value
    this.padding = fields.padding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.array(borsh.u64(), 4, "value"),
        borsh.array(borsh.u64(), 2, "padding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new BigFractionBytes({
      value: obj.value,
      padding: obj.padding,
    })
  }

  static toEncodable(fields: BigFractionBytesFields) {
    return {
      value: fields.value,
      padding: fields.padding,
    }
  }

  toJSON(): BigFractionBytesJSON {
    return {
      value: this.value.map((item) => item.toString()),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: BigFractionBytesJSON): BigFractionBytes {
    return new BigFractionBytes({
      value: obj.value.map((item) => new BN(item)),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return BigFractionBytes.toEncodable(this)
  }
}
