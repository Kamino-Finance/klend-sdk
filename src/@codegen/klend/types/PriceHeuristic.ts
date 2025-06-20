import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PriceHeuristicFields {
  /** Lower value of acceptable price */
  lower: BN
  /** Upper value of acceptable price */
  upper: BN
  /** Number of decimals of the previously defined values */
  exp: BN
}

export interface PriceHeuristicJSON {
  /** Lower value of acceptable price */
  lower: string
  /** Upper value of acceptable price */
  upper: string
  /** Number of decimals of the previously defined values */
  exp: string
}

export class PriceHeuristic {
  /** Lower value of acceptable price */
  readonly lower: BN
  /** Upper value of acceptable price */
  readonly upper: BN
  /** Number of decimals of the previously defined values */
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
