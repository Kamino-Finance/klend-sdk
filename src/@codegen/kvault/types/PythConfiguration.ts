import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PythConfigurationFields {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  price: Address
}

export interface PythConfigurationJSON {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  price: string
}

export class PythConfiguration {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  readonly price: Address

  constructor(fields: PythConfigurationFields) {
    this.price = fields.price
  }

  static layout(property?: string) {
    return borsh.struct([borshAddress("price")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PythConfiguration({
      price: obj.price,
    })
  }

  static toEncodable(fields: PythConfigurationFields) {
    return {
      price: fields.price,
    }
  }

  toJSON(): PythConfigurationJSON {
    return {
      price: this.price,
    }
  }

  static fromJSON(obj: PythConfigurationJSON): PythConfiguration {
    return new PythConfiguration({
      price: address(obj.price),
    })
  }

  toEncodable() {
    return PythConfiguration.toEncodable(this)
  }
}
