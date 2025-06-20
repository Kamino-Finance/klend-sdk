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

export interface CustodyFields {
  pool: Address
  mint: Address
  tokenAccount: Address
  decimals: number
  isStable: boolean
  oracle: types.OracleParamsFields
  pricing: types.PricingParamsFields
  permissions: types.PermissionsFields
  targetRatioBps: BN
  assets: types.AssetsFields
  fundingRateState: types.FundingRateStateFields
  bump: number
  tokenAccountBump: number
}

export interface CustodyJSON {
  pool: string
  mint: string
  tokenAccount: string
  decimals: number
  isStable: boolean
  oracle: types.OracleParamsJSON
  pricing: types.PricingParamsJSON
  permissions: types.PermissionsJSON
  targetRatioBps: string
  assets: types.AssetsJSON
  fundingRateState: types.FundingRateStateJSON
  bump: number
  tokenAccountBump: number
}

export class Custody {
  readonly pool: Address
  readonly mint: Address
  readonly tokenAccount: Address
  readonly decimals: number
  readonly isStable: boolean
  readonly oracle: types.OracleParams
  readonly pricing: types.PricingParams
  readonly permissions: types.Permissions
  readonly targetRatioBps: BN
  readonly assets: types.Assets
  readonly fundingRateState: types.FundingRateState
  readonly bump: number
  readonly tokenAccountBump: number

  static readonly discriminator = Buffer.from([
    1, 184, 48, 81, 93, 131, 63, 145,
  ])

  static readonly layout = borsh.struct<Custody>([
    borshAddress("pool"),
    borshAddress("mint"),
    borshAddress("tokenAccount"),
    borsh.u8("decimals"),
    borsh.bool("isStable"),
    types.OracleParams.layout("oracle"),
    types.PricingParams.layout("pricing"),
    types.Permissions.layout("permissions"),
    borsh.u64("targetRatioBps"),
    types.Assets.layout("assets"),
    types.FundingRateState.layout("fundingRateState"),
    borsh.u8("bump"),
    borsh.u8("tokenAccountBump"),
  ])

  constructor(fields: CustodyFields) {
    this.pool = fields.pool
    this.mint = fields.mint
    this.tokenAccount = fields.tokenAccount
    this.decimals = fields.decimals
    this.isStable = fields.isStable
    this.oracle = new types.OracleParams({ ...fields.oracle })
    this.pricing = new types.PricingParams({ ...fields.pricing })
    this.permissions = new types.Permissions({ ...fields.permissions })
    this.targetRatioBps = fields.targetRatioBps
    this.assets = new types.Assets({ ...fields.assets })
    this.fundingRateState = new types.FundingRateState({
      ...fields.fundingRateState,
    })
    this.bump = fields.bump
    this.tokenAccountBump = fields.tokenAccountBump
  }

  static async fetch(
    rpc: Rpc<GetAccountInfoApi>,
    address: Address,
    programId: Address = PROGRAM_ID
  ): Promise<Custody | null> {
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
  ): Promise<Array<Custody | null>> {
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

  static decode(data: Buffer): Custody {
    if (!data.slice(0, 8).equals(Custody.discriminator)) {
      throw new Error("invalid account discriminator")
    }

    const dec = Custody.layout.decode(data.slice(8))

    return new Custody({
      pool: dec.pool,
      mint: dec.mint,
      tokenAccount: dec.tokenAccount,
      decimals: dec.decimals,
      isStable: dec.isStable,
      oracle: types.OracleParams.fromDecoded(dec.oracle),
      pricing: types.PricingParams.fromDecoded(dec.pricing),
      permissions: types.Permissions.fromDecoded(dec.permissions),
      targetRatioBps: dec.targetRatioBps,
      assets: types.Assets.fromDecoded(dec.assets),
      fundingRateState: types.FundingRateState.fromDecoded(
        dec.fundingRateState
      ),
      bump: dec.bump,
      tokenAccountBump: dec.tokenAccountBump,
    })
  }

  toJSON(): CustodyJSON {
    return {
      pool: this.pool,
      mint: this.mint,
      tokenAccount: this.tokenAccount,
      decimals: this.decimals,
      isStable: this.isStable,
      oracle: this.oracle.toJSON(),
      pricing: this.pricing.toJSON(),
      permissions: this.permissions.toJSON(),
      targetRatioBps: this.targetRatioBps.toString(),
      assets: this.assets.toJSON(),
      fundingRateState: this.fundingRateState.toJSON(),
      bump: this.bump,
      tokenAccountBump: this.tokenAccountBump,
    }
  }

  static fromJSON(obj: CustodyJSON): Custody {
    return new Custody({
      pool: address(obj.pool),
      mint: address(obj.mint),
      tokenAccount: address(obj.tokenAccount),
      decimals: obj.decimals,
      isStable: obj.isStable,
      oracle: types.OracleParams.fromJSON(obj.oracle),
      pricing: types.PricingParams.fromJSON(obj.pricing),
      permissions: types.Permissions.fromJSON(obj.permissions),
      targetRatioBps: new BN(obj.targetRatioBps),
      assets: types.Assets.fromJSON(obj.assets),
      fundingRateState: types.FundingRateState.fromJSON(obj.fundingRateState),
      bump: obj.bump,
      tokenAccountBump: obj.tokenAccountBump,
    })
  }
}
