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

export interface ReserveWhitelistEntryFields {
  /**
   * The token mint is stored to solve the problem of finding all the whitelisted reserves for a particular token mint:
   * when storing the token mint inside the PDA, finding all the whitelisted reserves becomes a `getProgramAccounts` with
   * a filter on discriminator + the mint field
   * The reserve pubkey, as seed of the reserve whitelist PDA account, it stored so you can link back the PDA to its seeds
   * (for instance, in the operation above we easily find the reserve corresponding to the PDA)
   */
  tokenMint: Address
  reserve: Address
  whitelistAddAllocation: number
  whitelistInvest: number
  padding: Array<number>
}

export interface ReserveWhitelistEntryJSON {
  /**
   * The token mint is stored to solve the problem of finding all the whitelisted reserves for a particular token mint:
   * when storing the token mint inside the PDA, finding all the whitelisted reserves becomes a `getProgramAccounts` with
   * a filter on discriminator + the mint field
   * The reserve pubkey, as seed of the reserve whitelist PDA account, it stored so you can link back the PDA to its seeds
   * (for instance, in the operation above we easily find the reserve corresponding to the PDA)
   */
  tokenMint: string
  reserve: string
  whitelistAddAllocation: number
  whitelistInvest: number
  padding: Array<number>
}

export class ReserveWhitelistEntry {
  /**
   * The token mint is stored to solve the problem of finding all the whitelisted reserves for a particular token mint:
   * when storing the token mint inside the PDA, finding all the whitelisted reserves becomes a `getProgramAccounts` with
   * a filter on discriminator + the mint field
   * The reserve pubkey, as seed of the reserve whitelist PDA account, it stored so you can link back the PDA to its seeds
   * (for instance, in the operation above we easily find the reserve corresponding to the PDA)
   */
  readonly tokenMint: Address
  readonly reserve: Address
  readonly whitelistAddAllocation: number
  readonly whitelistInvest: number
  readonly padding: Array<number>

  static readonly discriminator = Buffer.from([
    135, 130, 156, 210, 58, 58, 91, 170,
  ])

  static readonly layout = borsh.struct<ReserveWhitelistEntry>([
    borshAddress("tokenMint"),
    borshAddress("reserve"),
    borsh.u8("whitelistAddAllocation"),
    borsh.u8("whitelistInvest"),
    borsh.array(borsh.u8(), 62, "padding"),
  ])

  constructor(fields: ReserveWhitelistEntryFields) {
    this.tokenMint = fields.tokenMint
    this.reserve = fields.reserve
    this.whitelistAddAllocation = fields.whitelistAddAllocation
    this.whitelistInvest = fields.whitelistInvest
    this.padding = fields.padding
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<ReserveWhitelistEntry | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ReserveWhitelistEntryFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<ReserveWhitelistEntry | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ReserveWhitelistEntryFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): ReserveWhitelistEntry {
    if (!data.slice(0, 8).equals(ReserveWhitelistEntry.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = ReserveWhitelistEntry.layout.decode(data.slice(8))

    return new ReserveWhitelistEntry({
      tokenMint: dec.tokenMint,
      reserve: dec.reserve,
      whitelistAddAllocation: dec.whitelistAddAllocation,
      whitelistInvest: dec.whitelistInvest,
      padding: dec.padding,
    })
  }

  toJSON(): ReserveWhitelistEntryJSON {
    return {
      tokenMint: this.tokenMint,
      reserve: this.reserve,
      whitelistAddAllocation: this.whitelistAddAllocation,
      whitelistInvest: this.whitelistInvest,
      padding: this.padding,
    }
  }

  static fromJSON(obj: ReserveWhitelistEntryJSON): ReserveWhitelistEntry {
    return new ReserveWhitelistEntry({
      tokenMint: address(obj.tokenMint),
      reserve: address(obj.reserve),
      whitelistAddAllocation: obj.whitelistAddAllocation,
      whitelistInvest: obj.whitelistInvest,
      padding: obj.padding,
    })
  }
}
