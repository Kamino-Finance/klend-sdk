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

export interface ConfigFields {
  governanceAuthority: Address
  targetGovernanceAuthority: Address | null
  wormhole: Address
  validDataSources: Array<types.DataSourceFields>
  singleUpdateFeeInLamports: BN
  minimumSignatures: number
}

export interface ConfigJSON {
  governanceAuthority: string
  targetGovernanceAuthority: string | null
  wormhole: string
  validDataSources: Array<types.DataSourceJSON>
  singleUpdateFeeInLamports: string
  minimumSignatures: number
}

export class Config {
  readonly governanceAuthority: Address
  readonly targetGovernanceAuthority: Address | null
  readonly wormhole: Address
  readonly validDataSources: Array<types.DataSource>
  readonly singleUpdateFeeInLamports: BN
  readonly minimumSignatures: number

  static readonly discriminator = Buffer.from([
    155, 12, 170, 224, 30, 250, 204, 130,
  ])

  static readonly layout = borsh.struct<Config>([
    borshAddress("governanceAuthority"),
    borsh.option(borshAddress(), "targetGovernanceAuthority"),
    borshAddress("wormhole"),
    borsh.vec(types.DataSource.layout(), "validDataSources"),
    borsh.u64("singleUpdateFeeInLamports"),
    borsh.u8("minimumSignatures"),
  ])

  constructor(fields: ConfigFields) {
    this.governanceAuthority = fields.governanceAuthority
    this.targetGovernanceAuthority = fields.targetGovernanceAuthority
    this.wormhole = fields.wormhole
    this.validDataSources = fields.validDataSources.map(
      (item) => new types.DataSource({ ...item })
    )
    this.singleUpdateFeeInLamports = fields.singleUpdateFeeInLamports
    this.minimumSignatures = fields.minimumSignatures
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<Config | null> {
    const info = await fetchEncodedAccount(rpc, address)

    if (!info.exists) {
      return null
    }
    if (info.programAddress !== programId) {
      throw new Error(
        `ConfigFields account ${address} belongs to wrong program ${info.programAddress}, expected ${programId}`
      )
    }

    return this.decode(Buffer.from(info.data))
  }

  static async fetchMultiple(
    rpc: Rpc<GetMultipleAccountsApi>,
    addresses: Address[],
    programId: Address = PROGRAM_ID
  ): Promise<Array<Config | null>> {
    const infos = await fetchEncodedAccounts(rpc, addresses)

    return infos.map((info) => {
      if (!info.exists) {
        return null
      }
      if (info.programAddress !== programId) {
        throw new Error(
          `ConfigFields account ${info.address} belongs to wrong program ${info.programAddress}, expected ${programId}`
        )
      }

      return this.decode(Buffer.from(info.data))
    })
  }

  static decode(data: Buffer): Config {
    if (!data.slice(0, 8).equals(Config.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Config.layout.decode(data.slice(8))

    return new Config({
      governanceAuthority: dec.governanceAuthority,
      targetGovernanceAuthority: dec.targetGovernanceAuthority,
      wormhole: dec.wormhole,
      validDataSources: dec.validDataSources.map(
        (
          item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        ) => types.DataSource.fromDecoded(item)
      ),
      singleUpdateFeeInLamports: dec.singleUpdateFeeInLamports,
      minimumSignatures: dec.minimumSignatures,
    })
  }

  toJSON(): ConfigJSON {
    return {
      governanceAuthority: this.governanceAuthority,
      targetGovernanceAuthority: this.targetGovernanceAuthority,
      wormhole: this.wormhole,
      validDataSources: this.validDataSources.map((item) => item.toJSON()),
      singleUpdateFeeInLamports: this.singleUpdateFeeInLamports.toString(),
      minimumSignatures: this.minimumSignatures,
    }
  }

  static fromJSON(obj: ConfigJSON): Config {
    return new Config({
      governanceAuthority: address(obj.governanceAuthority),
      targetGovernanceAuthority:
        (obj.targetGovernanceAuthority &&
          address(obj.targetGovernanceAuthority)) ||
        null,
      wormhole: address(obj.wormhole),
      validDataSources: obj.validDataSources.map((item) =>
        types.DataSource.fromJSON(item)
      ),
      singleUpdateFeeInLamports: new BN(obj.singleUpdateFeeInLamports),
      minimumSignatures: obj.minimumSignatures,
    })
  }
}
