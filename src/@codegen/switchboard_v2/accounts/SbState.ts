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

export interface SbStateFields {
  authority: Address
  tokenMint: Address
  tokenVault: Address
  daoMint: Address
  ebuf: Array<number>
}

export interface SbStateJSON {
  authority: string
  tokenMint: string
  tokenVault: string
  daoMint: string
  ebuf: Array<number>
}

export class SbState {
  readonly authority: Address
  readonly tokenMint: Address
  readonly tokenVault: Address
  readonly daoMint: Address
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([
    159, 42, 192, 191, 139, 62, 168, 28,
  ])

  static readonly layout = borsh.struct<SbState>([
    borshAddress("authority"),
    borshAddress("tokenMint"),
    borshAddress("tokenVault"),
    borshAddress("daoMint"),
    borsh.array(borsh.u8(), 992, "ebuf"),
  ])

  constructor(fields: SbStateFields) {
    this.authority = fields.authority
    this.tokenMint = fields.tokenMint
    this.tokenVault = fields.tokenVault
    this.daoMint = fields.daoMint
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<SbState | null> {
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
  ): Promise<Array<SbState | null>> {
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

  static decode(data: Buffer): SbState {
    if (!data.slice(0, 8).equals(SbState.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = SbState.layout.decode(data.slice(8))

    return new SbState({
      authority: dec.authority,
      tokenMint: dec.tokenMint,
      tokenVault: dec.tokenVault,
      daoMint: dec.daoMint,
      ebuf: dec.ebuf,
    })
  }

  toJSON(): SbStateJSON {
    return {
      authority: this.authority,
      tokenMint: this.tokenMint,
      tokenVault: this.tokenVault,
      daoMint: this.daoMint,
      ebuf: this.ebuf,
    }
  }

  static fromJSON(obj: SbStateJSON): SbState {
    return new SbState({
      authority: address(obj.authority),
      tokenMint: address(obj.tokenMint),
      tokenVault: address(obj.tokenVault),
      daoMint: address(obj.daoMint),
      ebuf: obj.ebuf,
    })
  }
}
