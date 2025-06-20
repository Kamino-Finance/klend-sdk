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

export interface IncreaseJSON {
  kind: "Increase"
}

export class Increase {
  static readonly discriminator = 1
  static readonly kind = "Increase"
  readonly discriminator = 1
  readonly kind = "Increase"

  toJSON(): IncreaseJSON {
    return {
      kind: "Increase",
    }
  }

  toEncodable() {
    return {
      Increase: {},
    }
  }
}

export interface DecreaseJSON {
  kind: "Decrease"
}

export class Decrease {
  static readonly discriminator = 2
  static readonly kind = "Decrease"
  readonly discriminator = 2
  readonly kind = "Decrease"

  toJSON(): DecreaseJSON {
    return {
      kind: "Decrease",
    }
  }

  toEncodable() {
    return {
      Decrease: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.RequestChangeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("None" in obj) {
    return new None()
  }
  if ("Increase" in obj) {
    return new Increase()
  }
  if ("Decrease" in obj) {
    return new Decrease()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.RequestChangeJSON
): types.RequestChangeKind {
  switch (obj.kind) {
    case "None": {
      return new None()
    }
    case "Increase": {
      return new Increase()
    }
    case "Decrease": {
      return new Decrease()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "None"),
    borsh.struct([], "Increase"),
    borsh.struct([], "Decrease"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
