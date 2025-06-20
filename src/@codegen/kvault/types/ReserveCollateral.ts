import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveCollateralFields {
  /** Reserve collateral mint address */
  mintPubkey: Address
  /** Reserve collateral mint supply, used for exchange rate */
  mintTotalSupply: BN
  /** Reserve collateral supply address */
  supplyVault: Address
  padding1: Array<BN>
  padding2: Array<BN>
}

export interface ReserveCollateralJSON {
  /** Reserve collateral mint address */
  mintPubkey: string
  /** Reserve collateral mint supply, used for exchange rate */
  mintTotalSupply: string
  /** Reserve collateral supply address */
  supplyVault: string
  padding1: Array<string>
  padding2: Array<string>
}

/** Reserve collateral */
export class ReserveCollateral {
  /** Reserve collateral mint address */
  readonly mintPubkey: Address
  /** Reserve collateral mint supply, used for exchange rate */
  readonly mintTotalSupply: BN
  /** Reserve collateral supply address */
  readonly supplyVault: Address
  readonly padding1: Array<BN>
  readonly padding2: Array<BN>

  constructor(fields: ReserveCollateralFields) {
    this.mintPubkey = fields.mintPubkey
    this.mintTotalSupply = fields.mintTotalSupply
    this.supplyVault = fields.supplyVault
    this.padding1 = fields.padding1
    this.padding2 = fields.padding2
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("mintPubkey"),
        borsh.u64("mintTotalSupply"),
        borshAddress("supplyVault"),
        borsh.array(borsh.u128(), 32, "padding1"),
        borsh.array(borsh.u128(), 32, "padding2"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveCollateral({
      mintPubkey: obj.mintPubkey,
      mintTotalSupply: obj.mintTotalSupply,
      supplyVault: obj.supplyVault,
      padding1: obj.padding1,
      padding2: obj.padding2,
    })
  }

  static toEncodable(fields: ReserveCollateralFields) {
    return {
      mintPubkey: fields.mintPubkey,
      mintTotalSupply: fields.mintTotalSupply,
      supplyVault: fields.supplyVault,
      padding1: fields.padding1,
      padding2: fields.padding2,
    }
  }

  toJSON(): ReserveCollateralJSON {
    return {
      mintPubkey: this.mintPubkey,
      mintTotalSupply: this.mintTotalSupply.toString(),
      supplyVault: this.supplyVault,
      padding1: this.padding1.map((item) => item.toString()),
      padding2: this.padding2.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ReserveCollateralJSON): ReserveCollateral {
    return new ReserveCollateral({
      mintPubkey: address(obj.mintPubkey),
      mintTotalSupply: new BN(obj.mintTotalSupply),
      supplyVault: address(obj.supplyVault),
      padding1: obj.padding1.map((item) => new BN(item)),
      padding2: obj.padding2.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ReserveCollateral.toEncodable(this)
  }
}
