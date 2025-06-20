import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ObligationCollateralFields {
  /** Reserve collateral is deposited to */
  depositReserve: Address
  /** Amount of collateral deposited */
  depositedAmount: BN
  /** Collateral market value in quote currency (scaled fraction) */
  marketValueSf: BN
  /**
   * Debt amount (lamport) taken against this collateral.
   * (only meaningful if this obligation is part of an elevation group, otherwise 0)
   * This is only indicative of the debt computed on the last refresh obligation.
   * If the obligation have multiple collateral this value is the same for all of them.
   */
  borrowedAmountAgainstThisCollateralInElevationGroup: BN
  padding: Array<BN>
}

export interface ObligationCollateralJSON {
  /** Reserve collateral is deposited to */
  depositReserve: string
  /** Amount of collateral deposited */
  depositedAmount: string
  /** Collateral market value in quote currency (scaled fraction) */
  marketValueSf: string
  /**
   * Debt amount (lamport) taken against this collateral.
   * (only meaningful if this obligation is part of an elevation group, otherwise 0)
   * This is only indicative of the debt computed on the last refresh obligation.
   * If the obligation have multiple collateral this value is the same for all of them.
   */
  borrowedAmountAgainstThisCollateralInElevationGroup: string
  padding: Array<string>
}

/** Obligation collateral state */
export class ObligationCollateral {
  /** Reserve collateral is deposited to */
  readonly depositReserve: Address
  /** Amount of collateral deposited */
  readonly depositedAmount: BN
  /** Collateral market value in quote currency (scaled fraction) */
  readonly marketValueSf: BN
  /**
   * Debt amount (lamport) taken against this collateral.
   * (only meaningful if this obligation is part of an elevation group, otherwise 0)
   * This is only indicative of the debt computed on the last refresh obligation.
   * If the obligation have multiple collateral this value is the same for all of them.
   */
  readonly borrowedAmountAgainstThisCollateralInElevationGroup: BN
  readonly padding: Array<BN>

  constructor(fields: ObligationCollateralFields) {
    this.depositReserve = fields.depositReserve
    this.depositedAmount = fields.depositedAmount
    this.marketValueSf = fields.marketValueSf
    this.borrowedAmountAgainstThisCollateralInElevationGroup =
      fields.borrowedAmountAgainstThisCollateralInElevationGroup
    this.padding = fields.padding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("depositReserve"),
        borsh.u64("depositedAmount"),
        borsh.u128("marketValueSf"),
        borsh.u64("borrowedAmountAgainstThisCollateralInElevationGroup"),
        borsh.array(borsh.u64(), 9, "padding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ObligationCollateral({
      depositReserve: obj.depositReserve,
      depositedAmount: obj.depositedAmount,
      marketValueSf: obj.marketValueSf,
      borrowedAmountAgainstThisCollateralInElevationGroup:
        obj.borrowedAmountAgainstThisCollateralInElevationGroup,
      padding: obj.padding,
    })
  }

  static toEncodable(fields: ObligationCollateralFields) {
    return {
      depositReserve: fields.depositReserve,
      depositedAmount: fields.depositedAmount,
      marketValueSf: fields.marketValueSf,
      borrowedAmountAgainstThisCollateralInElevationGroup:
        fields.borrowedAmountAgainstThisCollateralInElevationGroup,
      padding: fields.padding,
    }
  }

  toJSON(): ObligationCollateralJSON {
    return {
      depositReserve: this.depositReserve,
      depositedAmount: this.depositedAmount.toString(),
      marketValueSf: this.marketValueSf.toString(),
      borrowedAmountAgainstThisCollateralInElevationGroup:
        this.borrowedAmountAgainstThisCollateralInElevationGroup.toString(),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObligationCollateralJSON): ObligationCollateral {
    return new ObligationCollateral({
      depositReserve: address(obj.depositReserve),
      depositedAmount: new BN(obj.depositedAmount),
      marketValueSf: new BN(obj.marketValueSf),
      borrowedAmountAgainstThisCollateralInElevationGroup: new BN(
        obj.borrowedAmountAgainstThisCollateralInElevationGroup
      ),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ObligationCollateral.toEncodable(this)
  }
}
