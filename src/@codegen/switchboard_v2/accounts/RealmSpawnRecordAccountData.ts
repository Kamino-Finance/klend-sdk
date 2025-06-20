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

export interface RealmSpawnRecordAccountDataFields {
  ebuf: Array<number>
}

export interface RealmSpawnRecordAccountDataJSON {
  ebuf: Array<number>
}

export class RealmSpawnRecordAccountData {
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([229, 116, 99, 2, 145, 96, 5, 95])

  static readonly layout = borsh.struct<RealmSpawnRecordAccountData>([
    borsh.array(borsh.u8(), 256, "ebuf"),
  ])

  constructor(fields: RealmSpawnRecordAccountDataFields) {
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<RealmSpawnRecordAccountData | null> {
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
  ): Promise<Array<RealmSpawnRecordAccountData | null>> {
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

  static decode(data: Buffer): RealmSpawnRecordAccountData {
    if (!data.slice(0, 8).equals(RealmSpawnRecordAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = RealmSpawnRecordAccountData.layout.decode(data.slice(8))

    return new RealmSpawnRecordAccountData({
      ebuf: dec.ebuf,
    })
  }

  toJSON(): RealmSpawnRecordAccountDataJSON {
    return {
      ebuf: this.ebuf,
    }
  }

  static fromJSON(
    obj: RealmSpawnRecordAccountDataJSON
  ): RealmSpawnRecordAccountData {
    return new RealmSpawnRecordAccountData({
      ebuf: obj.ebuf,
    })
  }
}
