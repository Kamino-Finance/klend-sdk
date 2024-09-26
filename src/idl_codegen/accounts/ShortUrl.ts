import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ShortUrlFields {
  referrer: PublicKey
  shortUrl: string
}

export interface ShortUrlJSON {
  referrer: string
  shortUrl: string
}

export class ShortUrl {
  readonly referrer: PublicKey
  readonly shortUrl: string

  static readonly discriminator = Buffer.from([
    28, 89, 174, 25, 226, 124, 126, 212,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("referrer"),
    borsh.str("shortUrl"),
  ])

  constructor(fields: ShortUrlFields) {
    this.referrer = fields.referrer
    this.shortUrl = fields.shortUrl
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<ShortUrl | null> {
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
  ): Promise<Array<ShortUrl | null>> {
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
      referrer: this.referrer.toString(),
      shortUrl: this.shortUrl,
    }
  }

  static fromJSON(obj: ShortUrlJSON): ShortUrl {
    return new ShortUrl({
      referrer: new PublicKey(obj.referrer),
      shortUrl: obj.shortUrl,
    })
  }
}
