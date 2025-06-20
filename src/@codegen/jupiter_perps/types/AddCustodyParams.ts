import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface AddCustodyParamsFields {
  isStable: boolean
  oracle: types.OracleParamsFields
  pricing: types.PricingParamsFields
  permissions: types.PermissionsFields
  hourlyFundingBps: BN
  targetRatioBps: BN
}

export interface AddCustodyParamsJSON {
  isStable: boolean
  oracle: types.OracleParamsJSON
  pricing: types.PricingParamsJSON
  permissions: types.PermissionsJSON
  hourlyFundingBps: string
  targetRatioBps: string
}

export class AddCustodyParams {
  readonly isStable: boolean
  readonly oracle: types.OracleParams
  readonly pricing: types.PricingParams
  readonly permissions: types.Permissions
  readonly hourlyFundingBps: BN
  readonly targetRatioBps: BN

  constructor(fields: AddCustodyParamsFields) {
    this.isStable = fields.isStable
    this.oracle = new types.OracleParams({ ...fields.oracle })
    this.pricing = new types.PricingParams({ ...fields.pricing })
    this.permissions = new types.Permissions({ ...fields.permissions })
    this.hourlyFundingBps = fields.hourlyFundingBps
    this.targetRatioBps = fields.targetRatioBps
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.bool("isStable"),
        types.OracleParams.layout("oracle"),
        types.PricingParams.layout("pricing"),
        types.Permissions.layout("permissions"),
        borsh.u64("hourlyFundingBps"),
        borsh.u64("targetRatioBps"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new AddCustodyParams({
      isStable: obj.isStable,
      oracle: types.OracleParams.fromDecoded(obj.oracle),
      pricing: types.PricingParams.fromDecoded(obj.pricing),
      permissions: types.Permissions.fromDecoded(obj.permissions),
      hourlyFundingBps: obj.hourlyFundingBps,
      targetRatioBps: obj.targetRatioBps,
    })
  }

  static toEncodable(fields: AddCustodyParamsFields) {
    return {
      isStable: fields.isStable,
      oracle: types.OracleParams.toEncodable(fields.oracle),
      pricing: types.PricingParams.toEncodable(fields.pricing),
      permissions: types.Permissions.toEncodable(fields.permissions),
      hourlyFundingBps: fields.hourlyFundingBps,
      targetRatioBps: fields.targetRatioBps,
    }
  }

  toJSON(): AddCustodyParamsJSON {
    return {
      isStable: this.isStable,
      oracle: this.oracle.toJSON(),
      pricing: this.pricing.toJSON(),
      permissions: this.permissions.toJSON(),
      hourlyFundingBps: this.hourlyFundingBps.toString(),
      targetRatioBps: this.targetRatioBps.toString(),
    }
  }

  static fromJSON(obj: AddCustodyParamsJSON): AddCustodyParams {
    return new AddCustodyParams({
      isStable: obj.isStable,
      oracle: types.OracleParams.fromJSON(obj.oracle),
      pricing: types.PricingParams.fromJSON(obj.pricing),
      permissions: types.Permissions.fromJSON(obj.permissions),
      hourlyFundingBps: new BN(obj.hourlyFundingBps),
      targetRatioBps: new BN(obj.targetRatioBps),
    })
  }

  toEncodable() {
    return AddCustodyParams.toEncodable(this)
  }
}
