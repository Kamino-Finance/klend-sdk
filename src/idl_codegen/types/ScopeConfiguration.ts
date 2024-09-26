import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface ScopeConfigurationFields {
  /** Pubkey of the scope price feed (disabled if `null` or `default`) */
  priceFeed: PublicKey
  /** This is the scope_id price chain that results in a price for the token */
  priceChain: Array<number>
  /** This is the scope_id price chain for the twap */
  twapChain: Array<number>
}

export interface ScopeConfigurationJSON {
  /** Pubkey of the scope price feed (disabled if `null` or `default`) */
  priceFeed: string
  /** This is the scope_id price chain that results in a price for the token */
  priceChain: Array<number>
  /** This is the scope_id price chain for the twap */
  twapChain: Array<number>
}

export class ScopeConfiguration {
  /** Pubkey of the scope price feed (disabled if `null` or `default`) */
  readonly priceFeed: PublicKey
  /** This is the scope_id price chain that results in a price for the token */
  readonly priceChain: Array<number>
  /** This is the scope_id price chain for the twap */
  readonly twapChain: Array<number>

  constructor(fields: ScopeConfigurationFields) {
    this.priceFeed = fields.priceFeed
    this.priceChain = fields.priceChain
    this.twapChain = fields.twapChain
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.publicKey("priceFeed"),
        borsh.array(borsh.u16(), 4, "priceChain"),
        borsh.array(borsh.u16(), 4, "twapChain"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ScopeConfiguration({
      priceFeed: obj.priceFeed,
      priceChain: obj.priceChain,
      twapChain: obj.twapChain,
    })
  }

  static toEncodable(fields: ScopeConfigurationFields) {
    return {
      priceFeed: fields.priceFeed,
      priceChain: fields.priceChain,
      twapChain: fields.twapChain,
    }
  }

  toJSON(): ScopeConfigurationJSON {
    return {
      priceFeed: this.priceFeed.toString(),
      priceChain: this.priceChain,
      twapChain: this.twapChain,
    }
  }

  static fromJSON(obj: ScopeConfigurationJSON): ScopeConfiguration {
    return new ScopeConfiguration({
      priceFeed: new PublicKey(obj.priceFeed),
      priceChain: obj.priceChain,
      twapChain: obj.twapChain,
    })
  }

  toEncodable() {
    return ScopeConfiguration.toEncodable(this)
  }
}
