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

export interface ReferrerStateFields {
  shortUrl: Address
  owner: Address
}

export interface ReferrerStateJSON {
  shortUrl: string
  owner: string
}

export class ReferrerState {
  readonly shortUrl: Address
  readonly owner: Address

  static readonly discriminator = Buffer.from([
    194, 81, 217, 103, 12, 19, 12, 66,
  ])

  static readonly layout = borsh.struct<ReferrerState>([
    borshAddress("shortUrl"),
    borshAddress("owner"),
  ])

  constructor(fields: ReferrerStateFields) {
    this.shortUrl = fields.shortUrl
    this.owner = fields.owner
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<ReferrerState | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ReferrerStateFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<ReferrerState | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ReferrerStateFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): ReferrerState {
    if (!data.slice(0, 8).equals(ReferrerState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = ReferrerState.layout.decode(data.slice(8))

    return new ReferrerState({
      shortUrl: dec.shortUrl,
      owner: dec.owner,
    })
  }

  toJSON(): ReferrerStateJSON {
    return {
      shortUrl: this.shortUrl,
      owner: this.owner,
    }
  }

  static fromJSON(obj: ReferrerStateJSON): ReferrerState {
    return new ReferrerState({
      shortUrl: address(obj.shortUrl),
      owner: address(obj.owner),
    })
  }
}
