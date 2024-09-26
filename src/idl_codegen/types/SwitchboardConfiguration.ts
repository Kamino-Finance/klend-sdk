import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface SwitchboardConfigurationFields {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  priceAggregator: PublicKey
  twapAggregator: PublicKey
}

export interface SwitchboardConfigurationJSON {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  priceAggregator: string
  twapAggregator: string
}

export class SwitchboardConfiguration {
  /** Pubkey of the base price feed (disabled if `null` or `default`) */
  readonly priceAggregator: PublicKey
  readonly twapAggregator: PublicKey

  constructor(fields: SwitchboardConfigurationFields) {
    this.priceAggregator = fields.priceAggregator
    this.twapAggregator = fields.twapAggregator
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.publicKey("priceAggregator"), borsh.publicKey("twapAggregator")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SwitchboardConfiguration({
      priceAggregator: obj.priceAggregator,
      twapAggregator: obj.twapAggregator,
    })
  }

  static toEncodable(fields: SwitchboardConfigurationFields) {
    return {
      priceAggregator: fields.priceAggregator,
      twapAggregator: fields.twapAggregator,
    }
  }

  toJSON(): SwitchboardConfigurationJSON {
    return {
      priceAggregator: this.priceAggregator.toString(),
      twapAggregator: this.twapAggregator.toString(),
    }
  }

  static fromJSON(obj: SwitchboardConfigurationJSON): SwitchboardConfiguration {
    return new SwitchboardConfiguration({
      priceAggregator: new PublicKey(obj.priceAggregator),
      twapAggregator: new PublicKey(obj.twapAggregator),
    })
  }

  toEncodable() {
    return SwitchboardConfiguration.toEncodable(this)
  }
}
