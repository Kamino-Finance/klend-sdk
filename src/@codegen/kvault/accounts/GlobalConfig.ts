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
  globalAdmin: Address
  pendingAdmin: Address
  withdrawalPenaltyLamports: BN
  withdrawalPenaltyBps: BN
  padding: Array<number>
}

export interface GlobalConfigJSON {
  globalAdmin: string
  pendingAdmin: string
  withdrawalPenaltyLamports: string
  withdrawalPenaltyBps: string
  padding: Array<number>
}

export class GlobalConfig {
  readonly globalAdmin: Address
  readonly pendingAdmin: Address
  readonly withdrawalPenaltyLamports: BN
  readonly withdrawalPenaltyBps: BN
  readonly padding: Array<number>

  static readonly discriminator = Buffer.from([
    149, 8, 156, 202, 160, 252, 176, 217,
  ])

  static readonly layout = borsh.struct<GlobalConfig>([
    borshAddress("globalAdmin"),
    borshAddress("pendingAdmin"),
    borsh.u64("withdrawalPenaltyLamports"),
    borsh.u64("withdrawalPenaltyBps"),
    borsh.array(borsh.u8(), 944, "padding"),
  ])

  constructor(fields: GlobalConfigFields) {
    this.globalAdmin = fields.globalAdmin
    this.pendingAdmin = fields.pendingAdmin
    this.withdrawalPenaltyLamports = fields.withdrawalPenaltyLamports
    this.withdrawalPenaltyBps = fields.withdrawalPenaltyBps
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
        `KVaultGlobalConfigFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
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
      withdrawalPenaltyLamports: dec.withdrawalPenaltyLamports,
      withdrawalPenaltyBps: dec.withdrawalPenaltyBps,
      padding: dec.padding,
    })
  }

  toJSON(): GlobalConfigJSON {
    return {
      globalAdmin: this.globalAdmin,
      pendingAdmin: this.pendingAdmin,
      withdrawalPenaltyLamports: this.withdrawalPenaltyLamports.toString(),
      withdrawalPenaltyBps: this.withdrawalPenaltyBps.toString(),
      padding: this.padding,
    }
  }

  static fromJSON(obj: GlobalConfigJSON): GlobalConfig {
    return new GlobalConfig({
      globalAdmin: address(obj.globalAdmin),
      pendingAdmin: address(obj.pendingAdmin),
      withdrawalPenaltyLamports: new BN(obj.withdrawalPenaltyLamports),
      withdrawalPenaltyBps: new BN(obj.withdrawalPenaltyBps),
      padding: obj.padding,
    })
  }
}
