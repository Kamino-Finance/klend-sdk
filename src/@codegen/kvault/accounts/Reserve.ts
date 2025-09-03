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

export interface ReserveFields {
  /** Version of the reserve */
  version: BN
  /** Last slot when supply and rates updated */
  lastUpdate: types.LastUpdateFields
  /** Lending market address */
  lendingMarket: Address
  farmCollateral: Address
  farmDebt: Address
  /** Reserve liquidity */
  liquidity: types.ReserveLiquidityFields
  reserveLiquidityPadding: Array<BN>
  /** Reserve collateral */
  collateral: types.ReserveCollateralFields
  reserveCollateralPadding: Array<BN>
  /** Reserve configuration values */
  config: types.ReserveConfigFields
  configPadding: Array<BN>
  borrowedAmountOutsideElevationGroup: BN
  /**
   * Amount of token borrowed in lamport of debt asset in the given
   * elevation group when this reserve is part of the collaterals.
   */
  borrowedAmountsAgainstThisReserveInElevationGroups: Array<BN>
  padding: Array<BN>
}

export interface ReserveJSON {
  /** Version of the reserve */
  version: string
  /** Last slot when supply and rates updated */
  lastUpdate: types.LastUpdateJSON
  /** Lending market address */
  lendingMarket: string
  farmCollateral: string
  farmDebt: string
  /** Reserve liquidity */
  liquidity: types.ReserveLiquidityJSON
  reserveLiquidityPadding: Array<string>
  /** Reserve collateral */
  collateral: types.ReserveCollateralJSON
  reserveCollateralPadding: Array<string>
  /** Reserve configuration values */
  config: types.ReserveConfigJSON
  configPadding: Array<string>
  borrowedAmountOutsideElevationGroup: string
  /**
   * Amount of token borrowed in lamport of debt asset in the given
   * elevation group when this reserve is part of the collaterals.
   */
  borrowedAmountsAgainstThisReserveInElevationGroups: Array<string>
  padding: Array<string>
}

export class Reserve {
  /** Version of the reserve */
  readonly version: BN
  /** Last slot when supply and rates updated */
  readonly lastUpdate: types.LastUpdate
  /** Lending market address */
  readonly lendingMarket: Address
  readonly farmCollateral: Address
  readonly farmDebt: Address
  /** Reserve liquidity */
  readonly liquidity: types.ReserveLiquidity
  readonly reserveLiquidityPadding: Array<BN>
  /** Reserve collateral */
  readonly collateral: types.ReserveCollateral
  readonly reserveCollateralPadding: Array<BN>
  /** Reserve configuration values */
  readonly config: types.ReserveConfig
  readonly configPadding: Array<BN>
  readonly borrowedAmountOutsideElevationGroup: BN
  /**
   * Amount of token borrowed in lamport of debt asset in the given
   * elevation group when this reserve is part of the collaterals.
   */
  readonly borrowedAmountsAgainstThisReserveInElevationGroups: Array<BN>
  readonly padding: Array<BN>

  static readonly discriminator = Buffer.from([
    43, 242, 204, 202, 26, 247, 59, 127,
  ])

  static readonly layout = borsh.struct<Reserve>([
    borsh.u64("version"),
    types.LastUpdate.layout("lastUpdate"),
    borshAddress("lendingMarket"),
    borshAddress("farmCollateral"),
    borshAddress("farmDebt"),
    types.ReserveLiquidity.layout("liquidity"),
    borsh.array(borsh.u64(), 150, "reserveLiquidityPadding"),
    types.ReserveCollateral.layout("collateral"),
    borsh.array(borsh.u64(), 150, "reserveCollateralPadding"),
    types.ReserveConfig.layout("config"),
    borsh.array(borsh.u64(), 115, "configPadding"),
    borsh.u64("borrowedAmountOutsideElevationGroup"),
    borsh.array(
      borsh.u64(),
      32,
      "borrowedAmountsAgainstThisReserveInElevationGroups"
    ),
    borsh.array(borsh.u64(), 207, "padding"),
  ])

