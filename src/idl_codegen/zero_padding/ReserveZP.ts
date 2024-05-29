import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"
import { Reserve, ReserveFields } from '../accounts';

/** Lending market reserve state with padding truncated */
export class ReserveZP {
  /** Version of the reserve */
  readonly version: BN
  /** Last slot when supply and rates updated */
  readonly lastUpdate: types.LastUpdate
  /** Lending market address */
  readonly lendingMarket: PublicKey
  readonly farmCollateral: PublicKey
  readonly farmDebt: PublicKey
  /** Reserve liquidity */
  readonly liquidity: types.ReserveLiquidity
  readonly reserveLiquidityPadding: Array<BN>
  /** Reserve collateral */
  readonly collateral: types.ReserveCollateral
  readonly reserveCollateralPadding: Array<BN>
  /** Reserve configuration values */
  readonly config: types.ReserveConfig
  readonly configPadding: Array<BN>
  readonly padding: Array<BN>

  static readonly layout = borsh.struct([
    borsh.u64("version"),
    types.LastUpdate.layout("lastUpdate"),
    borsh.publicKey("lendingMarket"),
    borsh.publicKey("farmCollateral"),
    borsh.publicKey("farmDebt"),
    types.ReserveLiquidity.layout("liquidity"),
    borsh.array(borsh.u64(), 150, "reserveLiquidityPadding"),
    types.ReserveCollateral.layout("collateral"),
    borsh.array(borsh.u64(), 150, "reserveCollateralPadding"),
    types.ReserveConfig.layout("config"),
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
    this.configPadding = new Array<BN>(0)
    this.padding = new Array<BN>(0)
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<Reserve | null> {
    const info = await c.getAccountInfo(address)

    if (info === null) {
      return null
    }
    if (!info.owner.equals(programId)) {
      throw new Error("account doesn't belong to this program")
    }

    return this.decode(info.data)
  }

  static async fetchMultiple(
    c: Connection,
    addresses: PublicKey[],
    programId: PublicKey = PROGRAM_ID
  ): Promise<Array<Reserve | null>> {
    const infos = await c.getMultipleAccountsInfo(addresses)

    return infos.map((info) => {
      if (info === null) {
        return null
      }
      if (!info.owner.equals(programId)) {
        throw new Error("account doesn't belong to this program")
      }

      return this.decode(info.data)
    })
  }

  static decode(data: Buffer): Reserve {
    if (!data.slice(0, 8).equals(Reserve.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = ReserveZP.layout.decode(data.slice(8))

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
      configPadding: [],
      padding: [],
    })
  }
}
