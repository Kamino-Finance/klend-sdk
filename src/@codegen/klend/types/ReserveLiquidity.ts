import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ReserveLiquidityFields {
  mintPubkey: Address
  supplyVault: Address
  feeVault: Address
  totalAvailableAmount: BN
  borrowedAmountSf: BN
  marketPriceSf: BN
  marketPriceLastUpdatedTs: BN
  mintDecimals: BN
  depositLimitCrossedTimestamp: BN
  borrowLimitCrossedTimestamp: BN
  cumulativeBorrowRateBsf: types.BigFractionBytesFields
  accumulatedProtocolFeesSf: BN
  accumulatedReferrerFeesSf: BN
  pendingReferrerFeesSf: BN
  absoluteReferralRateSf: BN
  tokenProgram: Address
  rewardsAmountAvailable: BN
  padding2: Array<BN>
  padding3: Array<BN>
}

export interface ReserveLiquidityJSON {
  mintPubkey: string
  supplyVault: string
  feeVault: string
  totalAvailableAmount: string
  borrowedAmountSf: string
  marketPriceSf: string
  marketPriceLastUpdatedTs: string
  mintDecimals: string
  depositLimitCrossedTimestamp: string
  borrowLimitCrossedTimestamp: string
  cumulativeBorrowRateBsf: types.BigFractionBytesJSON
  accumulatedProtocolFeesSf: string
  accumulatedReferrerFeesSf: string
  pendingReferrerFeesSf: string
  absoluteReferralRateSf: string
  tokenProgram: string
  rewardsAmountAvailable: string
  padding2: Array<string>
  padding3: Array<string>
}

export class ReserveLiquidity {
  readonly mintPubkey: Address
  readonly supplyVault: Address
  readonly feeVault: Address
  readonly totalAvailableAmount: BN
  readonly borrowedAmountSf: BN
  readonly marketPriceSf: BN
  readonly marketPriceLastUpdatedTs: BN
  readonly mintDecimals: BN
  readonly depositLimitCrossedTimestamp: BN
  readonly borrowLimitCrossedTimestamp: BN
  readonly cumulativeBorrowRateBsf: types.BigFractionBytes
  readonly accumulatedProtocolFeesSf: BN
  readonly accumulatedReferrerFeesSf: BN
  readonly pendingReferrerFeesSf: BN
  readonly absoluteReferralRateSf: BN
  readonly tokenProgram: Address
  readonly rewardsAmountAvailable: BN
  readonly padding2: Array<BN>
  readonly padding3: Array<BN>

  constructor(fields: ReserveLiquidityFields) {
    this.mintPubkey = fields.mintPubkey
    this.supplyVault = fields.supplyVault
    this.feeVault = fields.feeVault
    this.totalAvailableAmount = fields.totalAvailableAmount
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
    this.rewardsAmountAvailable = fields.rewardsAmountAvailable
    this.padding2 = fields.padding2
    this.padding3 = fields.padding3
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("mintPubkey"),
        borshAddress("supplyVault"),
        borshAddress("feeVault"),
        borsh.u64("totalAvailableAmount"),
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
        borsh.u64("rewardsAmountAvailable"),
        borsh.array(borsh.u64(), 50, "padding2"),
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
      totalAvailableAmount: obj.totalAvailableAmount,
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
      rewardsAmountAvailable: obj.rewardsAmountAvailable,
      padding2: obj.padding2,
      padding3: obj.padding3,
    })
  }

  static toEncodable(fields: ReserveLiquidityFields) {
    return {
      mintPubkey: fields.mintPubkey,
      supplyVault: fields.supplyVault,
      feeVault: fields.feeVault,
      totalAvailableAmount: fields.totalAvailableAmount,
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
      rewardsAmountAvailable: fields.rewardsAmountAvailable,
      padding2: fields.padding2,
      padding3: fields.padding3,
    }
  }

  toJSON(): ReserveLiquidityJSON {
    return {
      mintPubkey: this.mintPubkey,
      supplyVault: this.supplyVault,
      feeVault: this.feeVault,
      totalAvailableAmount: this.totalAvailableAmount.toString(),
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
      rewardsAmountAvailable: this.rewardsAmountAvailable.toString(),
      padding2: this.padding2.map((item) => item.toString()),
      padding3: this.padding3.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ReserveLiquidityJSON): ReserveLiquidity {
    return new ReserveLiquidity({
      mintPubkey: address(obj.mintPubkey),
      supplyVault: address(obj.supplyVault),
      feeVault: address(obj.feeVault),
      totalAvailableAmount: new BN(obj.totalAvailableAmount),
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
      rewardsAmountAvailable: new BN(obj.rewardsAmountAvailable),
      padding2: obj.padding2.map((item) => new BN(item)),
      padding3: obj.padding3.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ReserveLiquidity.toEncodable(this)
  }
}
