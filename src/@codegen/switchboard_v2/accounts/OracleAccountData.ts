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

export interface OracleAccountDataFields {
  name: Array<number>
  metadata: Array<number>
  oracleAuthority: Address
  lastHeartbeat: BN
  numInUse: number
  tokenAccount: Address
  queuePubkey: Address
  metrics: types.OracleMetricsFields
  ebuf: Array<number>
}

export interface OracleAccountDataJSON {
  name: Array<number>
  metadata: Array<number>
  oracleAuthority: string
  lastHeartbeat: string
  numInUse: number
  tokenAccount: string
  queuePubkey: string
  metrics: types.OracleMetricsJSON
  ebuf: Array<number>
}

export class OracleAccountData {
  readonly name: Array<number>
  readonly metadata: Array<number>
  readonly oracleAuthority: Address
  readonly lastHeartbeat: BN
  readonly numInUse: number
  readonly tokenAccount: Address
  readonly queuePubkey: Address
  readonly metrics: types.OracleMetrics
  readonly ebuf: Array<number>

  static readonly discriminator = Buffer.from([
    128, 30, 16, 241, 170, 73, 55, 54,
  ])

  static readonly layout = borsh.struct<OracleAccountData>([
    borsh.array(borsh.u8(), 32, "name"),
    borsh.array(borsh.u8(), 128, "metadata"),
    borshAddress("oracleAuthority"),
    borsh.i64("lastHeartbeat"),
    borsh.u32("numInUse"),
    borshAddress("tokenAccount"),
    borshAddress("queuePubkey"),
    types.OracleMetrics.layout("metrics"),
    borsh.array(borsh.u8(), 256, "ebuf"),
  ])

  constructor(fields: OracleAccountDataFields) {
    this.name = fields.name
    this.metadata = fields.metadata
    this.oracleAuthority = fields.oracleAuthority
    this.lastHeartbeat = fields.lastHeartbeat
    this.numInUse = fields.numInUse
    this.tokenAccount = fields.tokenAccount
    this.queuePubkey = fields.queuePubkey
    this.metrics = new types.OracleMetrics({ ...fields.metrics })
    this.ebuf = fields.ebuf
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<OracleAccountData | null> {
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
  ): Promise<Array<OracleAccountData | null>> {
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

  static decode(data: Buffer): OracleAccountData {
    if (!data.slice(0, 8).equals(OracleAccountData.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = OracleAccountData.layout.decode(data.slice(8))

    return new OracleAccountData({
      name: dec.name,
      metadata: dec.metadata,
      oracleAuthority: dec.oracleAuthority,
      lastHeartbeat: dec.lastHeartbeat,
      numInUse: dec.numInUse,
      tokenAccount: dec.tokenAccount,
      queuePubkey: dec.queuePubkey,
      metrics: types.OracleMetrics.fromDecoded(dec.metrics),
      ebuf: dec.ebuf,
    })
  }

  toJSON(): OracleAccountDataJSON {
    return {
      name: this.name,
      metadata: this.metadata,
      oracleAuthority: this.oracleAuthority,
      lastHeartbeat: this.lastHeartbeat.toString(),
      numInUse: this.numInUse,
      tokenAccount: this.tokenAccount,
      queuePubkey: this.queuePubkey,
      metrics: this.metrics.toJSON(),
      ebuf: this.ebuf,
    }
  }

  static fromJSON(obj: OracleAccountDataJSON): OracleAccountData {
    return new OracleAccountData({
      name: obj.name,
      metadata: obj.metadata,
      oracleAuthority: address(obj.oracleAuthority),
      lastHeartbeat: new BN(obj.lastHeartbeat),
      numInUse: obj.numInUse,
      tokenAccount: address(obj.tokenAccount),
      queuePubkey: address(obj.queuePubkey),
      metrics: types.OracleMetrics.fromJSON(obj.metrics),
      ebuf: obj.ebuf,
    })
  }
}
