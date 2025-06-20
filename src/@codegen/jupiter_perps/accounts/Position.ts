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

export interface PositionFields {
  owner: Address
  pool: Address
  custody: Address
  collateralCustody: Address
  openTime: BN
  updateTime: BN
  side: types.SideKind
  price: BN
  sizeUsd: BN
  collateralUsd: BN
  realisedPnlUsd: BN
  cumulativeInterestSnapshot: BN
  lockedAmount: BN
  bump: number
}

export interface PositionJSON {
  owner: string
  pool: string
  custody: string
  collateralCustody: string
  openTime: string
  updateTime: string
  side: types.SideJSON
  price: string
  sizeUsd: string
  collateralUsd: string
  realisedPnlUsd: string
  cumulativeInterestSnapshot: string
  lockedAmount: string
  bump: number
}

export class Position {
  readonly owner: Address
  readonly pool: Address
  readonly custody: Address
  readonly collateralCustody: Address
  readonly openTime: BN
  readonly updateTime: BN
  readonly side: types.SideKind
  readonly price: BN
  readonly sizeUsd: BN
  readonly collateralUsd: BN
  readonly realisedPnlUsd: BN
  readonly cumulativeInterestSnapshot: BN
  readonly lockedAmount: BN
  readonly bump: number

  static readonly discriminator = Buffer.from([
    170, 188, 143, 228, 122, 64, 247, 208,
  ])

  static readonly layout = borsh.struct<Position>([
    borshAddress("owner"),
    borshAddress("pool"),
    borshAddress("custody"),
    borshAddress("collateralCustody"),
    borsh.i64("openTime"),
    borsh.i64("updateTime"),
    types.Side.layout("side"),
    borsh.u64("price"),
    borsh.u64("sizeUsd"),
    borsh.u64("collateralUsd"),
    borsh.i64("realisedPnlUsd"),
    borsh.u128("cumulativeInterestSnapshot"),
    borsh.u64("lockedAmount"),
    borsh.u8("bump"),
  ])

  constructor(fields: PositionFields) {
    this.owner = fields.owner
    this.pool = fields.pool
    this.custody = fields.custody
    this.collateralCustody = fields.collateralCustody
    this.openTime = fields.openTime
    this.updateTime = fields.updateTime
    this.side = fields.side
    this.price = fields.price
    this.sizeUsd = fields.sizeUsd
    this.collateralUsd = fields.collateralUsd
    this.realisedPnlUsd = fields.realisedPnlUsd
    this.cumulativeInterestSnapshot = fields.cumulativeInterestSnapshot
    this.lockedAmount = fields.lockedAmount
    this.bump = fields.bump
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<Position | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error("account doesn't belong to this program")
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<Position | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error("account doesn't belong to this program")
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): Position {
    if (!data.slice(0, 8).equals(Position.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Position.layout.decode(data.slice(8))

    return new Position({
      owner: dec.owner,
      pool: dec.pool,
      custody: dec.custody,
      collateralCustody: dec.collateralCustody,
      openTime: dec.openTime,
      updateTime: dec.updateTime,
      side: types.Side.fromDecoded(dec.side),
      price: dec.price,
      sizeUsd: dec.sizeUsd,
      collateralUsd: dec.collateralUsd,
      realisedPnlUsd: dec.realisedPnlUsd,
      cumulativeInterestSnapshot: dec.cumulativeInterestSnapshot,
      lockedAmount: dec.lockedAmount,
      bump: dec.bump,
    })
  }

  toJSON(): PositionJSON {
    return {
      owner: this.owner,
      pool: this.pool,
      custody: this.custody,
      collateralCustody: this.collateralCustody,
      openTime: this.openTime.toString(),
      updateTime: this.updateTime.toString(),
      side: this.side.toJSON(),
      price: this.price.toString(),
      sizeUsd: this.sizeUsd.toString(),
      collateralUsd: this.collateralUsd.toString(),
      realisedPnlUsd: this.realisedPnlUsd.toString(),
      cumulativeInterestSnapshot: this.cumulativeInterestSnapshot.toString(),
      lockedAmount: this.lockedAmount.toString(),
      bump: this.bump,
    }
  }

  static fromJSON(obj: PositionJSON): Position {
    return new Position({
      owner: address(obj.owner),
      pool: address(obj.pool),
      custody: address(obj.custody),
      collateralCustody: address(obj.collateralCustody),
      openTime: new BN(obj.openTime),
      updateTime: new BN(obj.updateTime),
      side: types.Side.fromJSON(obj.side),
      price: new BN(obj.price),
      sizeUsd: new BN(obj.sizeUsd),
      collateralUsd: new BN(obj.collateralUsd),
      realisedPnlUsd: new BN(obj.realisedPnlUsd),
      cumulativeInterestSnapshot: new BN(obj.cumulativeInterestSnapshot),
      lockedAmount: new BN(obj.lockedAmount),
      bump: obj.bump,
    })
  }
}
