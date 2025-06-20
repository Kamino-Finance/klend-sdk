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

export interface CrankAccountDataFields {
  name: Array<number>
  metadata: Array<number>
  queuePubkey: Address
  pqSize: number
  maxRows: number
  jitterModifier: number
  ebuf: Array<number>
  dataBuffer: Address
}

export interface CrankAccountDataJSON {
  name: Array<number>
  metadata: Array<number>
  queuePubkey: string
  pqSize: number
  maxRows: number
  jitterModifier: number
  ebuf: Array<number>
  dataBuffer: string
}

export class CrankAccountData {
  readonly name: Array<number>
  readonly metadata: Array<number>
  readonly queuePubkey: Address
  readonly pqSize: number
  readonly maxRows: number
  readonly jitterModifier: number
  readonly ebuf: Array<number>
  readonly dataBuffer: Address

  static readonly discriminator = Buffer.from([
    111, 81, 146, 73, 172, 180, 134, 209,
  ])

  static readonly layout = borsh.struct<CrankAccountData>([
    borsh.array(borsh.u8(), 32, "name"),
    borsh.array(borsh.u8(), 64, "metadata"),
    borshAddress("queuePubkey"),
    borsh.u32("pqSize"),
    borsh.u32("maxRows"),
    borsh.u8("jitterModifier"),
    borsh.array(borsh.u8(), 255, "ebuf"),
    borshAddress("dataBuffer"),
  ])

  constructor(fields: CrankAccountDataFields) {
    this.name = fields.name
    this.metadata = fields.metadata
    this.queuePubkey = fields.queuePubkey
    this.pqSize = fields.pqSize
    this.maxRows = fields.maxRows
    this.jitterModifier = fields.jitterModifier
    this.ebuf = fields.ebuf
    this.dataBuffer = fields.dataBuffer
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<CrankAccountData | null> {
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
  ): Promise<Array<CrankAccountData | null>> {
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

  static decode(data: Buffer): CrankAccountData {
    if (!data.slice(0, 8).equals(CrankAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = CrankAccountData.layout.decode(data.slice(8))

    return new CrankAccountData({
      name: dec.name,
      metadata: dec.metadata,
      queuePubkey: dec.queuePubkey,
      pqSize: dec.pqSize,
      maxRows: dec.maxRows,
      jitterModifier: dec.jitterModifier,
      ebuf: dec.ebuf,
      dataBuffer: dec.dataBuffer,
    })
  }

  toJSON(): CrankAccountDataJSON {
    return {
      name: this.name,
      metadata: this.metadata,
      queuePubkey: this.queuePubkey,
      pqSize: this.pqSize,
      maxRows: this.maxRows,
      jitterModifier: this.jitterModifier,
      ebuf: this.ebuf,
      dataBuffer: this.dataBuffer,
    }
  }

  static fromJSON(obj: CrankAccountDataJSON): CrankAccountData {
    return new CrankAccountData({
      name: obj.name,
      metadata: obj.metadata,
      queuePubkey: address(obj.queuePubkey),
      pqSize: obj.pqSize,
      maxRows: obj.maxRows,
      jitterModifier: obj.jitterModifier,
      ebuf: obj.ebuf,
      dataBuffer: address(obj.dataBuffer),
    })
  }
}
