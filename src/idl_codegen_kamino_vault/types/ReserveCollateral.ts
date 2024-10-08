import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface ReserveCollateralFields {
  /** Reserve collateral mint address */
  mintPubkey: PublicKey
  /** Reserve collateral mint supply, used for exchange rate */
  mintTotalSupply: BN
  /** Reserve collateral supply address */
  supplyVault: PublicKey
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
  readonly mintPubkey: PublicKey
  /** Reserve collateral mint supply, used for exchange rate */
  readonly mintTotalSupply: BN
  /** Reserve collateral supply address */
  readonly supplyVault: PublicKey
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
        borsh.publicKey("mintPubkey"),
        borsh.u64("mintTotalSupply"),
        borsh.publicKey("supplyVault"),
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
      mintPubkey: this.mintPubkey.toString(),
      mintTotalSupply: this.mintTotalSupply.toString(),
      supplyVault: this.supplyVault.toString(),
      padding1: this.padding1.map((item) => item.toString()),
      padding2: this.padding2.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ReserveCollateralJSON): ReserveCollateral {
    return new ReserveCollateral({
      mintPubkey: new PublicKey(obj.mintPubkey),
      mintTotalSupply: new BN(obj.mintTotalSupply),
      supplyVault: new PublicKey(obj.supplyVault),
      padding1: obj.padding1.map((item) => new BN(item)),
      padding2: obj.padding2.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ReserveCollateral.toEncodable(this)
  }
}
