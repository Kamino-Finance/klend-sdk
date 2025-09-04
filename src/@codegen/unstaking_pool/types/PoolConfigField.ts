import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ActionAuthorityJSON {
  kind: "ActionAuthority"
}

export class ActionAuthority {
  static readonly discriminator = 0
  static readonly kind = "ActionAuthority"
  readonly discriminator = 0
  readonly kind = "ActionAuthority"

  toJSON(): ActionAuthorityJSON {
    return {
      kind: "ActionAuthority",
    }
  }

  toEncodable() {
    return {
      ActionAuthority: {},
    }
  }
}

export interface LookupTableJSON {
  kind: "LookupTable"
}

export class LookupTable {
  static readonly discriminator = 1
  static readonly kind = "LookupTable"
  readonly discriminator = 1
  readonly kind = "LookupTable"

  toJSON(): LookupTableJSON {
    return {
      kind: "LookupTable",
    }
  }

  toEncodable() {
    return {
      LookupTable: {},
    }
  }
}

export interface PendingAdminJSON {
  kind: "PendingAdmin"
}

export class PendingAdmin {
  static readonly discriminator = 2
  static readonly kind = "PendingAdmin"
  readonly discriminator = 2
  readonly kind = "PendingAdmin"

  toJSON(): PendingAdminJSON {
    return {
      kind: "PendingAdmin",
    }
  }

  toEncodable() {
    return {
      PendingAdmin: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.PoolConfigFieldKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("ActionAuthority" in obj) {
    return new ActionAuthority()
  }
  if ("LookupTable" in obj) {
    return new LookupTable()
  }
  if ("PendingAdmin" in obj) {
    return new PendingAdmin()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.PoolConfigFieldJSON
): types.PoolConfigFieldKind {
  switch (obj.kind) {
    case "ActionAuthority": {
      return new ActionAuthority()
    }
    case "LookupTable": {
      return new LookupTable()
    }
    case "PendingAdmin": {
      return new PendingAdmin()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "ActionAuthority"),
    borsh.struct([], "LookupTable"),
    borsh.struct([], "PendingAdmin"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
