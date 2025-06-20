import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveLiquidityFields {
  /** Reserve liquidity mint address */
  mintPubkey: Address
  /** Reserve liquidity supply address */
  supplyVault: Address
  /** Reserve liquidity fee collection address */
  feeVault: Address
  /** Reserve liquidity available */
  availableAmount: BN
  /** Reserve liquidity borrowed (scaled fraction) */
  borrowedAmountSf: BN
  /** Reserve liquidity market price in quote currency (scaled fraction) */
  marketPriceSf: BN
  /** Unix timestamp of the market price (from the oracle) */
  marketPriceLastUpdatedTs: BN
  /** Reserve liquidity mint decimals */
  mintDecimals: BN
  /**
   * Timestamp when the last refresh reserve detected that the liquidity amount is above the deposit cap. When this threshold is crossed, then redemptions (auto-deleverage) are enabled.
   * If the threshold is not crossed, then the timestamp is set to 0
   */
  depositLimitCrossedTimestamp: BN
  /**
   * Timestamp when the last refresh reserve detected that the borrowed amount is above the borrow cap. When this threshold is crossed, then redemptions (auto-deleverage) are enabled.
   * If the threshold is not crossed, then the timestamp is set to 0
   */
  borrowLimitCrossedTimestamp: BN
  /** Reserve liquidity cumulative borrow rate (scaled fraction) */
  cumulativeBorrowRateBsf: types.BigFractionBytesFields
  /** Reserve cumulative protocol fees (scaled fraction) */
  accumulatedProtocolFeesSf: BN
  /** Reserve cumulative referrer fees (scaled fraction) */
  accumulatedReferrerFeesSf: BN
  /** Reserve pending referrer fees, to be claimed in refresh_obligation by referrer or protocol (scaled fraction) */
  pendingReferrerFeesSf: BN
  /** Reserve referrer fee absolute rate calculated at each refresh_reserve operation (scaled fraction) */
  absoluteReferralRateSf: BN
  /** Token program of the liquidity mint */
  tokenProgram: Address
  padding2: Array<BN>
  padding3: Array<BN>
}

export interface ReserveLiquidityJSON {
  /** Reserve liquidity mint address */
  mintPubkey: string
  /** Reserve liquidity supply address */
  supplyVault: string
  /** Reserve liquidity fee collection address */
  feeVault: string
  /** Reserve liquidity available */
  availableAmount: string
  /** Reserve liquidity borrowed (scaled fraction) */
  borrowedAmountSf: string
  /** Reserve liquidity market price in quote currency (scaled fraction) */
  marketPriceSf: string
  /** Unix timestamp of the market price (from the oracle) */
  marketPriceLastUpdatedTs: string
  /** Reserve liquidity mint decimals */
  mintDecimals: string
  /**
   * Timestamp when the last refresh reserve detected that the liquidity amount is above the deposit cap. When this threshold is crossed, then redemptions (auto-deleverage) are enabled.
   * If the threshold is not crossed, then the timestamp is set to 0
   */
  depositLimitCrossedTimestamp: string
  /**
   * Timestamp when the last refresh reserve detected that the borrowed amount is above the borrow cap. When this threshold is crossed, then redemptions (auto-deleverage) are enabled.
   * If the threshold is not crossed, then the timestamp is set to 0
   */
  borrowLimitCrossedTimestamp: string
  /** Reserve liquidity cumulative borrow rate (scaled fraction) */
  cumulativeBorrowRateBsf: types.BigFractionBytesJSON
  /** Reserve cumulative protocol fees (scaled fraction) */
  accumulatedProtocolFeesSf: string
  /** Reserve cumulative referrer fees (scaled fraction) */
  accumulatedReferrerFeesSf: string
  /** Reserve pending referrer fees, to be claimed in refresh_obligation by referrer or protocol (scaled fraction) */
  pendingReferrerFeesSf: string
  /** Reserve referrer fee absolute rate calculated at each refresh_reserve operation (scaled fraction) */
  absoluteReferralRateSf: string
  /** Token program of the liquidity mint */
  tokenProgram: string
  padding2: Array<string>
  padding3: Array<string>
}

