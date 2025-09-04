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

export interface PoolStateFields {
  admin: Address
  pendingAdmin: Address
  basePoolAuthority: Address
  basePoolAuthorityBump: BN
  unstakingSolMint: Address
  wsolVault: Address
  actionAuthority: Address
  poolLookupTable: Address
  sharesIssued: BN
  wsolUnstaking: BN
  wsolInVault: BN
  padding: Array<BN>
}

export interface PoolStateJSON {
  admin: string
  pendingAdmin: string
  basePoolAuthority: string
  basePoolAuthorityBump: string
  unstakingSolMint: string
  wsolVault: string
  actionAuthority: string
  poolLookupTable: string
  sharesIssued: string
  wsolUnstaking: string
  wsolInVault: string
  padding: Array<string>
}

export class PoolState {
  readonly admin: Address
  readonly pendingAdmin: Address
  readonly basePoolAuthority: Address
  readonly basePoolAuthorityBump: BN
  readonly unstakingSolMint: Address
  readonly wsolVault: Address
  readonly actionAuthority: Address
  readonly poolLookupTable: Address
  readonly sharesIssued: BN
  readonly wsolUnstaking: BN
  readonly wsolInVault: BN
  readonly padding: Array<BN>

  static readonly discriminator = Buffer.from([
    247, 237, 227, 245, 215, 195, 222, 70,
  ])

  static readonly layout = borsh.struct<PoolState>([
    borshAddress("admin"),
    borshAddress("pendingAdmin"),
    borshAddress("basePoolAuthority"),
    borsh.u64("basePoolAuthorityBump"),
    borshAddress("unstakingSolMint"),
    borshAddress("wsolVault"),
    borshAddress("actionAuthority"),
    borshAddress("poolLookupTable"),
    borsh.u64("sharesIssued"),
    borsh.u64("wsolUnstaking"),
    borsh.u64("wsolInVault"),
    borsh.array(borsh.u128(), 256, "padding"),
  ])

  constructor(fields: PoolStateFields) {
    this.admin = fields.admin
    this.pendingAdmin = fields.pendingAdmin
    this.basePoolAuthority = fields.basePoolAuthority
    this.basePoolAuthorityBump = fields.basePoolAuthorityBump
    this.unstakingSolMint = fields.unstakingSolMint
    this.wsolVault = fields.wsolVault
    this.actionAuthority = fields.actionAuthority
    this.poolLookupTable = fields.poolLookupTable
    this.sharesIssued = fields.sharesIssued
    this.wsolUnstaking = fields.wsolUnstaking
    this.wsolInVault = fields.wsolInVault
    this.padding = fields.padding
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<PoolState | null> {
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
  ): Promise<Array<PoolState | null>> {
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

  static decode(data: Buffer): PoolState {
    if (!data.slice(0, 8).equals(PoolState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PoolState.layout.decode(data.slice(8))

    return new PoolState({
      admin: dec.admin,
      pendingAdmin: dec.pendingAdmin,
      basePoolAuthority: dec.basePoolAuthority,
      basePoolAuthorityBump: dec.basePoolAuthorityBump,
      unstakingSolMint: dec.unstakingSolMint,
      wsolVault: dec.wsolVault,
      actionAuthority: dec.actionAuthority,
      poolLookupTable: dec.poolLookupTable,
      sharesIssued: dec.sharesIssued,
      wsolUnstaking: dec.wsolUnstaking,
      wsolInVault: dec.wsolInVault,
      padding: dec.padding,
    })
  }

  toJSON(): PoolStateJSON {
    return {
      admin: this.admin,
      pendingAdmin: this.pendingAdmin,
      basePoolAuthority: this.basePoolAuthority,
      basePoolAuthorityBump: this.basePoolAuthorityBump.toString(),
      unstakingSolMint: this.unstakingSolMint,
      wsolVault: this.wsolVault,
      actionAuthority: this.actionAuthority,
      poolLookupTable: this.poolLookupTable,
      sharesIssued: this.sharesIssued.toString(),
      wsolUnstaking: this.wsolUnstaking.toString(),
      wsolInVault: this.wsolInVault.toString(),
      padding: this.padding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: PoolStateJSON): PoolState {
    return new PoolState({
      admin: address(obj.admin),
      pendingAdmin: address(obj.pendingAdmin),
      basePoolAuthority: address(obj.basePoolAuthority),
      basePoolAuthorityBump: new BN(obj.basePoolAuthorityBump),
      unstakingSolMint: address(obj.unstakingSolMint),
      wsolVault: address(obj.wsolVault),
      actionAuthority: address(obj.actionAuthority),
      poolLookupTable: address(obj.poolLookupTable),
      sharesIssued: new BN(obj.sharesIssued),
      wsolUnstaking: new BN(obj.wsolUnstaking),
      wsolInVault: new BN(obj.wsolInVault),
      padding: obj.padding.map((item) => new BN(item)),
    })
  }
}
