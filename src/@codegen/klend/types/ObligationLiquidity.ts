import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ObligationLiquidityFields {
  borrowReserve: Address
  cumulativeBorrowRateBsf: types.BigFractionBytesFields
  lastBorrowedAtTimestamp: BN
  borrowedAmountSf: BN
  marketValueSf: BN
  borrowFactorAdjustedMarketValueSf: BN
  borrowedAmountOutsideElevationGroups: BN
  fixedTermBorrowRolloverConfig: types.FixedTermBorrowRolloverConfigFields
  borrowedAmountAtExpiration: BN
  padding2: Array<BN>
}

export interface ObligationLiquidityJSON {
  borrowReserve: string
  cumulativeBorrowRateBsf: types.BigFractionBytesJSON
  lastBorrowedAtTimestamp: string
  borrowedAmountSf: string
  marketValueSf: string
  borrowFactorAdjustedMarketValueSf: string
  borrowedAmountOutsideElevationGroups: string
  fixedTermBorrowRolloverConfig: types.FixedTermBorrowRolloverConfigJSON
  borrowedAmountAtExpiration: string
  padding2: Array<string>
}

export class ObligationLiquidity {
  readonly borrowReserve: Address
  readonly cumulativeBorrowRateBsf: types.BigFractionBytes
  readonly lastBorrowedAtTimestamp: BN
  readonly borrowedAmountSf: BN
  readonly marketValueSf: BN
  readonly borrowFactorAdjustedMarketValueSf: BN
  readonly borrowedAmountOutsideElevationGroups: BN
  readonly fixedTermBorrowRolloverConfig: types.FixedTermBorrowRolloverConfig
  readonly borrowedAmountAtExpiration: BN
  readonly padding2: Array<BN>

  constructor(fields: ObligationLiquidityFields) {
    this.borrowReserve = fields.borrowReserve
    this.cumulativeBorrowRateBsf = new types.BigFractionBytes({
      ...fields.cumulativeBorrowRateBsf,
    })
    this.lastBorrowedAtTimestamp = fields.lastBorrowedAtTimestamp
    this.borrowedAmountSf = fields.borrowedAmountSf
    this.marketValueSf = fields.marketValueSf
    this.borrowFactorAdjustedMarketValueSf =
      fields.borrowFactorAdjustedMarketValueSf
    this.borrowedAmountOutsideElevationGroups =
      fields.borrowedAmountOutsideElevationGroups
    this.fixedTermBorrowRolloverConfig =
      new types.FixedTermBorrowRolloverConfig({
        ...fields.fixedTermBorrowRolloverConfig,
      })
    this.borrowedAmountAtExpiration = fields.borrowedAmountAtExpiration
    this.padding2 = fields.padding2
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("borrowReserve"),
        types.BigFractionBytes.layout("cumulativeBorrowRateBsf"),
        borsh.u64("lastBorrowedAtTimestamp"),
        borsh.u128("borrowedAmountSf"),
        borsh.u128("marketValueSf"),
        borsh.u128("borrowFactorAdjustedMarketValueSf"),
        borsh.u64("borrowedAmountOutsideElevationGroups"),
        types.FixedTermBorrowRolloverConfig.layout(
          "fixedTermBorrowRolloverConfig"
        ),
        borsh.u64("borrowedAmountAtExpiration"),
        borsh.array(borsh.u64(), 4, "padding2"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ObligationLiquidity({
      borrowReserve: obj.borrowReserve,
      cumulativeBorrowRateBsf: types.BigFractionBytes.fromDecoded(
        obj.cumulativeBorrowRateBsf
      ),
      lastBorrowedAtTimestamp: obj.lastBorrowedAtTimestamp,
      borrowedAmountSf: obj.borrowedAmountSf,
      marketValueSf: obj.marketValueSf,
      borrowFactorAdjustedMarketValueSf: obj.borrowFactorAdjustedMarketValueSf,
      borrowedAmountOutsideElevationGroups:
        obj.borrowedAmountOutsideElevationGroups,
      fixedTermBorrowRolloverConfig:
        types.FixedTermBorrowRolloverConfig.fromDecoded(
          obj.fixedTermBorrowRolloverConfig
        ),
      borrowedAmountAtExpiration: obj.borrowedAmountAtExpiration,
      padding2: obj.padding2,
    })
  }

  static toEncodable(fields: ObligationLiquidityFields) {
    return {
      borrowReserve: fields.borrowReserve,
      cumulativeBorrowRateBsf: types.BigFractionBytes.toEncodable(
        fields.cumulativeBorrowRateBsf
      ),
      lastBorrowedAtTimestamp: fields.lastBorrowedAtTimestamp,
      borrowedAmountSf: fields.borrowedAmountSf,
      marketValueSf: fields.marketValueSf,
      borrowFactorAdjustedMarketValueSf:
        fields.borrowFactorAdjustedMarketValueSf,
      borrowedAmountOutsideElevationGroups:
        fields.borrowedAmountOutsideElevationGroups,
      fixedTermBorrowRolloverConfig:
        types.FixedTermBorrowRolloverConfig.toEncodable(
          fields.fixedTermBorrowRolloverConfig
        ),
      borrowedAmountAtExpiration: fields.borrowedAmountAtExpiration,
      padding2: fields.padding2,
    }
  }

  toJSON(): ObligationLiquidityJSON {
    return {
      borrowReserve: this.borrowReserve,
      cumulativeBorrowRateBsf: this.cumulativeBorrowRateBsf.toJSON(),
      lastBorrowedAtTimestamp: this.lastBorrowedAtTimestamp.toString(),
      borrowedAmountSf: this.borrowedAmountSf.toString(),
      marketValueSf: this.marketValueSf.toString(),
      borrowFactorAdjustedMarketValueSf:
        this.borrowFactorAdjustedMarketValueSf.toString(),
      borrowedAmountOutsideElevationGroups:
        this.borrowedAmountOutsideElevationGroups.toString(),
      fixedTermBorrowRolloverConfig:
        this.fixedTermBorrowRolloverConfig.toJSON(),
      borrowedAmountAtExpiration: this.borrowedAmountAtExpiration.toString(),
      padding2: this.padding2.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObligationLiquidityJSON): ObligationLiquidity {
    return new ObligationLiquidity({
      borrowReserve: address(obj.borrowReserve),
      cumulativeBorrowRateBsf: types.BigFractionBytes.fromJSON(
        obj.cumulativeBorrowRateBsf
      ),
      lastBorrowedAtTimestamp: new BN(obj.lastBorrowedAtTimestamp),
      borrowedAmountSf: new BN(obj.borrowedAmountSf),
      marketValueSf: new BN(obj.marketValueSf),
      borrowFactorAdjustedMarketValueSf: new BN(
        obj.borrowFactorAdjustedMarketValueSf
      ),
      borrowedAmountOutsideElevationGroups: new BN(
        obj.borrowedAmountOutsideElevationGroups
      ),
      fixedTermBorrowRolloverConfig:
        types.FixedTermBorrowRolloverConfig.fromJSON(
          obj.fixedTermBorrowRolloverConfig
        ),
      borrowedAmountAtExpiration: new BN(obj.borrowedAmountAtExpiration),
      padding2: obj.padding2.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ObligationLiquidity.toEncodable(this)
  }
}
