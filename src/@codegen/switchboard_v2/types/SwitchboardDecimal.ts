import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SwitchboardDecimalFields {
  mantissa: BN
  scale: number
}

export interface SwitchboardDecimalJSON {
  mantissa: string
  scale: number
}

export class SwitchboardDecimal {
  readonly mantissa: BN
  readonly scale: number

  constructor(fields: SwitchboardDecimalFields) {
    this.mantissa = fields.mantissa
    this.scale = fields.scale
  }

  static layout(property?: string) {
    return borsh.struct([borsh.i128("mantissa"), borsh.u32("scale")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SwitchboardDecimal({
      mantissa: obj.mantissa,
      scale: obj.scale,
    })
  }

  static toEncodable(fields: SwitchboardDecimalFields) {
    return {
      mantissa: fields.mantissa,
      scale: fields.scale,
    }
  }

  toJSON(): SwitchboardDecimalJSON {
    return {
      mantissa: this.mantissa.toString(),
      scale: this.scale,
    }
  }

  static fromJSON(obj: SwitchboardDecimalJSON): SwitchboardDecimal {
    return new SwitchboardDecimal({
      mantissa: new BN(obj.mantissa),
      scale: obj.scale,
    })
  }

  toEncodable() {
    return SwitchboardDecimal.toEncodable(this)
  }
}
