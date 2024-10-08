import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface PythConfigurationFields {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  price: PublicKey
}

export interface PythConfigurationJSON {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  price: string
}

export class PythConfiguration {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  readonly price: PublicKey

  constructor(fields: PythConfigurationFields) {
    this.price = fields.price
  }

  static layout(property?: string) {
    return borsh.struct([borsh.publicKey("price")], property)
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
      price: this.price.toString(),
    }
  }

  static fromJSON(obj: PythConfigurationJSON): PythConfiguration {
    return new PythConfiguration({
      price: new PublicKey(obj.price),
    })
  }

  toEncodable() {
    return PythConfiguration.toEncodable(this)
  }
}