  constructor(fields: ReserveFields) {
    this.version = fields.version
    this.lastUpdate = new types.LastUpdate({ ...fields.lastUpdate })
    this.lendingMarket = fields.lendingMarket
    this.farmCollateral = fields.farmCollateral
    this.farmDebt = fields.farmDebt
    this.liquidity = new types.ReserveLiquidity({ ...fields.liquidity })
    this.reserveLiquidityPadding = fields.reserveLiquidityPadding
    this.collateral = new types.ReserveCollateral({ ...fields.collateral })
    this.reserveCollateralPadding = fields.reserveCollateralPadding
    this.config = new types.ReserveConfig({ ...fields.config })
    this.configPadding = fields.configPadding
    this.borrowedAmountOutsideElevationGroup =
      fields.borrowedAmountOutsideElevationGroup
    this.borrowedAmountsAgainstThisReserveInElevationGroups =
      fields.borrowedAmountsAgainstThisReserveInElevationGroups
    this.padding = fields.padding
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<Reserve | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ReserveFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<Reserve | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ReserveFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): Reserve {
    if (!data.slice(0, 8).equals(Reserve.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Reserve.layout.decode(data.slice(8))

    return new Reserve({
      version: dec.version,
      lastUpdate: types.LastUpdate.fromDecoded(dec.lastUpdate),
      lendingMarket: dec.lendingMarket,
      farmCollateral: dec.farmCollateral,
      farmDebt: dec.farmDebt,
      liquidity: types.ReserveLiquidity.fromDecoded(dec.liquidity),
      reserveLiquidityPadding: dec.reserveLiquidityPadding,
      collateral: types.ReserveCollateral.fromDecoded(dec.collateral),
      reserveCollateralPadding: dec.reserveCollateralPadding,
      config: types.ReserveConfig.fromDecoded(dec.config),
      configPadding: dec.configPadding,
      borrowedAmountOutsideElevationGroup:
        dec.borrowedAmountOutsideElevationGroup,
      borrowedAmountsAgainstThisReserveInElevationGroups:
        dec.borrowedAmountsAgainstThisReserveInElevationGroups,
      padding: dec.padding,
    })
  }

  toJSON(): ReserveJSON {
    return {
      version: this.version.toString(),
      lastUpdate: this.lastUpdate.toJSON(),
      lendingMarket: this.lendingMarket,
      farmCollateral: this.farmCollateral,
      farmDebt: this.farmDebt,
      liquidity: this.liquidity.toJSON(),
      reserveLiquidityPadding: this.reserveLiquidityPadding.map((item) =>
        item.toString()
      ),
      collateral: this.collateral.toJSON(),
      reserveCollateralPadding: this.reserveCollateralPadding.map((item) =>
        item.toString()
      ),
      config: this.config.toJSON(),
      configPadding: this.configPadding.map((item) => item.toString()),
      borrowedAmountOutsideElevationGroup:
        this.borrowedAmountOutsideElevationGroup.toString(),
      borrowedAmountsAgainstThisReserveInElevationGroups:
        this.borrowedAmountsAgainstThisReserveInElevationGroups.map((item) =>
          item.toString()
        ),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ReserveJSON): Reserve {
    return new Reserve({
      version: new BN(obj.version),
      lastUpdate: types.LastUpdate.fromJSON(obj.lastUpdate),
      lendingMarket: address(obj.lendingMarket),
      farmCollateral: address(obj.farmCollateral),
      farmDebt: address(obj.farmDebt),
      liquidity: types.ReserveLiquidity.fromJSON(obj.liquidity),
      reserveLiquidityPadding: obj.reserveLiquidityPadding.map(
        (item) => new BN(item)
      ),
      collateral: types.ReserveCollateral.fromJSON(obj.collateral),
      reserveCollateralPadding: obj.reserveCollateralPadding.map(
        (item) => new BN(item)
      ),
      config: types.ReserveConfig.fromJSON(obj.config),
      configPadding: obj.configPadding.map((item) => new BN(item)),
      borrowedAmountOutsideElevationGroup: new BN(
        obj.borrowedAmountOutsideElevationGroup
      ),
      borrowedAmountsAgainstThisReserveInElevationGroups:
        obj.borrowedAmountsAgainstThisReserveInElevationGroups.map(
          (item) => new BN(item)
        ),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }
}
