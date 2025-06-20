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

export interface TaskSpecRecordFields {
  hash: types.HashFields
}

export interface TaskSpecRecordJSON {
  hash: types.HashJSON
}

export class TaskSpecRecord {
  readonly hash: types.Hash

  static readonly discriminator = Buffer.from([
    202, 10, 194, 236, 111, 47, 234, 48,
  ])

  static readonly layout = borsh.struct<TaskSpecRecord>([
    types.Hash.layout("hash"),
  ])

  constructor(fields: TaskSpecRecordFields) {
    this.hash = new types.Hash({ ...fields.hash })
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<TaskSpecRecord | null> {
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
  ): Promise<Array<TaskSpecRecord | null>> {
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

  static decode(data: Buffer): TaskSpecRecord {
    if (!data.slice(0, 8).equals(TaskSpecRecord.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = TaskSpecRecord.layout.decode(data.slice(8))

    return new TaskSpecRecord({
      hash: types.Hash.fromDecoded(dec.hash),
    })
  }

  toJSON(): TaskSpecRecordJSON {
    return {
      hash: this.hash.toJSON(),
    }
  }

  static fromJSON(obj: TaskSpecRecordJSON): TaskSpecRecord {
    return new TaskSpecRecord({
      hash: types.Hash.fromJSON(obj.hash),
    })
  }
}
