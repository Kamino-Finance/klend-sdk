import { PublicKey, Connection } from "@solana/web3.js"
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId"

export interface GlobalConfigFields {
  /** Global admin of the program */
  globalAdmin: PublicKey
  /** Pending admin must sign a specific transaction to become the global admin */
  pendingAdmin: PublicKey
  /** Fee collector is the only allowed owner of token accounts receiving protocol fees */
  feeCollector: PublicKey
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
  readonly globalAdmin: PublicKey
  /** Pending admin must sign a specific transaction to become the global admin */
  readonly pendingAdmin: PublicKey
  /** Fee collector is the only allowed owner of token accounts receiving protocol fees */
  readonly feeCollector: PublicKey
  /** Padding to make the struct size 1024 bytes */
  readonly padding: Array<number>

  static readonly discriminator = Buffer.from([
    149, 8, 156, 202, 160, 252, 176, 217,
  ])

  static readonly layout = borsh.struct([
    borsh.publicKey("globalAdmin"),
    borsh.publicKey("pendingAdmin"),
    borsh.publicKey("feeCollector"),
    borsh.array(borsh.u8(), 928, "padding"),
  ])

  constructor(fields: GlobalConfigFields) {
    this.globalAdmin = fields.globalAdmin
    this.pendingAdmin = fields.pendingAdmin
    this.feeCollector = fields.feeCollector
    this.padding = fields.padding
  }

  static async fetch(
    c: Connection,
    address: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): Promise<GlobalConfig | null> {
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
  ): Promise<Array<GlobalConfig | null>> {
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
      globalAdmin: this.globalAdmin.toString(),
      pendingAdmin: this.pendingAdmin.toString(),
      feeCollector: this.feeCollector.toString(),
      padding: this.padding,
    }
  }

  static fromJSON(obj: GlobalConfigJSON): GlobalConfig {
    return new GlobalConfig({
      globalAdmin: new PublicKey(obj.globalAdmin),
      pendingAdmin: new PublicKey(obj.pendingAdmin),
      feeCollector: new PublicKey(obj.feeCollector),
      padding: obj.padding,
    })
  }
}
