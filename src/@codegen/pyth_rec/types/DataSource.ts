import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface DataSourceFields {
  chain: number
  emitter: Address
}

export interface DataSourceJSON {
  chain: number
  emitter: string
}

export class DataSource {
  readonly chain: number
  readonly emitter: Address

  constructor(fields: DataSourceFields) {
    this.chain = fields.chain
    this.emitter = fields.emitter
  }

  static layout(property?: string) {
    return borsh.struct([borsh.u16("chain"), borshAddress("emitter")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new DataSource({
      chain: obj.chain,
      emitter: obj.emitter,
    })
  }

  static toEncodable(fields: DataSourceFields) {
    return {
      chain: fields.chain,
      emitter: fields.emitter,
    }
  }

  toJSON(): DataSourceJSON {
    return {
      chain: this.chain,
      emitter: this.emitter,
    }
  }

  static fromJSON(obj: DataSourceJSON): DataSource {
    return new DataSource({
      chain: obj.chain,
      emitter: address(obj.emitter),
    })
  }

  toEncodable() {
    return DataSource.toEncodable(this)
  }
}
