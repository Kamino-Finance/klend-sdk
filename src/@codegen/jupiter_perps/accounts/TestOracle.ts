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

export interface TestOracleFields {
  price: BN
  expo: number
  conf: BN
  publishTime: BN
}

export interface TestOracleJSON {
  price: string
  expo: number
  conf: string
  publishTime: string
}

export class TestOracle {
  readonly price: BN
  readonly expo: number
  readonly conf: BN
  readonly publishTime: BN

  static readonly discriminator = Buffer.from([
    198, 49, 63, 134, 232, 251, 168, 28,
  ])

  static readonly layout = borsh.struct<TestOracle>([
    borsh.u64("price"),
    borsh.i32("expo"),
    borsh.u64("conf"),
    borsh.i64("publishTime"),
  ])

  constructor(fields: TestOracleFields) {
    this.price = fields.price
    this.expo = fields.expo
    this.conf = fields.conf
    this.publishTime = fields.publishTime
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<TestOracle | null> {
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
  ): Promise<Array<TestOracle | null>> {
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

  static decode(data: Buffer): TestOracle {
    if (!data.slice(0, 8).equals(TestOracle.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = TestOracle.layout.decode(data.slice(8))

    return new TestOracle({
      price: dec.price,
      expo: dec.expo,
      conf: dec.conf,
      publishTime: dec.publishTime,
    })
  }

  toJSON(): TestOracleJSON {
    return {
      price: this.price.toString(),
      expo: this.expo,
      conf: this.conf.toString(),
      publishTime: this.publishTime.toString(),
    }
  }

  static fromJSON(obj: TestOracleJSON): TestOracle {
    return new TestOracle({
      price: new BN(obj.price),
      expo: obj.expo,
      conf: new BN(obj.conf),
      publishTime: new BN(obj.publishTime),
    })
  }
}
