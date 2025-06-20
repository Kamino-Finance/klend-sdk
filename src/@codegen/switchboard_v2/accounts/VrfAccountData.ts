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

export interface VrfAccountDataFields {
  status: types.VrfStatusKind
  counter: BN
  authority: Address
  oracleQueue: Address
  escrow: Address
  callback: types.CallbackZCFields
  batchSize: number
  builders: Array<types.VrfBuilderFields>
  buildersLen: number
  testMode: boolean
  currentRound: types.VrfRoundFields
  ebuf: Array<number>
}

export interface VrfAccountDataJSON {
  status: types.VrfStatusJSON
  counter: string
  authority: string
  oracleQueue: string
  escrow: string
  callback: types.CallbackZCJSON
  batchSize: number
  builders: Array<types.VrfBuilderJSON>
  buildersLen: number
  testMode: boolean
  currentRound: types.VrfRoundJSON
  ebuf: Array<number>
}

export class VrfAccountData {
  readonly status: types.VrfStatusKind
  readonly counter: BN
  readonly authority: Address
  readonly oracleQueue: Address
  readonly escrow: Address
  readonly callback: types.CallbackZC
  readonly batchSize: number
  readonly builders: Array<types.VrfBuilder>
  readonly buildersLen: number
  readonly testMode: boolean
  readonly currentRound: types.VrfRound
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([
    101, 35, 62, 239, 103, 151, 6, 18,
  ])

  static readonly layout = borsh.struct<VrfAccountData>([
    types.VrfStatus.layout("status"),
    borsh.u128("counter"),
    borshAddress("authority"),
    borshAddress("oracleQueue"),
    borshAddress("escrow"),
    types.CallbackZC.layout("callback"),
    borsh.u32("batchSize"),
    borsh.array(types.VrfBuilder.layout(), 8, "builders"),
    borsh.u32("buildersLen"),
    borsh.bool("testMode"),
    types.VrfRound.layout("currentRound"),
    borsh.array(borsh.u8(), 1024, "ebuf"),
  ])

  constructor(fields: VrfAccountDataFields) {
    this.status = fields.status
    this.counter = fields.counter
    this.authority = fields.authority
    this.oracleQueue = fields.oracleQueue
    this.escrow = fields.escrow
    this.callback = new types.CallbackZC({ ...fields.callback })
    this.batchSize = fields.batchSize
    this.builders = fields.builders.map(
      (item) => new types.VrfBuilder({ ...item })
    )
    this.buildersLen = fields.buildersLen
    this.testMode = fields.testMode
    this.currentRound = new types.VrfRound({ ...fields.currentRound })
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<VrfAccountData | null> {
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
  ): Promise<Array<VrfAccountData | null>> {
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

  static decode(data: Buffer): VrfAccountData {
    if (!data.slice(0, 8).equals(VrfAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = VrfAccountData.layout.decode(data.slice(8))

    return new VrfAccountData({
      status: types.VrfStatus.fromDecoded(dec.status),
      counter: dec.counter,
      authority: dec.authority,
      oracleQueue: dec.oracleQueue,
      escrow: dec.escrow,
      callback: types.CallbackZC.fromDecoded(dec.callback),
      batchSize: dec.batchSize,
      builders: dec.builders.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.VrfBuilder.fromDecoded(item)
      ),
      buildersLen: dec.buildersLen,
      testMode: dec.testMode,
      currentRound: types.VrfRound.fromDecoded(dec.currentRound),
      ebuf: dec.ebuf,
    })
  }

  toJSON(): VrfAccountDataJSON {
    return {
      status: this.status.toJSON(),
      counter: this.counter.toString(),
      authority: this.authority,
      oracleQueue: this.oracleQueue,
      escrow: this.escrow,
      callback: this.callback.toJSON(),
      batchSize: this.batchSize,
      builders: this.builders.map((item) => item.toJSON()),
      buildersLen: this.buildersLen,
      testMode: this.testMode,
      currentRound: this.currentRound.toJSON(),
      ebuf: this.ebuf,
    }
  }

  static fromJSON(obj: VrfAccountDataJSON): VrfAccountData {
    return new VrfAccountData({
      status: types.VrfStatus.fromJSON(obj.status),
      counter: new BN(obj.counter),
      authority: address(obj.authority),
      oracleQueue: address(obj.oracleQueue),
      escrow: address(obj.escrow),
      callback: types.CallbackZC.fromJSON(obj.callback),
      batchSize: obj.batchSize,
      builders: obj.builders.map((item) => types.VrfBuilder.fromJSON(item)),
      buildersLen: obj.buildersLen,
      testMode: obj.testMode,
      currentRound: types.VrfRound.fromJSON(obj.currentRound),
      ebuf: obj.ebuf,
    })
  }
}
