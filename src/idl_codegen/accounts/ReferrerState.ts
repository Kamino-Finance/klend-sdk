import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface ReferrerStateFields {
  shortUrl: PublicKey
  owner: PublicKey
}

export interface ReferrerStateJSON {
  shortUrl: string
  owner: string
}

export class ReferrerState {
  readonly shortUrl: PublicKey
  readonly owner: PublicKey

  static readonly discriminator = Buffer.from([
    194, 81, 217, 103, 12, 19, 12, 66,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("shortUrl"),
    borsh.publicKey("owner"),
  ])

  constructor(fields: ReferrerStateFields) {
    this.shortUrl = fields.shortUrl
    this.owner = fields.owner
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<ReferrerState | null> {
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
  ): Promise<Array<ReferrerState | null>> {
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
      shortUrl: this.shortUrl.toString(),
      owner: this.owner.toString(),
    }
  }

  static fromJSON(obj: ReferrerStateJSON): ReferrerState {
    return new ReferrerState({
      shortUrl: new PublicKey(obj.shortUrl),
      owner: new PublicKey(obj.owner),
    })
  }
}
