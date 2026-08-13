/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  address,
  Address,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from "@solana/kit"
/* eslint-enable @typescript-eslint/no-unused-vars */
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { borshAddress } from "../utils" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ObligationFields {
  tag: BN
  lastUpdate: types.LastUpdateFields
  lendingMarket: Address
  owner: Address
  deposits: Array<types.ObligationCollateralFields>
  lowestReserveDepositLiquidationLtv: BN
  depositedValueSf: BN
  borrows: Array<types.ObligationLiquidityFields>
  borrowFactorAdjustedDebtValueSf: BN
  borrowedAssetsMarketValueSf: BN
  allowedBorrowValueSf: BN
  unhealthyBorrowValueSf: BN
  paddingDeprecatedAssetTiers: Array<number>
  elevationGroup: number
  numOfObsoleteDepositReserves: number
  hasDebt: number
  referrer: Address
  borrowingDisabled: number
  autodeleverageTargetLtvPct: number
  lowestReserveDepositMaxLtvPct: number
  numOfObsoleteBorrowReserves: number
  ownershipTransferState: number
  reserved: Array<number>
  highestBorrowFactorPct: BN
  autodeleverageMarginCallStartedTimestamp: BN
  obligationOrders: Array<types.ObligationOrderFields>
  headBorrowOrder: types.BorrowOrderFields
  pendingOwner: Address
  tailBorrowOrders: Array<types.BorrowOrderFields>
  padding3: Array<BN>
}

export interface ObligationJSON {
  tag: string
  lastUpdate: types.LastUpdateJSON
  lendingMarket: string
  owner: string
  deposits: Array<types.ObligationCollateralJSON>
  lowestReserveDepositLiquidationLtv: string
  depositedValueSf: string
  borrows: Array<types.ObligationLiquidityJSON>
  borrowFactorAdjustedDebtValueSf: string
  borrowedAssetsMarketValueSf: string
  allowedBorrowValueSf: string
  unhealthyBorrowValueSf: string
  paddingDeprecatedAssetTiers: Array<number>
  elevationGroup: number
  numOfObsoleteDepositReserves: number
  hasDebt: number
  referrer: string
  borrowingDisabled: number
  autodeleverageTargetLtvPct: number
  lowestReserveDepositMaxLtvPct: number
  numOfObsoleteBorrowReserves: number
  ownershipTransferState: number
  reserved: Array<number>
  highestBorrowFactorPct: string
  autodeleverageMarginCallStartedTimestamp: string
  obligationOrders: Array<types.ObligationOrderJSON>
  headBorrowOrder: types.BorrowOrderJSON
  pendingOwner: string
  tailBorrowOrders: Array<types.BorrowOrderJSON>
  padding3: Array<string>
}

export class Obligation {
  readonly tag: BN
  readonly lastUpdate: types.LastUpdate
  readonly lendingMarket: Address
  readonly owner: Address
  readonly deposits: Array<types.ObligationCollateral>
  readonly lowestReserveDepositLiquidationLtv: BN
  readonly depositedValueSf: BN
  readonly borrows: Array<types.ObligationLiquidity>
  readonly borrowFactorAdjustedDebtValueSf: BN
  readonly borrowedAssetsMarketValueSf: BN
  readonly allowedBorrowValueSf: BN
  readonly unhealthyBorrowValueSf: BN
  readonly paddingDeprecatedAssetTiers: Array<number>
  readonly elevationGroup: number
  readonly numOfObsoleteDepositReserves: number
  readonly hasDebt: number
  readonly referrer: Address
  readonly borrowingDisabled: number
  readonly autodeleverageTargetLtvPct: number
  readonly lowestReserveDepositMaxLtvPct: number
  readonly numOfObsoleteBorrowReserves: number
  readonly ownershipTransferState: number
  readonly reserved: Array<number>
  readonly highestBorrowFactorPct: BN
  readonly autodeleverageMarginCallStartedTimestamp: BN
  readonly obligationOrders: Array<types.ObligationOrder>
  readonly headBorrowOrder: types.BorrowOrder
  readonly pendingOwner: Address
  readonly tailBorrowOrders: Array<types.BorrowOrder>
  readonly padding3: Array<BN>

