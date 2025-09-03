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

export interface ShortUrlFields {
  referrer: Address
  shortUrl: string
}

export interface ShortUrlJSON {
  referrer: string
  shortUrl: string
}

export class ShortUrl {
  readonly referrer: Address
  readonly shortUrl: string

  static readonly discriminator = Buffer.from([
    28, 89, 174, 25, 226, 124, 126, 212,
  ])

  static readonly layout = borsh.struct<ShortUrl>([
    borshAddress("referrer"),
    borsh.str("shortUrl"),
  ])

  constructor(fields: ShortUrlFields) {
    this.referrer = fields.referrer
    this.shortUrl = fields.shortUrl
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<ShortUrl | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ShortUrlFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<ShortUrl | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ShortUrlFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): ShortUrl {
    if (!data.slice(0, 8).equals(ShortUrl.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = ShortUrl.layout.decode(data.slice(8))

    return new ShortUrl({
      referrer: dec.referrer,
      shortUrl: dec.shortUrl,
    })
  }

  toJSON(): ShortUrlJSON {
    return {
      referrer: this.referrer,
      shortUrl: this.shortUrl,
    }
  }

  static fromJSON(obj: ShortUrlJSON): ShortUrl {
    return new ShortUrl({
      referrer: address(obj.referrer),
      shortUrl: obj.shortUrl,
    })
  }
}