/** Reserve liquidity */
export class ReserveLiquidity {
  /** Reserve liquidity mint address */
  readonly mintPubkey: Address
  /** Reserve liquidity supply address */
  readonly supplyVault: Address
  /** Reserve liquidity fee collection address */
  readonly feeVault: Address
  /** Reserve liquidity available */
  readonly availableAmount: BN
  /** Reserve liquidity borrowed (scaled fraction) */
  readonly borrowedAmountSf: BN
  /** Reserve liquidity market price in quote currency (scaled fraction) */
  readonly marketPriceSf: BN
  /** Unix timestamp of the market price (from the oracle) */
  readonly marketPriceLastUpdatedTs: BN
  /** Reserve liquidity mint decimals */
  readonly mintDecimals: BN
  /**
   * Timestamp when the last refresh reserve detected that the liquidity amount is above the deposit cap. When this threshold is crossed, then redemptions (auto-deleverage) are enabled.
   * If the threshold is not crossed, then the timestamp is set to 0
   */
  readonly depositLimitCrossedTimestamp: BN
  /**
   * Timestamp when the last refresh reserve detected that the borrowed amount is above the borrow cap. When this threshold is crossed, then redemptions (auto-deleverage) are enabled.
   * If the threshold is not crossed, then the timestamp is set to 0
   */
  readonly borrowLimitCrossedTimestamp: BN
  /** Reserve liquidity cumulative borrow rate (scaled fraction) */
  readonly cumulativeBorrowRateBsf: types.BigFractionBytes
  /** Reserve cumulative protocol fees (scaled fraction) */
  readonly accumulatedProtocolFeesSf: BN
  /** Reserve cumulative referrer fees (scaled fraction) */
  readonly accumulatedReferrerFeesSf: BN
  /** Reserve pending referrer fees, to be claimed in refresh_obligation by referrer or protocol (scaled fraction) */
  readonly pendingReferrerFeesSf: BN
  /** Reserve referrer fee absolute rate calculated at each refresh_reserve operation (scaled fraction) */
  readonly absoluteReferralRateSf: BN
  /** Token program of the liquidity mint */
  readonly tokenProgram: Address
  readonly padding2: Array<BN>
  readonly padding3: Array<BN>

