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

export interface GlobalConfigFields {
  /** Global admin of the program */
  globalAdmin: Address
  /** Pending admin must sign a specific transaction to become the global admin */
  pendingAdmin: Address
  /** Fee collector is the only allowed owner of token accounts receiving protocol fees */
  feeCollector: Address
  /** Padding to make the struct size 1024 bytes */
  padding: Array<number>
}

export interface GlobalConfigJSON {
  /** Global admin of the program */
  globalAdmin: string
  /** Pending admin must sign a specific transaction to become the global admin */
  pendingAdmin: string
  /** Fee collector is the only allowed owner of token accounts receiving protocol fees */
  feeCollector: string
  /** Padding to make the struct size 1024 bytes */
  padding: Array<number>
}

export class GlobalConfig {
  /** Global admin of the program */
  readonly globalAdmin: Address
  /** Pending admin must sign a specific transaction to become the global admin */
  readonly pendingAdmin: Address
  /** Fee collector is the only allowed owner of token accounts receiving protocol fees */
  readonly feeCollector: Address
  /** Padding to make the struct size 1024 bytes */
  readonly padding: Array<number>

  static readonly discriminator = Buffer.from([
    149, 8, 156, 202, 160, 252, 176, 217,
  ])

  static readonly layout = borsh.struct<GlobalConfig>([
    borshAddress("globalAdmin"),
    borshAddress("pendingAdmin"),
    borshAddress("feeCollector"),
    borsh.array(borsh.u8(), 928, "padding"),
  ])

  constructor(fields: GlobalConfigFields) {
    this.globalAdmin = fields.globalAdmin
    this.pendingAdmin = fields.pendingAdmin
    this.feeCollector = fields.feeCollector
    this.padding = fields.padding
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<GlobalConfig | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `GlobalConfigFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<GlobalConfig | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `GlobalConfigFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): GlobalConfig {
    if (!data.slice(0, 8).equals(GlobalConfig.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = GlobalConfig.layout.decode(data.slice(8))

    return new GlobalConfig({
      globalAdmin: dec.globalAdmin,
      pendingAdmin: dec.pendingAdmin,
      feeCollector: dec.feeCollector,
      padding: dec.padding,
    })
  }

  toJSON(): GlobalConfigJSON {
    return {
      globalAdmin: this.globalAdmin,
      pendingAdmin: this.pendingAdmin,
      feeCollector: this.feeCollector,
      padding: this.padding,
    }
  }

  static fromJSON(obj: GlobalConfigJSON): GlobalConfig {
    return new GlobalConfig({
      globalAdmin: address(obj.globalAdmin),
      pendingAdmin: address(obj.pendingAdmin),
      feeCollector: address(obj.feeCollector),
      padding: obj.padding,
    })
  }
}
