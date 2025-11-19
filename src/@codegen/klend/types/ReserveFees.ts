import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveFeesFields {
  /**
   * Fee assessed on `BorrowObligationLiquidity`, as scaled fraction (60 bits fractional part)
   * Must be between `0` and `2^60`, such that `2^60 = 1`.  A few examples for
   * clarity:
   * 1% = (1 << 60) / 100 = 11529215046068470
   * 0.01% (1 basis point) = 115292150460685
   * 0.00001% (Aave origination fee) = 115292150461
   */
  originationFeeSf: BN
  /**
   * Fee for flash loan, expressed as scaled fraction.
   * 0.3% (Aave flash loan fee) = 0.003 * 2^60 = 3458764513820541
   */
  flashLoanFeeSf: BN
  /** Used for allignment */
  padding: Array<number>
}

export interface ReserveFeesJSON {
  /**
   * Fee assessed on `BorrowObligationLiquidity`, as scaled fraction (60 bits fractional part)
   * Must be between `0` and `2^60`, such that `2^60 = 1`.  A few examples for
   * clarity:
   * 1% = (1 << 60) / 100 = 11529215046068470
   * 0.01% (1 basis point) = 115292150460685
   * 0.00001% (Aave origination fee) = 115292150461
   */
  originationFeeSf: string
  /**
   * Fee for flash loan, expressed as scaled fraction.
   * 0.3% (Aave flash loan fee) = 0.003 * 2^60 = 3458764513820541
   */
  flashLoanFeeSf: string
  /** Used for allignment */
  padding: Array<number>
}

/**
 * Additional fee information on a reserve
 *
 * These exist separately from interest accrual fees, and are specifically for the program owner
 * and referral fee. The fees are paid out as a percentage of liquidity token amounts during
 * repayments and liquidations.
 */
export class ReserveFees {
  /**
   * Fee assessed on `BorrowObligationLiquidity`, as scaled fraction (60 bits fractional part)
   * Must be between `0` and `2^60`, such that `2^60 = 1`.  A few examples for
   * clarity:
   * 1% = (1 << 60) / 100 = 11529215046068470
   * 0.01% (1 basis point) = 115292150460685
   * 0.00001% (Aave origination fee) = 115292150461
   */
  readonly originationFeeSf: BN
  /**
   * Fee for flash loan, expressed as scaled fraction.
   * 0.3% (Aave flash loan fee) = 0.003 * 2^60 = 3458764513820541
   */
  readonly flashLoanFeeSf: BN
  /** Used for allignment */
  readonly padding: Array<number>

  constructor(fields: ReserveFeesFields) {
    this.originationFeeSf = fields.originationFeeSf
    this.flashLoanFeeSf = fields.flashLoanFeeSf
    this.padding = fields.padding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("originationFeeSf"),
        borsh.u64("flashLoanFeeSf"),
        borsh.array(borsh.u8(), 8, "padding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveFees({
      originationFeeSf: obj.originationFeeSf,
      flashLoanFeeSf: obj.flashLoanFeeSf,
      padding: obj.padding,
    })
  }

  static toEncodable(fields: ReserveFeesFields) {
    return {
      originationFeeSf: fields.originationFeeSf,
      flashLoanFeeSf: fields.flashLoanFeeSf,
      padding: fields.padding,
    }
  }

  toJSON(): ReserveFeesJSON {
    return {
      originationFeeSf: this.originationFeeSf.toString(),
      flashLoanFeeSf: this.flashLoanFeeSf.toString(),
      padding: this.padding,
    }
  }

  static fromJSON(obj: ReserveFeesJSON): ReserveFees {
    return new ReserveFees({
      originationFeeSf: new BN(obj.originationFeeSf),
      flashLoanFeeSf: new BN(obj.flashLoanFeeSf),
      padding: obj.padding,
    })
  }

  toEncodable() {
    return ReserveFees.toEncodable(this)
  }
}
