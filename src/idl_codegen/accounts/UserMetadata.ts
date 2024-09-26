import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface UserMetadataFields {
  /** Pubkey of the referrer/owner - pubkey::default if no referrer */
  referrer: PublicKey
  /** Bump used for validation of account address */
  bump: BN
  /** User lookup table - used to store all user accounts - atas for each reserve mint, each obligation PDA, UserMetadata itself and all referrer_token_states if there is a referrer */
  userLookupTable: PublicKey
  /** User metadata account owner */
  owner: PublicKey
  padding1: Array<BN>
  padding2: Array<BN>
}

export interface UserMetadataJSON {
  /** Pubkey of the referrer/owner - pubkey::default if no referrer */
  referrer: string
  /** Bump used for validation of account address */
  bump: string
  /** User lookup table - used to store all user accounts - atas for each reserve mint, each obligation PDA, UserMetadata itself and all referrer_token_states if there is a referrer */
  userLookupTable: string
  /** User metadata account owner */
  owner: string
  padding1: Array<string>
  padding2: Array<string>
}

/** Referrer account -> each owner can have multiple accounts for specific reserves */
export class UserMetadata {
  /** Pubkey of the referrer/owner - pubkey::default if no referrer */
  readonly referrer: PublicKey
  /** Bump used for validation of account address */
  readonly bump: BN
  /** User lookup table - used to store all user accounts - atas for each reserve mint, each obligation PDA, UserMetadata itself and all referrer_token_states if there is a referrer */
  readonly userLookupTable: PublicKey
  /** User metadata account owner */
  readonly owner: PublicKey
  readonly padding1: Array<BN>
  readonly padding2: Array<BN>

  static readonly discriminator = Buffer.from([
    157, 214, 220, 235, 98, 135, 171, 28,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("referrer"),
    borsh.u64("bump"),
    borsh.publicKey("userLookupTable"),
    borsh.publicKey("owner"),
    borsh.array(borsh.u64(), 51, "padding1"),
    borsh.array(borsh.u64(), 64, "padding2"),
  ])

  constructor(fields: UserMetadataFields) {
    this.referrer = fields.referrer
    this.bump = fields.bump
    this.userLookupTable = fields.userLookupTable
    this.owner = fields.owner
    this.padding1 = fields.padding1
    this.padding2 = fields.padding2
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<UserMetadata | null> {
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
  ): Promise<Array<UserMetadata | null>> {
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

  static decode(data: Buffer): UserMetadata {
    if (!data.slice(0, 8).equals(UserMetadata.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = UserMetadata.layout.decode(data.slice(8))

    return new UserMetadata({
      referrer: dec.referrer,
      bump: dec.bump,
      userLookupTable: dec.userLookupTable,
      owner: dec.owner,
      padding1: dec.padding1,
      padding2: dec.padding2,
    })
  }

  toJSON(): UserMetadataJSON {
    return {
      referrer: this.referrer.toString(),
      bump: this.bump.toString(),
      userLookupTable: this.userLookupTable.toString(),
      owner: this.owner.toString(),
      padding1: this.padding1.map((item) => item.toString()),
      padding2: this.padding2.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: UserMetadataJSON): UserMetadata {
    return new UserMetadata({
      referrer: new PublicKey(obj.referrer),
      bump: new BN(obj.bump),
      userLookupTable: new PublicKey(obj.userLookupTable),
      owner: new PublicKey(obj.owner),
      padding1: obj.padding1.map((item) => new BN(item)),
      padding2: obj.padding2.map((item) => new BN(item)),
    })
  }
}
