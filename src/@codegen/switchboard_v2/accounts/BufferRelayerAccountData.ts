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

export interface BufferRelayerAccountDataFields {
  name: Array<number>
  queuePubkey: Address
  escrow: Address
  authority: Address
  jobPubkey: Address
  jobHash: Array<number>
  minUpdateDelaySeconds: number
  isLocked: boolean
  currentRound: types.BufferRelayerRoundFields
  latestConfirmedRound: types.BufferRelayerRoundFields
  result: Uint8Array
}

export interface BufferRelayerAccountDataJSON {
  name: Array<number>
  queuePubkey: string
  escrow: string
  authority: string
  jobPubkey: string
  jobHash: Array<number>
  minUpdateDelaySeconds: number
  isLocked: boolean
  currentRound: types.BufferRelayerRoundJSON
  latestConfirmedRound: types.BufferRelayerRoundJSON
  result: Array<number>
}

export class BufferRelayerAccountData {
  readonly name: Array<number>
  readonly queuePubkey: Address
  readonly escrow: Address
  readonly authority: Address
  readonly jobPubkey: Address
  readonly jobHash: Array<number>
  readonly minUpdateDelaySeconds: number
  readonly isLocked: boolean
  readonly currentRound: types.BufferRelayerRound
  readonly latestConfirmedRound: types.BufferRelayerRound
  readonly result: Uint8Array

  static readonly discriminator = Buffer.from([
    50, 35, 51, 115, 169, 219, 158, 52,
  ])

  static readonly layout = borsh.struct<BufferRelayerAccountData>([
    borsh.array(borsh.u8(), 32, "name"),
    borshAddress("queuePubkey"),
    borshAddress("escrow"),
    borshAddress("authority"),
    borshAddress("jobPubkey"),
    borsh.array(borsh.u8(), 32, "jobHash"),
    borsh.u32("minUpdateDelaySeconds"),
    borsh.bool("isLocked"),
    types.BufferRelayerRound.layout("currentRound"),
    types.BufferRelayerRound.layout("latestConfirmedRound"),
    borsh.vecU8("result"),
  ])

  constructor(fields: BufferRelayerAccountDataFields) {
    this.name = fields.name
    this.queuePubkey = fields.queuePubkey
    this.escrow = fields.escrow
    this.authority = fields.authority
    this.jobPubkey = fields.jobPubkey
    this.jobHash = fields.jobHash
    this.minUpdateDelaySeconds = fields.minUpdateDelaySeconds
    this.isLocked = fields.isLocked
    this.currentRound = new types.BufferRelayerRound({ ...fields.currentRound })
    this.latestConfirmedRound = new types.BufferRelayerRound({
      ...fields.latestConfirmedRound,
    })
    this.result = fields.result
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<BufferRelayerAccountData | null> {
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
  ): Promise<Array<BufferRelayerAccountData | null>> {
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

  static decode(data: Buffer): BufferRelayerAccountData {
    if (!data.slice(0, 8).equals(BufferRelayerAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = BufferRelayerAccountData.layout.decode(data.slice(8))

    return new BufferRelayerAccountData({
      name: dec.name,
      queuePubkey: dec.queuePubkey,
      escrow: dec.escrow,
      authority: dec.authority,
      jobPubkey: dec.jobPubkey,
      jobHash: dec.jobHash,
      minUpdateDelaySeconds: dec.minUpdateDelaySeconds,
      isLocked: dec.isLocked,
      currentRound: types.BufferRelayerRound.fromDecoded(dec.currentRound),
      latestConfirmedRound: types.BufferRelayerRound.fromDecoded(
        dec.latestConfirmedRound
      ),
      result: new Uint8Array(
        dec.result.buffer,
        dec.result.byteOffset,
        dec.result.length
      ),
    })
  }

  toJSON(): BufferRelayerAccountDataJSON {
    return {
      name: this.name,
      queuePubkey: this.queuePubkey,
      escrow: this.escrow,
      authority: this.authority,
      jobPubkey: this.jobPubkey,
      jobHash: this.jobHash,
      minUpdateDelaySeconds: this.minUpdateDelaySeconds,
      isLocked: this.isLocked,
      currentRound: this.currentRound.toJSON(),
      latestConfirmedRound: this.latestConfirmedRound.toJSON(),
      result: Array.from(this.result.values()),
    }
  }

  static fromJSON(obj: BufferRelayerAccountDataJSON): BufferRelayerAccountData {
    return new BufferRelayerAccountData({
      name: obj.name,
      queuePubkey: address(obj.queuePubkey),
      escrow: address(obj.escrow),
      authority: address(obj.authority),
      jobPubkey: address(obj.jobPubkey),
      jobHash: obj.jobHash,
      minUpdateDelaySeconds: obj.minUpdateDelaySeconds,
      isLocked: obj.isLocked,
      currentRound: types.BufferRelayerRound.fromJSON(obj.currentRound),
      latestConfirmedRound: types.BufferRelayerRound.fromJSON(
        obj.latestConfirmedRound
      ),
      result: Uint8Array.from(obj.result),
    })
  }
}
