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

export interface LeaseAccountDataFields {
  escrow: Address
  queue: Address
  aggregator: Address
  tokenProgram: Address
  isActive: boolean
  crankRowCount: number
  createdAt: BN
  updateCount: BN
  withdrawAuthority: Address
  ebuf: Array<number>
}

export interface LeaseAccountDataJSON {
  escrow: string
  queue: string
  aggregator: string
  tokenProgram: string
  isActive: boolean
  crankRowCount: number
  createdAt: string
  updateCount: string
  withdrawAuthority: string
  ebuf: Array<number>
}

export class LeaseAccountData {
  readonly escrow: Address
  readonly queue: Address
  readonly aggregator: Address
  readonly tokenProgram: Address
  readonly isActive: boolean
  readonly crankRowCount: number
  readonly createdAt: BN
  readonly updateCount: BN
  readonly withdrawAuthority: Address
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([
    55, 254, 208, 251, 164, 44, 150, 50,
  ])

  static readonly layout = borsh.struct<LeaseAccountData>([
    borshAddress("escrow"),
    borshAddress("queue"),
    borshAddress("aggregator"),
    borshAddress("tokenProgram"),
    borsh.bool("isActive"),
    borsh.u32("crankRowCount"),
    borsh.i64("createdAt"),
    borsh.u128("updateCount"),
    borshAddress("withdrawAuthority"),
    borsh.array(borsh.u8(), 256, "ebuf"),
  ])

  constructor(fields: LeaseAccountDataFields) {
    this.escrow = fields.escrow
    this.queue = fields.queue
    this.aggregator = fields.aggregator
    this.tokenProgram = fields.tokenProgram
    this.isActive = fields.isActive
    this.crankRowCount = fields.crankRowCount
    this.createdAt = fields.createdAt
    this.updateCount = fields.updateCount
    this.withdrawAuthority = fields.withdrawAuthority
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<LeaseAccountData | null> {
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
  ): Promise<Array<LeaseAccountData | null>> {
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

  static decode(data: Buffer): LeaseAccountData {
    if (!data.slice(0, 8).equals(LeaseAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = LeaseAccountData.layout.decode(data.slice(8))

    return new LeaseAccountData({
      escrow: dec.escrow,
      queue: dec.queue,
      aggregator: dec.aggregator,
      tokenProgram: dec.tokenProgram,
      isActive: dec.isActive,
      crankRowCount: dec.crankRowCount,
      createdAt: dec.createdAt,
      updateCount: dec.updateCount,
      withdrawAuthority: dec.withdrawAuthority,
      ebuf: dec.ebuf,
    })
  }

  toJSON(): LeaseAccountDataJSON {
    return {
      escrow: this.escrow,
      queue: this.queue,
      aggregator: this.aggregator,
      tokenProgram: this.tokenProgram,
      isActive: this.isActive,
      crankRowCount: this.crankRowCount,
      createdAt: this.createdAt.toString(),
      updateCount: this.updateCount.toString(),
      withdrawAuthority: this.withdrawAuthority,
      ebuf: this.ebuf,
    }
  }

  static fromJSON(obj: LeaseAccountDataJSON): LeaseAccountData {
    return new LeaseAccountData({
      escrow: address(obj.escrow),
      queue: address(obj.queue),
      aggregator: address(obj.aggregator),
      tokenProgram: address(obj.tokenProgram),
      isActive: obj.isActive,
      crankRowCount: obj.crankRowCount,
      createdAt: new BN(obj.createdAt),
      updateCount: new BN(obj.updateCount),
      withdrawAuthority: address(obj.withdrawAuthority),
      ebuf: obj.ebuf,
    })
  }
}
