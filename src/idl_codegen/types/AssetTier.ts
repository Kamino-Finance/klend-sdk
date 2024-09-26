import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface RegularJSON {
  kind: "Regular"
}

export class Regular {
  static readonly discriminator = 0
  static readonly kind = "Regular"
  readonly discriminator = 0
  readonly kind = "Regular"

  toJSON(): RegularJSON {
    return {
      kind: "Regular",
    }
  }

  toEncodable() {
    return {
      Regular: {},
    }
  }
}

export interface IsolatedCollateralJSON {
  kind: "IsolatedCollateral"
}

export class IsolatedCollateral {
  static readonly discriminator = 1
  static readonly kind = "IsolatedCollateral"
  readonly discriminator = 1
  readonly kind = "IsolatedCollateral"

  toJSON(): IsolatedCollateralJSON {
    return {
      kind: "IsolatedCollateral",
    }
  }

  toEncodable() {
    return {
      IsolatedCollateral: {},
    }
  }
}

export interface IsolatedDebtJSON {
  kind: "IsolatedDebt"
}

export class IsolatedDebt {
  static readonly discriminator = 2
  static readonly kind = "IsolatedDebt"
  readonly discriminator = 2
  readonly kind = "IsolatedDebt"

  toJSON(): IsolatedDebtJSON {
    return {
      kind: "IsolatedDebt",
    }
  }

  toEncodable() {
    return {
      IsolatedDebt: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.AssetTierKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Regular" in obj) {
    return new Regular()
  }
  if ("IsolatedCollateral" in obj) {
    return new IsolatedCollateral()
  }
  if ("IsolatedDebt" in obj) {
    return new IsolatedDebt()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(obj: types.AssetTierJSON): types.AssetTierKind {
  switch (obj.kind) {
    case "Regular": {
      return new Regular()
    }
    case "IsolatedCollateral": {
      return new IsolatedCollateral()
    }
    case "IsolatedDebt": {
      return new IsolatedDebt()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "Regular"),
    borsh.struct([], "IsolatedCollateral"),
    borsh.struct([], "IsolatedDebt"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
