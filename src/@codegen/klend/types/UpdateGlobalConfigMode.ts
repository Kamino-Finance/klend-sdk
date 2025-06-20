import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PendingAdminJSON {
  kind: "PendingAdmin"
}

export class PendingAdmin {
  static readonly discriminator = 0
  static readonly kind = "PendingAdmin"
  readonly discriminator = 0
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

export interface FeeCollectorJSON {
  kind: "FeeCollector"
}

export class FeeCollector {
  static readonly discriminator = 1
  static readonly kind = "FeeCollector"
  readonly discriminator = 1
  readonly kind = "FeeCollector"

  toJSON(): FeeCollectorJSON {
    return {
      kind: "FeeCollector",
    }
  }

  toEncodable() {
    return {
      FeeCollector: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateGlobalConfigModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("PendingAdmin" in obj) {
    return new PendingAdmin()
  }
  if ("FeeCollector" in obj) {
    return new FeeCollector()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateGlobalConfigModeJSON
): types.UpdateGlobalConfigModeKind {
  switch (obj.kind) {
    case "PendingAdmin": {
      return new PendingAdmin()
    }
    case "FeeCollector": {
      return new FeeCollector()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "PendingAdmin"),
    borsh.struct([], "FeeCollector"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
