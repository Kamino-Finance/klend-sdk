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

export interface VrfPoolAccountDataFields {
  authority: Address
  queue: Address
  escrow: Address
  minInterval: number
  maxRows: number
  size: number
  idx: number
  stateBump: number
  ebuf: Array<number>
}

export interface VrfPoolAccountDataJSON {
  authority: string
  queue: string
  escrow: string
  minInterval: number
  maxRows: number
  size: number
  idx: number
  stateBump: number
  ebuf: Array<number>
}

export class VrfPoolAccountData {
  readonly authority: Address
  readonly queue: Address
  readonly escrow: Address
  readonly minInterval: number
  readonly maxRows: number
  readonly size: number
  readonly idx: number
  readonly stateBump: number
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([86, 67, 58, 9, 46, 21, 101, 248])

  static readonly layout = borsh.struct<VrfPoolAccountData>([
    borshAddress("authority"),
    borshAddress("queue"),
    borshAddress("escrow"),
    borsh.u32("minInterval"),
    borsh.u32("maxRows"),
    borsh.u32("size"),
    borsh.u32("idx"),
    borsh.u8("stateBump"),
    borsh.array(borsh.u8(), 135, "ebuf"),
  ])

  constructor(fields: VrfPoolAccountDataFields) {
    this.authority = fields.authority
    this.queue = fields.queue
    this.escrow = fields.escrow
    this.minInterval = fields.minInterval
    this.maxRows = fields.maxRows
    this.size = fields.size
    this.idx = fields.idx
    this.stateBump = fields.stateBump
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<VrfPoolAccountData | null> {
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
  ): Promise<Array<VrfPoolAccountData | null>> {
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

  static decode(data: Buffer): VrfPoolAccountData {
    if (!data.slice(0, 8).equals(VrfPoolAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = VrfPoolAccountData.layout.decode(data.slice(8))

    return new VrfPoolAccountData({
      authority: dec.authority,
      queue: dec.queue,
      escrow: dec.escrow,
      minInterval: dec.minInterval,
      maxRows: dec.maxRows,
      size: dec.size,
      idx: dec.idx,
      stateBump: dec.stateBump,
      ebuf: dec.ebuf,
    })
  }

  toJSON(): VrfPoolAccountDataJSON {
    return {
      authority: this.authority,
      queue: this.queue,
      escrow: this.escrow,
      minInterval: this.minInterval,
      maxRows: this.maxRows,
      size: this.size,
      idx: this.idx,
      stateBump: this.stateBump,
      ebuf: this.ebuf,
    }
  }

  static fromJSON(obj: VrfPoolAccountDataJSON): VrfPoolAccountData {
    return new VrfPoolAccountData({
      authority: address(obj.authority),
      queue: address(obj.queue),
      escrow: address(obj.escrow),
      minInterval: obj.minInterval,
      maxRows: obj.maxRows,
      size: obj.size,
      idx: obj.idx,
      stateBump: obj.stateBump,
      ebuf: obj.ebuf,
    })
  }
}
