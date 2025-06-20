import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface MinJSON {
  kind: "Min"
}

export class Min {
  static readonly discriminator = 0
  static readonly kind = "Min"
  readonly discriminator = 0
  readonly kind = "Min"

  toJSON(): MinJSON {
    return {
      kind: "Min",
    }
  }

  toEncodable() {
    return {
      Min: {},
    }
  }
}

export interface MaxJSON {
  kind: "Max"
}

export class Max {
  static readonly discriminator = 1
  static readonly kind = "Max"
  readonly discriminator = 1
  readonly kind = "Max"

  toJSON(): MaxJSON {
    return {
      kind: "Max",
    }
  }

  toEncodable() {
    return {
      Max: {},
    }
  }
}

export interface IgnoreJSON {
  kind: "Ignore"
}

export class Ignore {
  static readonly discriminator = 2
  static readonly kind = "Ignore"
  readonly discriminator = 2
  readonly kind = "Ignore"

  toJSON(): IgnoreJSON {
    return {
      kind: "Ignore",
    }
  }

  toEncodable() {
    return {
      Ignore: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.PriceCalcModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Min" in obj) {
    return new Min()
  }
  if ("Max" in obj) {
    return new Max()
  }
  if ("Ignore" in obj) {
    return new Ignore()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.PriceCalcModeJSON
): types.PriceCalcModeKind {
  switch (obj.kind) {
    case "Min": {
      return new Min()
    }
    case "Max": {
      return new Max()
    }
    case "Ignore": {
      return new Ignore()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "Min"),
    borsh.struct([], "Max"),
    borsh.struct([], "Ignore"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
