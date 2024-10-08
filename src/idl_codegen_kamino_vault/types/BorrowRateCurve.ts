import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface BorrowRateCurveFields {
  points: Array<types.CurvePointFields>
}

export interface BorrowRateCurveJSON {
  points: Array<types.CurvePointJSON>
}

export class BorrowRateCurve {
  readonly points: Array<types.CurvePoint>

  constructor(fields: BorrowRateCurveFields) {
    this.points = fields.points.map((item) => new types.CurvePoint({ ...item }))
  }

  static layout(property?: string) {
    return borsh.struct(
      [borsh.array(types.CurvePoint.layout(), 11, "points")],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new BorrowRateCurve({
      points: obj.points.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.CurvePoint.fromDecoded(item)
      ),
    })
  }

  static toEncodable(fields: BorrowRateCurveFields) {
    return {
      points: fields.points.map((item) => types.CurvePoint.toEncodable(item)),
    }
  }

  toJSON(): BorrowRateCurveJSON {
    return {
      points: this.points.map((item) => item.toJSON()),
    }
  }

  static fromJSON(obj: BorrowRateCurveJSON): BorrowRateCurve {
    return new BorrowRateCurve({
      points: obj.points.map((item) => types.CurvePoint.fromJSON(item)),
    })
  }

  toEncodable() {
    return BorrowRateCurve.toEncodable(this)
  }
}
