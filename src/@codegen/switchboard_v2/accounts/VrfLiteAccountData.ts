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

export interface VrfLiteAccountDataFields {
  stateBump: number
  permissionBump: number
  vrfPool: Address
  status: types.VrfStatusKind
  result: Array<number>
  counter: BN
  alpha: Array<number>
  alphaLen: number
  requestSlot: BN
  requestTimestamp: BN
  authority: Address
  queue: Address
  escrow: Address
  callback: types.CallbackZCFields
  builder: types.VrfBuilderFields
  expiration: BN
  ebuf: Array<number>
}

export interface VrfLiteAccountDataJSON {
  stateBump: number
  permissionBump: number
  vrfPool: string
  status: types.VrfStatusJSON
  result: Array<number>
  counter: string
  alpha: Array<number>
  alphaLen: number
  requestSlot: string
  requestTimestamp: string
  authority: string
  queue: string
  escrow: string
  callback: types.CallbackZCJSON
  builder: types.VrfBuilderJSON
  expiration: string
  ebuf: Array<number>
}

export class VrfLiteAccountData {
  readonly stateBump: number
  readonly permissionBump: number
  readonly vrfPool: Address
  readonly status: types.VrfStatusKind
  readonly result: Array<number>
  readonly counter: BN
  readonly alpha: Array<number>
  readonly alphaLen: number
  readonly requestSlot: BN
  readonly requestTimestamp: BN
  readonly authority: Address
  readonly queue: Address
  readonly escrow: Address
  readonly callback: types.CallbackZC
  readonly builder: types.VrfBuilder
  readonly expiration: BN
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([
    98, 127, 126, 124, 166, 81, 97, 100,
  ])

  static readonly layout = borsh.struct<VrfLiteAccountData>([
    borsh.u8("stateBump"),
    borsh.u8("permissionBump"),
    borshAddress("vrfPool"),
    types.VrfStatus.layout("status"),
    borsh.array(borsh.u8(), 32, "result"),
    borsh.u128("counter"),
    borsh.array(borsh.u8(), 256, "alpha"),
    borsh.u32("alphaLen"),
    borsh.u64("requestSlot"),
    borsh.i64("requestTimestamp"),
    borshAddress("authority"),
    borshAddress("queue"),
    borshAddress("escrow"),
    types.CallbackZC.layout("callback"),
    types.VrfBuilder.layout("builder"),
    borsh.i64("expiration"),
    borsh.array(borsh.u8(), 1024, "ebuf"),
  ])

  constructor(fields: VrfLiteAccountDataFields) {
    this.stateBump = fields.stateBump
    this.permissionBump = fields.permissionBump
    this.vrfPool = fields.vrfPool
    this.status = fields.status
    this.result = fields.result
    this.counter = fields.counter
    this.alpha = fields.alpha
    this.alphaLen = fields.alphaLen
    this.requestSlot = fields.requestSlot
    this.requestTimestamp = fields.requestTimestamp
    this.authority = fields.authority
    this.queue = fields.queue
    this.escrow = fields.escrow
    this.callback = new types.CallbackZC({ ...fields.callback })
    this.builder = new types.VrfBuilder({ ...fields.builder })
    this.expiration = fields.expiration
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<VrfLiteAccountData | null> {
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
  ): Promise<Array<VrfLiteAccountData | null>> {
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

  static decode(data: Buffer): VrfLiteAccountData {
    if (!data.slice(0, 8).equals(VrfLiteAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = VrfLiteAccountData.layout.decode(data.slice(8))

    return new VrfLiteAccountData({
      stateBump: dec.stateBump,
      permissionBump: dec.permissionBump,
      vrfPool: dec.vrfPool,
      status: types.VrfStatus.fromDecoded(dec.status),
      result: dec.result,
      counter: dec.counter,
      alpha: dec.alpha,
      alphaLen: dec.alphaLen,
      requestSlot: dec.requestSlot,
      requestTimestamp: dec.requestTimestamp,
      authority: dec.authority,
      queue: dec.queue,
      escrow: dec.escrow,
      callback: types.CallbackZC.fromDecoded(dec.callback),
      builder: types.VrfBuilder.fromDecoded(dec.builder),
      expiration: dec.expiration,
      ebuf: dec.ebuf,
    })
  }

  toJSON(): VrfLiteAccountDataJSON {
    return {
      stateBump: this.stateBump,
      permissionBump: this.permissionBump,
      vrfPool: this.vrfPool,
      status: this.status.toJSON(),
      result: this.result,
      counter: this.counter.toString(),
      alpha: this.alpha,
      alphaLen: this.alphaLen,
      requestSlot: this.requestSlot.toString(),
      requestTimestamp: this.requestTimestamp.toString(),
      authority: this.authority,
      queue: this.queue,
      escrow: this.escrow,
      callback: this.callback.toJSON(),
      builder: this.builder.toJSON(),
      expiration: this.expiration.toString(),
      ebuf: this.ebuf,
    }
  }

  static fromJSON(obj: VrfLiteAccountDataJSON): VrfLiteAccountData {
    return new VrfLiteAccountData({
      stateBump: obj.stateBump,
      permissionBump: obj.permissionBump,
      vrfPool: address(obj.vrfPool),
      status: types.VrfStatus.fromJSON(obj.status),
      result: obj.result,
      counter: new BN(obj.counter),
      alpha: obj.alpha,
      alphaLen: obj.alphaLen,
      requestSlot: new BN(obj.requestSlot),
      requestTimestamp: new BN(obj.requestTimestamp),
      authority: address(obj.authority),
      queue: address(obj.queue),
      escrow: address(obj.escrow),
      callback: types.CallbackZC.fromJSON(obj.callback),
      builder: types.VrfBuilder.fromJSON(obj.builder),
      expiration: new BN(obj.expiration),
      ebuf: obj.ebuf,
    })
  }
}
