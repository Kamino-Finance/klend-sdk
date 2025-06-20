import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface SetPerpetualsConfigParamsFields {
  permissions: types.PermissionsFields
}

export interface SetPerpetualsConfigParamsJSON {
  permissions: types.PermissionsJSON
}

export class SetPerpetualsConfigParams {
  readonly permissions: types.Permissions

  constructor(fields: SetPerpetualsConfigParamsFields) {
    this.permissions = new types.Permissions({ ...fields.permissions })
  }

  static layout(property?: string) {
    return borsh.struct([types.Permissions.layout("permissions")], property)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new SetPerpetualsConfigParams({
      permissions: types.Permissions.fromDecoded(obj.permissions),
    })
  }

  static toEncodable(fields: SetPerpetualsConfigParamsFields) {
    return {
      permissions: types.Permissions.toEncodable(fields.permissions),
    }
  }

  toJSON(): SetPerpetualsConfigParamsJSON {
    return {
      permissions: this.permissions.toJSON(),
    }
  }

  static fromJSON(
    obj: SetPerpetualsConfigParamsJSON
  ): SetPerpetualsConfigParams {
    return new SetPerpetualsConfigParams({
      permissions: types.Permissions.fromJSON(obj.permissions),
    })
  }

  toEncodable() {
    return SetPerpetualsConfigParams.toEncodable(this)
  }
}
