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

export interface PerpetualsFields {
  permissions: types.PermissionsFields
  pools: Array<Address>
  admin: Address
  transferAuthorityBump: number
  perpetualsBump: number
  inceptionTime: BN
}

export interface PerpetualsJSON {
  permissions: types.PermissionsJSON
  pools: Array<string>
  admin: string
  transferAuthorityBump: number
  perpetualsBump: number
  inceptionTime: string
}

export class Perpetuals {
  readonly permissions: types.Permissions
  readonly pools: Array<Address>
  readonly admin: Address
  readonly transferAuthorityBump: number
  readonly perpetualsBump: number
  readonly inceptionTime: BN

  static readonly discriminator = Buffer.from([
    28, 167, 98, 191, 104, 82, 108, 196,
  ])

  static readonly layout = borsh.struct<Perpetuals>([
    types.Permissions.layout("permissions"),
    borsh.vec(borshAddress(), "pools"),
    borshAddress("admin"),
    borsh.u8("transferAuthorityBump"),
    borsh.u8("perpetualsBump"),
    borsh.i64("inceptionTime"),
  ])

  constructor(fields: PerpetualsFields) {
    this.permissions = new types.Permissions({ ...fields.permissions })
    this.pools = fields.pools
    this.admin = fields.admin
    this.transferAuthorityBump = fields.transferAuthorityBump
    this.perpetualsBump = fields.perpetualsBump
    this.inceptionTime = fields.inceptionTime
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<Perpetuals | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `PerpetualsFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<Perpetuals | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `PerpetualsFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): Perpetuals {
    if (!data.slice(0, 8).equals(Perpetuals.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Perpetuals.layout.decode(data.slice(8))

    return new Perpetuals({
      permissions: types.Permissions.fromDecoded(dec.permissions),
      pools: dec.pools,
      admin: dec.admin,
      transferAuthorityBump: dec.transferAuthorityBump,
      perpetualsBump: dec.perpetualsBump,
      inceptionTime: dec.inceptionTime,
    })
  }

  toJSON(): PerpetualsJSON {
    return {
      permissions: this.permissions.toJSON(),
      pools: this.pools,
      admin: this.admin,
      transferAuthorityBump: this.transferAuthorityBump,
      perpetualsBump: this.perpetualsBump,
      inceptionTime: this.inceptionTime.toString(),
    }
  }

  static fromJSON(obj: PerpetualsJSON): Perpetuals {
    return new Perpetuals({
      permissions: types.Permissions.fromJSON(obj.permissions),
      pools: obj.pools.map((item) => address(item)),
      admin: address(obj.admin),
      transferAuthorityBump: obj.transferAuthorityBump,
      perpetualsBump: obj.perpetualsBump,
      inceptionTime: new BN(obj.inceptionTime),
    })
  }
}