  static readonly discriminator = Buffer.from([
    168, 206, 141, 106, 88, 76, 172, 167,
  ])

  static readonly layout = borsh.struct<Obligation>([
    borsh.u64("tag"),
    types.LastUpdate.layout("lastUpdate"),
    borshAddress("lendingMarket"),
    borshAddress("owner"),
    borsh.array(types.ObligationCollateral.layout(), 8, "deposits"),
    borsh.u64("lowestReserveDepositLiquidationLtv"),
    borsh.u128("depositedValueSf"),
    borsh.array(types.ObligationLiquidity.layout(), 5, "borrows"),
    borsh.u128("borrowFactorAdjustedDebtValueSf"),
    borsh.u128("borrowedAssetsMarketValueSf"),
    borsh.u128("allowedBorrowValueSf"),
    borsh.u128("unhealthyBorrowValueSf"),
    borsh.array(borsh.u8(), 13, "paddingDeprecatedAssetTiers"),
    borsh.u8("elevationGroup"),
    borsh.u8("numOfObsoleteDepositReserves"),
    borsh.u8("hasDebt"),
    borshAddress("referrer"),
    borsh.u8("borrowingDisabled"),
    borsh.u8("autodeleverageTargetLtvPct"),
    borsh.u8("lowestReserveDepositMaxLtvPct"),
    borsh.u8("numOfObsoleteBorrowReserves"),
    borsh.u8("ownershipTransferState"),
    borsh.array(borsh.u8(), 3, "reserved"),
    borsh.u64("highestBorrowFactorPct"),
    borsh.u64("autodeleverageMarginCallStartedTimestamp"),
    borsh.array(types.ObligationOrder.layout(), 2, "obligationOrders"),
    types.BorrowOrder.layout("headBorrowOrder"),
    borshAddress("pendingOwner"),
    borsh.array(types.BorrowOrder.layout(), 2, "tailBorrowOrders"),
    borsh.array(borsh.u64(), 29, "padding3"),
  ])

