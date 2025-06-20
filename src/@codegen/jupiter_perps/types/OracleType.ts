import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface NoneJSON {
  kind: "None"
}

export class None {
  static readonly discriminator = 0
  static readonly kind = "None"
  readonly discriminator = 0
  readonly kind = "None"

  toJSON(): NoneJSON {
    return {
      kind: "None",
    }
  }

  toEncodable() {
    return {
      None: {},
    }
  }
}

export interface TestJSON {
  kind: "Test"
}

export class Test {
  static readonly discriminator = 1
  static readonly kind = "Test"
  readonly discriminator = 1
  readonly kind = "Test"

  toJSON(): TestJSON {
    return {
      kind: "Test",
    }
  }

  toEncodable() {
    return {
      Test: {},
    }
  }
}

export interface PythJSON {
  kind: "Pyth"
}

export class Pyth {
  static readonly discriminator = 2
  static readonly kind = "Pyth"
  readonly discriminator = 2
  readonly kind = "Pyth"

  toJSON(): PythJSON {
    return {
      kind: "Pyth",
    }
  }

  toEncodable() {
    return {
      Pyth: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.OracleTypeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("None" in obj) {
    return new None()
  }
  if ("Test" in obj) {
    return new Test()
  }
  if ("Pyth" in obj) {
    return new Pyth()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(obj: types.OracleTypeJSON): types.OracleTypeKind {
  switch (obj.kind) {
    case "None": {
      return new None()
    }
    case "Test": {
      return new Test()
    }
    case "Pyth": {
      return new Pyth()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "None"),
    borsh.struct([], "Test"),
    borsh.struct([], "Pyth"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
