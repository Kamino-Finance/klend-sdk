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

export interface LongJSON {
  kind: "Long"
}

export class Long {
  static readonly discriminator = 1
  static readonly kind = "Long"
  readonly discriminator = 1
  readonly kind = "Long"

  toJSON(): LongJSON {
    return {
      kind: "Long",
    }
  }

  toEncodable() {
    return {
      Long: {},
    }
  }
}

export interface ShortJSON {
  kind: "Short"
}

export class Short {
  static readonly discriminator = 2
  static readonly kind = "Short"
  readonly discriminator = 2
  readonly kind = "Short"

  toJSON(): ShortJSON {
    return {
      kind: "Short",
    }
  }

  toEncodable() {
    return {
      Short: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.SideKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("None" in obj) {
    return new None()
  }
  if ("Long" in obj) {
    return new Long()
  }
  if ("Short" in obj) {
    return new Short()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(obj: types.SideJSON): types.SideKind {
  switch (obj.kind) {
    case "None": {
      return new None()
    }
    case "Long": {
      return new Long()
    }
    case "Short": {
      return new Short()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "None"),
    borsh.struct([], "Long"),
    borsh.struct([], "Short"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
