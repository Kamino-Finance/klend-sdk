import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface OraclePriceInfoFields {
  increaseLong: BN
  increaseShort: BN
  decreaseLong: BN
  decreaseShort: BN
  buyLp: BN
  sellLp: BN
}

export interface OraclePriceInfoJSON {
  increaseLong: string
  increaseShort: string
  decreaseLong: string
  decreaseShort: string
  buyLp: string
  sellLp: string
}

export class OraclePriceInfo {
  readonly increaseLong: BN
  readonly increaseShort: BN
  readonly decreaseLong: BN
  readonly decreaseShort: BN
  readonly buyLp: BN
  readonly sellLp: BN

  constructor(fields: OraclePriceInfoFields) {
    this.increaseLong = fields.increaseLong
    this.increaseShort = fields.increaseShort
    this.decreaseLong = fields.decreaseLong
    this.decreaseShort = fields.decreaseShort
    this.buyLp = fields.buyLp
    this.sellLp = fields.sellLp
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("increaseLong"),
        borsh.u64("increaseShort"),
        borsh.u64("decreaseLong"),
        borsh.u64("decreaseShort"),
        borsh.u64("buyLp"),
        borsh.u64("sellLp"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new OraclePriceInfo({
      increaseLong: obj.increaseLong,
      increaseShort: obj.increaseShort,
      decreaseLong: obj.decreaseLong,
      decreaseShort: obj.decreaseShort,
      buyLp: obj.buyLp,
      sellLp: obj.sellLp,
    })
  }

  static toEncodable(fields: OraclePriceInfoFields) {
    return {
      increaseLong: fields.increaseLong,
      increaseShort: fields.increaseShort,
      decreaseLong: fields.decreaseLong,
      decreaseShort: fields.decreaseShort,
      buyLp: fields.buyLp,
      sellLp: fields.sellLp,
    }
  }

  toJSON(): OraclePriceInfoJSON {
    return {
      increaseLong: this.increaseLong.toString(),
      increaseShort: this.increaseShort.toString(),
      decreaseLong: this.decreaseLong.toString(),
      decreaseShort: this.decreaseShort.toString(),
      buyLp: this.buyLp.toString(),
      sellLp: this.sellLp.toString(),
    }
  }

  static fromJSON(obj: OraclePriceInfoJSON): OraclePriceInfo {
    return new OraclePriceInfo({
      increaseLong: new BN(obj.increaseLong),
      increaseShort: new BN(obj.increaseShort),
      decreaseLong: new BN(obj.decreaseLong),
      decreaseShort: new BN(obj.decreaseShort),
      buyLp: new BN(obj.buyLp),
      sellLp: new BN(obj.sellLp),
    })
  }

  toEncodable() {
    return OraclePriceInfo.toEncodable(this)
  }
}
