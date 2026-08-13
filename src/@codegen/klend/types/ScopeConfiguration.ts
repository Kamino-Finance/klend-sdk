import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ScopeConfigurationFields {
  priceFeed: Address
  priceChain: Array<number>
  twapChain: Array<number>
}

export interface ScopeConfigurationJSON {
  priceFeed: string
  priceChain: Array<number>
  twapChain: Array<number>
}

export class ScopeConfiguration {
  readonly priceFeed: Address
  readonly priceChain: Array<number>
  readonly twapChain: Array<number>

  constructor(fields: ScopeConfigurationFields) {
    this.priceFeed = fields.priceFeed
    this.priceChain = fields.priceChain
    this.twapChain = fields.twapChain
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("priceFeed"),
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
      priceFeed: this.priceFeed,
      priceChain: this.priceChain,
      twapChain: this.twapChain,
    }
  }

  static fromJSON(obj: ScopeConfigurationJSON): ScopeConfiguration {
    return new ScopeConfiguration({
      priceFeed: address(obj.priceFeed),
      priceChain: obj.priceChain,
      twapChain: obj.twapChain,
    })
  }

  toEncodable() {
    return ScopeConfiguration.toEncodable(this)
  }
}
