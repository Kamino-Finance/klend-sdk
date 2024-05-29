import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"
import { UserMetadata, UserMetadataFields } from '../accounts';

/** Referrer account -> each owner can have multiple accounts for specific reserves */
export class UserMetadataZP {
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
    this.padding1 = []
    this.padding2 = []
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
      padding1: [],
      padding2: [],
    })
  }
}
