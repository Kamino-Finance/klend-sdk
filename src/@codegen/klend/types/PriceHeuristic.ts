import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PriceHeuristicFields {
  lower: BN
  upper: BN
  exp: BN
}

export interface PriceHeuristicJSON {
  lower: string
  upper: string
  exp: string
}

export class PriceHeuristic {
  readonly lower: BN
  readonly upper: BN
  readonly exp: BN

  constructor(fields: PriceHeuristicFields) {
    this.lower = fields.lower
    this.upper = fields.upper
    this.exp = fields.exp
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u64("lower"), borsh.u64("upper"), borsh.u64("exp")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PriceHeuristic({
      lower: obj.lower,
      upper: obj.upper,
      exp: obj.exp,
    })
  }

  static toEncodable(fields: PriceHeuristicFields) {
    return {
      lower: fields.lower,
      upper: fields.upper,
      exp: fields.exp,
    }
  }

  toJSON(): PriceHeuristicJSON {
    return {
      lower: this.lower.toString(),
      upper: this.upper.toString(),
      exp: this.exp.toString(),
    }
  }

  static fromJSON(obj: PriceHeuristicJSON): PriceHeuristic {
    return new PriceHeuristic({
      lower: new BN(obj.lower),
      upper: new BN(obj.upper),
      exp: new BN(obj.exp),
    })
  }

  toEncodable() {
    return PriceHeuristic.toEncodable(this)
  }
}
