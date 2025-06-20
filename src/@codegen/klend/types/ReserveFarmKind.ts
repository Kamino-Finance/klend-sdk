import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface CollateralJSON {
  kind: "Collateral"
}

export class Collateral {
  static readonly discriminator = 0
  static readonly kind = "Collateral"
  readonly discriminator = 0
  readonly kind = "Collateral"

  toJSON(): CollateralJSON {
    return {
      kind: "Collateral",
    }
  }

  toEncodable() {
    return {
      Collateral: {},
    }
  }
}

export interface DebtJSON {
  kind: "Debt"
}

export class Debt {
  static readonly discriminator = 1
  static readonly kind = "Debt"
  readonly discriminator = 1
  readonly kind = "Debt"

  toJSON(): DebtJSON {
    return {
      kind: "Debt",
    }
  }

  toEncodable() {
    return {
      Debt: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.ReserveFarmKindKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Collateral" in obj) {
    return new Collateral()
  }
  if ("Debt" in obj) {
    return new Debt()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.ReserveFarmKindJSON
): types.ReserveFarmKindKind {
  switch (obj.kind) {
    case "Collateral": {
      return new Collateral()
    }
    case "Debt": {
      return new Debt()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "Collateral"),
    borsh.struct([], "Debt"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
