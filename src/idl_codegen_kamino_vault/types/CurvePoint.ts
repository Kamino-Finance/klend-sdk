import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface CurvePointFields {
  utilizationRateBps: number
  borrowRateBps: number
}

export interface CurvePointJSON {
  utilizationRateBps: number
  borrowRateBps: number
}

export class CurvePoint {
  readonly utilizationRateBps: number
  readonly borrowRateBps: number

  constructor(fields: CurvePointFields) {
    this.utilizationRateBps = fields.utilizationRateBps
    this.borrowRateBps = fields.borrowRateBps
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.u32("utilizationRateBps"), borsh.u32("borrowRateBps")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new CurvePoint({
      utilizationRateBps: obj.utilizationRateBps,
      borrowRateBps: obj.borrowRateBps,
    })
  }

  static toEncodable(fields: CurvePointFields) {
    return {
      utilizationRateBps: fields.utilizationRateBps,
      borrowRateBps: fields.borrowRateBps,
    }
  }

  toJSON(): CurvePointJSON {
    return {
      utilizationRateBps: this.utilizationRateBps,
      borrowRateBps: this.borrowRateBps,
    }
  }

  static fromJSON(obj: CurvePointJSON): CurvePoint {
    return new CurvePoint({
      utilizationRateBps: obj.utilizationRateBps,
      borrowRateBps: obj.borrowRateBps,
    })
  }

  toEncodable() {
    return CurvePoint.toEncodable(this)
  }
}
