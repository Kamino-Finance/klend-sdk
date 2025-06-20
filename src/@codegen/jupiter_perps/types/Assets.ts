import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface AssetsFields {
  feesReserves: BN
  owned: BN
  locked: BN
  guaranteedUsd: BN
  globalShortSizes: BN
  globalShortAveragePrices: BN
}

export interface AssetsJSON {
  feesReserves: string
  owned: string
  locked: string
  guaranteedUsd: string
  globalShortSizes: string
  globalShortAveragePrices: string
}

export class Assets {
  readonly feesReserves: BN
  readonly owned: BN
  readonly locked: BN
  readonly guaranteedUsd: BN
  readonly globalShortSizes: BN
  readonly globalShortAveragePrices: BN

  constructor(fields: AssetsFields) {
    this.feesReserves = fields.feesReserves
    this.owned = fields.owned
    this.locked = fields.locked
    this.guaranteedUsd = fields.guaranteedUsd
    this.globalShortSizes = fields.globalShortSizes
    this.globalShortAveragePrices = fields.globalShortAveragePrices
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("feesReserves"),
        borsh.u64("owned"),
        borsh.u64("locked"),
        borsh.u64("guaranteedUsd"),
        borsh.u64("globalShortSizes"),
        borsh.u64("globalShortAveragePrices"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new Assets({
      feesReserves: obj.feesReserves,
      owned: obj.owned,
      locked: obj.locked,
      guaranteedUsd: obj.guaranteedUsd,
      globalShortSizes: obj.globalShortSizes,
      globalShortAveragePrices: obj.globalShortAveragePrices,
    })
  }

  static toEncodable(fields: AssetsFields) {
    return {
      feesReserves: fields.feesReserves,
      owned: fields.owned,
      locked: fields.locked,
      guaranteedUsd: fields.guaranteedUsd,
      globalShortSizes: fields.globalShortSizes,
      globalShortAveragePrices: fields.globalShortAveragePrices,
    }
  }

  toJSON(): AssetsJSON {
    return {
      feesReserves: this.feesReserves.toString(),
      owned: this.owned.toString(),
      locked: this.locked.toString(),
      guaranteedUsd: this.guaranteedUsd.toString(),
      globalShortSizes: this.globalShortSizes.toString(),
      globalShortAveragePrices: this.globalShortAveragePrices.toString(),
    }
  }

  static fromJSON(obj: AssetsJSON): Assets {
    return new Assets({
      feesReserves: new BN(obj.feesReserves),
      owned: new BN(obj.owned),
      locked: new BN(obj.locked),
      guaranteedUsd: new BN(obj.guaranteedUsd),
      globalShortSizes: new BN(obj.globalShortSizes),
      globalShortAveragePrices: new BN(obj.globalShortAveragePrices),
    })
  }

  toEncodable() {
    return Assets.toEncodable(this)
  }
}