  constructor(fields: ReserveLiquidityFields) {
    this.mintPubkey = fields.mintPubkey
    this.supplyVault = fields.supplyVault
    this.feeVault = fields.feeVault
    this.availableAmount = fields.availableAmount
    this.borrowedAmountSf = fields.borrowedAmountSf
    this.marketPriceSf = fields.marketPriceSf
    this.marketPriceLastUpdatedTs = fields.marketPriceLastUpdatedTs
    this.mintDecimals = fields.mintDecimals
    this.depositLimitCrossedTimestamp = fields.depositLimitCrossedTimestamp
    this.borrowLimitCrossedTimestamp = fields.borrowLimitCrossedTimestamp
    this.cumulativeBorrowRateBsf = new types.BigFractionBytes({
      ...fields.cumulativeBorrowRateBsf,
    })
    this.accumulatedProtocolFeesSf = fields.accumulatedProtocolFeesSf
    this.accumulatedReferrerFeesSf = fields.accumulatedReferrerFeesSf
    this.pendingReferrerFeesSf = fields.pendingReferrerFeesSf
    this.absoluteReferralRateSf = fields.absoluteReferralRateSf
    this.tokenProgram = fields.tokenProgram
    this.padding2 = fields.padding2
    this.padding3 = fields.padding3
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("mintPubkey"),
        borshAddress("supplyVault"),
        borshAddress("feeVault"),
        borsh.u64("availableAmount"),
        borsh.u128("borrowedAmountSf"),
        borsh.u128("marketPriceSf"),
        borsh.u64("marketPriceLastUpdatedTs"),
        borsh.u64("mintDecimals"),
        borsh.u64("depositLimitCrossedTimestamp"),
        borsh.u64("borrowLimitCrossedTimestamp"),
        types.BigFractionBytes.layout("cumulativeBorrowRateBsf"),
        borsh.u128("accumulatedProtocolFeesSf"),
        borsh.u128("accumulatedReferrerFeesSf"),
        borsh.u128("pendingReferrerFeesSf"),
        borsh.u128("absoluteReferralRateSf"),
        borshAddress("tokenProgram"),
        borsh.array(borsh.u64(), 51, "padding2"),
        borsh.array(borsh.u128(), 32, "padding3"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ReserveLiquidity({
      mintPubkey: obj.mintPubkey,
      supplyVault: obj.supplyVault,
      feeVault: obj.feeVault,
      availableAmount: obj.availableAmount,
      borrowedAmountSf: obj.borrowedAmountSf,
      marketPriceSf: obj.marketPriceSf,
      marketPriceLastUpdatedTs: obj.marketPriceLastUpdatedTs,
      mintDecimals: obj.mintDecimals,
      depositLimitCrossedTimestamp: obj.depositLimitCrossedTimestamp,
      borrowLimitCrossedTimestamp: obj.borrowLimitCrossedTimestamp,
      cumulativeBorrowRateBsf: types.BigFractionBytes.fromDecoded(
        obj.cumulativeBorrowRateBsf
      ),
      accumulatedProtocolFeesSf: obj.accumulatedProtocolFeesSf,
      accumulatedReferrerFeesSf: obj.accumulatedReferrerFeesSf,
      pendingReferrerFeesSf: obj.pendingReferrerFeesSf,
      absoluteReferralRateSf: obj.absoluteReferralRateSf,
      tokenProgram: obj.tokenProgram,
      padding2: obj.padding2,
      padding3: obj.padding3,
    })
  }

  static toEncodable(fields: ReserveLiquidityFields) {
    return {
      mintPubkey: fields.mintPubkey,
      supplyVault: fields.supplyVault,
      feeVault: fields.feeVault,
      availableAmount: fields.availableAmount,
      borrowedAmountSf: fields.borrowedAmountSf,
      marketPriceSf: fields.marketPriceSf,
      marketPriceLastUpdatedTs: fields.marketPriceLastUpdatedTs,
      mintDecimals: fields.mintDecimals,
      depositLimitCrossedTimestamp: fields.depositLimitCrossedTimestamp,
      borrowLimitCrossedTimestamp: fields.borrowLimitCrossedTimestamp,
      cumulativeBorrowRateBsf: types.BigFractionBytes.toEncodable(
        fields.cumulativeBorrowRateBsf
      ),
      accumulatedProtocolFeesSf: fields.accumulatedProtocolFeesSf,
      accumulatedReferrerFeesSf: fields.accumulatedReferrerFeesSf,
      pendingReferrerFeesSf: fields.pendingReferrerFeesSf,
      absoluteReferralRateSf: fields.absoluteReferralRateSf,
      tokenProgram: fields.tokenProgram,
      padding2: fields.padding2,
      padding3: fields.padding3,
    }
  }

  toJSON(): ReserveLiquidityJSON {
    return {
      mintPubkey: this.mintPubkey,
      supplyVault: this.supplyVault,
      feeVault: this.feeVault,
      availableAmount: this.availableAmount.toString(),
      borrowedAmountSf: this.borrowedAmountSf.toString(),
      marketPriceSf: this.marketPriceSf.toString(),
      marketPriceLastUpdatedTs: this.marketPriceLastUpdatedTs.toString(),
      mintDecimals: this.mintDecimals.toString(),
      depositLimitCrossedTimestamp:
        this.depositLimitCrossedTimestamp.toString(),
      borrowLimitCrossedTimestamp: this.borrowLimitCrossedTimestamp.toString(),
      cumulativeBorrowRateBsf: this.cumulativeBorrowRateBsf.toJSON(),
      accumulatedProtocolFeesSf: this.accumulatedProtocolFeesSf.toString(),
      accumulatedReferrerFeesSf: this.accumulatedReferrerFeesSf.toString(),
      pendingReferrerFeesSf: this.pendingReferrerFeesSf.toString(),
      absoluteReferralRateSf: this.absoluteReferralRateSf.toString(),
      tokenProgram: this.tokenProgram,
      padding2: this.padding2.map((item) => item.toString()),
      padding3: this.padding3.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ReserveLiquidityJSON): ReserveLiquidity {
    return new ReserveLiquidity({
      mintPubkey: address(obj.mintPubkey),
      supplyVault: address(obj.supplyVault),
      feeVault: address(obj.feeVault),
      availableAmount: new BN(obj.availableAmount),
      borrowedAmountSf: new BN(obj.borrowedAmountSf),
      marketPriceSf: new BN(obj.marketPriceSf),
      marketPriceLastUpdatedTs: new BN(obj.marketPriceLastUpdatedTs),
      mintDecimals: new BN(obj.mintDecimals),
      depositLimitCrossedTimestamp: new BN(obj.depositLimitCrossedTimestamp),
      borrowLimitCrossedTimestamp: new BN(obj.borrowLimitCrossedTimestamp),
      cumulativeBorrowRateBsf: types.BigFractionBytes.fromJSON(
        obj.cumulativeBorrowRateBsf
      ),
      accumulatedProtocolFeesSf: new BN(obj.accumulatedProtocolFeesSf),
      accumulatedReferrerFeesSf: new BN(obj.accumulatedReferrerFeesSf),
      pendingReferrerFeesSf: new BN(obj.pendingReferrerFeesSf),
      absoluteReferralRateSf: new BN(obj.absoluteReferralRateSf),
      tokenProgram: address(obj.tokenProgram),
      padding2: obj.padding2.map((item) => new BN(item)),
      padding3: obj.padding3.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ReserveLiquidity.toEncodable(this)
  }
}
