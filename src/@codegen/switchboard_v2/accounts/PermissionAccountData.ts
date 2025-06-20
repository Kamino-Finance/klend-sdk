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

export interface PermissionAccountDataFields {
  authority: Address
  permissions: number
  granter: Address
  grantee: Address
  expiration: BN
  ebuf: Array<number>
}

export interface PermissionAccountDataJSON {
  authority: string
  permissions: number
  granter: string
  grantee: string
  expiration: string
  ebuf: Array<number>
}

export class PermissionAccountData {
  readonly authority: Address
  readonly permissions: number
  readonly granter: Address
  readonly grantee: Address
  readonly expiration: BN
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([
    77, 37, 177, 164, 38, 39, 34, 109,
  ])

  static readonly layout = borsh.struct<PermissionAccountData>([
    borshAddress("authority"),
    borsh.u32("permissions"),
    borshAddress("granter"),
    borshAddress("grantee"),
    borsh.i64("expiration"),
    borsh.array(borsh.u8(), 256, "ebuf"),
  ])

  constructor(fields: PermissionAccountDataFields) {
    this.authority = fields.authority
    this.permissions = fields.permissions
    this.granter = fields.granter
    this.grantee = fields.grantee
    this.expiration = fields.expiration
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<PermissionAccountData | null> {
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
  ): Promise<Array<PermissionAccountData | null>> {
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

  static decode(data: Buffer): PermissionAccountData {
    if (!data.slice(0, 8).equals(PermissionAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = PermissionAccountData.layout.decode(data.slice(8))

    return new PermissionAccountData({
      authority: dec.authority,
      permissions: dec.permissions,
      granter: dec.granter,
      grantee: dec.grantee,
      expiration: dec.expiration,
      ebuf: dec.ebuf,
    })
  }

  toJSON(): PermissionAccountDataJSON {
    return {
      authority: this.authority,
      permissions: this.permissions,
      granter: this.granter,
      grantee: this.grantee,
      expiration: this.expiration.toString(),
      ebuf: this.ebuf,
    }
  }

  static fromJSON(obj: PermissionAccountDataJSON): PermissionAccountData {
    return new PermissionAccountData({
      authority: address(obj.authority),
      permissions: obj.permissions,
      granter: address(obj.granter),
      grantee: address(obj.grantee),
      expiration: new BN(obj.expiration),
      ebuf: obj.ebuf,
    })
  }
}