  constructor(fields: ObligationFields) {
    this.tag = fields.tag
    this.lastUpdate = new types.LastUpdate({ ...fields.lastUpdate })
    this.lendingMarket = fields.lendingMarket
    this.owner = fields.owner
    this.deposits = fields.deposits.map(
      (item) => new types.ObligationCollateral({ ...item })
    )
    this.lowestReserveDepositLiquidationLtv =
      fields.lowestReserveDepositLiquidationLtv
    this.depositedValueSf = fields.depositedValueSf
    this.borrows = fields.borrows.map(
      (item) => new types.ObligationLiquidity({ ...item })
    )
    this.borrowFactorAdjustedDebtValueSf =
      fields.borrowFactorAdjustedDebtValueSf
    this.borrowedAssetsMarketValueSf = fields.borrowedAssetsMarketValueSf
    this.allowedBorrowValueSf = fields.allowedBorrowValueSf
    this.unhealthyBorrowValueSf = fields.unhealthyBorrowValueSf
    this.paddingDeprecatedAssetTiers = fields.paddingDeprecatedAssetTiers
    this.elevationGroup = fields.elevationGroup
    this.numOfObsoleteDepositReserves = fields.numOfObsoleteDepositReserves
    this.hasDebt = fields.hasDebt
    this.referrer = fields.referrer
    this.borrowingDisabled = fields.borrowingDisabled
    this.autodeleverageTargetLtvPct = fields.autodeleverageTargetLtvPct
    this.lowestReserveDepositMaxLtvPct = fields.lowestReserveDepositMaxLtvPct
    this.numOfObsoleteBorrowReserves = fields.numOfObsoleteBorrowReserves
    this.ownershipTransferState = fields.ownershipTransferState
    this.reserved = fields.reserved
    this.highestBorrowFactorPct = fields.highestBorrowFactorPct
    this.autodeleverageMarginCallStartedTimestamp =
      fields.autodeleverageMarginCallStartedTimestamp
    this.obligationOrders = fields.obligationOrders.map(
      (item) => new types.ObligationOrder({ ...item })
    )
    this.headBorrowOrder = new types.BorrowOrder({ ...fields.headBorrowOrder })
    this.pendingOwner = fields.pendingOwner
    this.tailBorrowOrders = fields.tailBorrowOrders.map(
      (item) => new types.BorrowOrder({ ...item })
    )
    this.padding3 = fields.padding3
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<Obligation | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ObligationFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<Obligation | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ObligationFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): Obligation {
    if (!data.slice(0, 8).equals(Obligation.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Obligation.layout.decode(data.slice(8))

    return new Obligation({
      tag: dec.tag,
      lastUpdate: types.LastUpdate.fromDecoded(dec.lastUpdate),
      lendingMarket: dec.lendingMarket,
      owner: dec.owner,
      deposits: dec.deposits.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ObligationCollateral.fromDecoded(item)
      ),
      lowestReserveDepositLiquidationLtv:
        dec.lowestReserveDepositLiquidationLtv,
      depositedValueSf: dec.depositedValueSf,
      borrows: dec.borrows.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ObligationLiquidity.fromDecoded(item)
      ),
      borrowFactorAdjustedDebtValueSf: dec.borrowFactorAdjustedDebtValueSf,
      borrowedAssetsMarketValueSf: dec.borrowedAssetsMarketValueSf,
      allowedBorrowValueSf: dec.allowedBorrowValueSf,
      unhealthyBorrowValueSf: dec.unhealthyBorrowValueSf,
      paddingDeprecatedAssetTiers: dec.paddingDeprecatedAssetTiers,
      elevationGroup: dec.elevationGroup,
      numOfObsoleteDepositReserves: dec.numOfObsoleteDepositReserves,
      hasDebt: dec.hasDebt,
      referrer: dec.referrer,
      borrowingDisabled: dec.borrowingDisabled,
      autodeleverageTargetLtvPct: dec.autodeleverageTargetLtvPct,
      lowestReserveDepositMaxLtvPct: dec.lowestReserveDepositMaxLtvPct,
      numOfObsoleteBorrowReserves: dec.numOfObsoleteBorrowReserves,
      ownershipTransferState: dec.ownershipTransferState,
      reserved: dec.reserved,
      highestBorrowFactorPct: dec.highestBorrowFactorPct,
      autodeleverageMarginCallStartedTimestamp:
        dec.autodeleverageMarginCallStartedTimestamp,
      obligationOrders: dec.obligationOrders.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.ObligationOrder.fromDecoded(item)
      ),
      headBorrowOrder: types.BorrowOrder.fromDecoded(dec.headBorrowOrder),
      pendingOwner: dec.pendingOwner,
      tailBorrowOrders: dec.tailBorrowOrders.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.BorrowOrder.fromDecoded(item)
      ),
      padding3: dec.padding3,
    })
  }

  toJSON(): ObligationJSON {
    return {
      tag: this.tag.toString(),
      lastUpdate: this.lastUpdate.toJSON(),
      lendingMarket: this.lendingMarket,
      owner: this.owner,
      deposits: this.deposits.map((item) => item.toJSON()),
      lowestReserveDepositLiquidationLtv:
        this.lowestReserveDepositLiquidationLtv.toString(),
      depositedValueSf: this.depositedValueSf.toString(),
      borrows: this.borrows.map((item) => item.toJSON()),
      borrowFactorAdjustedDebtValueSf:
        this.borrowFactorAdjustedDebtValueSf.toString(),
      borrowedAssetsMarketValueSf: this.borrowedAssetsMarketValueSf.toString(),
      allowedBorrowValueSf: this.allowedBorrowValueSf.toString(),
      unhealthyBorrowValueSf: this.unhealthyBorrowValueSf.toString(),
      paddingDeprecatedAssetTiers: this.paddingDeprecatedAssetTiers,
      elevationGroup: this.elevationGroup,
      numOfObsoleteDepositReserves: this.numOfObsoleteDepositReserves,
      hasDebt: this.hasDebt,
      referrer: this.referrer,
      borrowingDisabled: this.borrowingDisabled,
      autodeleverageTargetLtvPct: this.autodeleverageTargetLtvPct,
      lowestReserveDepositMaxLtvPct: this.lowestReserveDepositMaxLtvPct,
      numOfObsoleteBorrowReserves: this.numOfObsoleteBorrowReserves,
      ownershipTransferState: this.ownershipTransferState,
      reserved: this.reserved,
      highestBorrowFactorPct: this.highestBorrowFactorPct.toString(),
      autodeleverageMarginCallStartedTimestamp:
        this.autodeleverageMarginCallStartedTimestamp.toString(),
      obligationOrders: this.obligationOrders.map((item) => item.toJSON()),
      headBorrowOrder: this.headBorrowOrder.toJSON(),
      pendingOwner: this.pendingOwner,
      tailBorrowOrders: this.tailBorrowOrders.map((item) => item.toJSON()),
      padding3: this.padding3.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObligationJSON): Obligation {
    return new Obligation({
      tag: new BN(obj.tag),
      lastUpdate: types.LastUpdate.fromJSON(obj.lastUpdate),
      lendingMarket: address(obj.lendingMarket),
      owner: address(obj.owner),
      deposits: obj.deposits.map((item) =>
        types.ObligationCollateral.fromJSON(item)
      ),
      lowestReserveDepositLiquidationLtv: new BN(
        obj.lowestReserveDepositLiquidationLtv
      ),
      depositedValueSf: new BN(obj.depositedValueSf),
      borrows: obj.borrows.map((item) =>
        types.ObligationLiquidity.fromJSON(item)
      ),
      borrowFactorAdjustedDebtValueSf: new BN(
        obj.borrowFactorAdjustedDebtValueSf
      ),
      borrowedAssetsMarketValueSf: new BN(obj.borrowedAssetsMarketValueSf),
      allowedBorrowValueSf: new BN(obj.allowedBorrowValueSf),
      unhealthyBorrowValueSf: new BN(obj.unhealthyBorrowValueSf),
      paddingDeprecatedAssetTiers: obj.paddingDeprecatedAssetTiers,
      elevationGroup: obj.elevationGroup,
      numOfObsoleteDepositReserves: obj.numOfObsoleteDepositReserves,
      hasDebt: obj.hasDebt,
      referrer: address(obj.referrer),
      borrowingDisabled: obj.borrowingDisabled,
      autodeleverageTargetLtvPct: obj.autodeleverageTargetLtvPct,
      lowestReserveDepositMaxLtvPct: obj.lowestReserveDepositMaxLtvPct,
      numOfObsoleteBorrowReserves: obj.numOfObsoleteBorrowReserves,
      ownershipTransferState: obj.ownershipTransferState,
      reserved: obj.reserved,
      highestBorrowFactorPct: new BN(obj.highestBorrowFactorPct),
      autodeleverageMarginCallStartedTimestamp: new BN(
        obj.autodeleverageMarginCallStartedTimestamp
      ),
      obligationOrders: obj.obligationOrders.map((item) =>
        types.ObligationOrder.fromJSON(item)
      ),
      headBorrowOrder: types.BorrowOrder.fromJSON(obj.headBorrowOrder),
      pendingOwner: address(obj.pendingOwner),
      tailBorrowOrders: obj.tailBorrowOrders.map((item) =>
        types.BorrowOrder.fromJSON(item)
      ),
      padding3: obj.padding3.map((item) => new BN(item)),
    })
  }
}
