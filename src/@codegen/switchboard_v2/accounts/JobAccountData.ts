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

export interface JobAccountDataFields {
  name: Array<number>
  metadata: Array<number>
  authority: Address
  expiration: BN
  hash: Array<number>
  data: Uint8Array
  referenceCount: number
  totalSpent: BN
  createdAt: BN
  isInitializing: number
}

export interface JobAccountDataJSON {
  name: Array<number>
  metadata: Array<number>
  authority: string
  expiration: string
  hash: Array<number>
  data: Array<number>
  referenceCount: number
  totalSpent: string
  createdAt: string
  isInitializing: number
}

export class JobAccountData {
  readonly name: Array<number>
  readonly metadata: Array<number>
  readonly authority: Address
  readonly expiration: BN
  readonly hash: Array<number>
  readonly data: Uint8Array
  readonly referenceCount: number
  readonly totalSpent: BN
  readonly createdAt: BN
  readonly isInitializing: number

  static readonly discriminator = Buffer.from([
    124, 69, 101, 195, 229, 218, 144, 63,
  ])

  static readonly layout = borsh.struct<JobAccountData>([
    borsh.array(borsh.u8(), 32, "name"),
    borsh.array(borsh.u8(), 64, "metadata"),
    borshAddress("authority"),
    borsh.i64("expiration"),
    borsh.array(borsh.u8(), 32, "hash"),
    borsh.vecU8("data"),
    borsh.u32("referenceCount"),
    borsh.u64("totalSpent"),
    borsh.i64("createdAt"),
    borsh.u8("isInitializing"),
  ])

  constructor(fields: JobAccountDataFields) {
    this.name = fields.name
    this.metadata = fields.metadata
    this.authority = fields.authority
    this.expiration = fields.expiration
    this.hash = fields.hash
    this.data = fields.data
    this.referenceCount = fields.referenceCount
    this.totalSpent = fields.totalSpent
    this.createdAt = fields.createdAt
    this.isInitializing = fields.isInitializing
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<JobAccountData | null> {
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
  ): Promise<Array<JobAccountData | null>> {
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

  static decode(data: Buffer): JobAccountData {
    if (!data.slice(0, 8).equals(JobAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = JobAccountData.layout.decode(data.slice(8))

    return new JobAccountData({
      name: dec.name,
      metadata: dec.metadata,
      authority: dec.authority,
      expiration: dec.expiration,
      hash: dec.hash,
      data: new Uint8Array(
        dec.data.buffer,
        dec.data.byteOffset,
        dec.data.length
      ),
      referenceCount: dec.referenceCount,
      totalSpent: dec.totalSpent,
      createdAt: dec.createdAt,
      isInitializing: dec.isInitializing,
    })
  }

  toJSON(): JobAccountDataJSON {
    return {
      name: this.name,
      metadata: this.metadata,
      authority: this.authority,
      expiration: this.expiration.toString(),
      hash: this.hash,
      data: Array.from(this.data.values()),
      referenceCount: this.referenceCount,
      totalSpent: this.totalSpent.toString(),
      createdAt: this.createdAt.toString(),
      isInitializing: this.isInitializing,
    }
  }

  static fromJSON(obj: JobAccountDataJSON): JobAccountData {
    return new JobAccountData({
      name: obj.name,
      metadata: obj.metadata,
      authority: address(obj.authority),
      expiration: new BN(obj.expiration),
      hash: obj.hash,
      data: Uint8Array.from(obj.data),
      referenceCount: obj.referenceCount,
      totalSpent: new BN(obj.totalSpent),
      createdAt: new BN(obj.createdAt),
      isInitializing: obj.isInitializing,
    })
  }
}
