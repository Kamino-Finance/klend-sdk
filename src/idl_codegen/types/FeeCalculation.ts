import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface ExclusiveJSON {
  kind: "Exclusive"
}

export class Exclusive {
  static readonly discriminator = 0
  static readonly kind = "Exclusive"
  readonly discriminator = 0
  readonly kind = "Exclusive"

  toJSON(): ExclusiveJSON {
    return {
      kind: "Exclusive",
    }
  }

  toEncodable() {
    return {
      Exclusive: {},
    }
  }
}

export interface InclusiveJSON {
  kind: "Inclusive"
}

export class Inclusive {
  static readonly discriminator = 1
  static readonly kind = "Inclusive"
  readonly discriminator = 1
  readonly kind = "Inclusive"

  toJSON(): InclusiveJSON {
    return {
      kind: "Inclusive",
    }
  }

  toEncodable() {
    return {
      Inclusive: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.FeeCalculationKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Exclusive" in obj) {
    return new Exclusive()
  }
  if ("Inclusive" in obj) {
    return new Inclusive()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.FeeCalculationJSON
): types.FeeCalculationKind {
  switch (obj.kind) {
    case "Exclusive": {
      return new Exclusive()
    }
    case "Inclusive": {
      return new Inclusive()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "Exclusive"),
    borsh.struct([], "Inclusive"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
