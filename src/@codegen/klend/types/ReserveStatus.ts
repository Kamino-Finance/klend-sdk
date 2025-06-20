import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ActiveJSON {
  kind: "Active"
}

export class Active {
  static readonly discriminator = 0
  static readonly kind = "Active"
  readonly discriminator = 0
  readonly kind = "Active"

  toJSON(): ActiveJSON {
    return {
      kind: "Active",
    }
  }

  toEncodable() {
    return {
      Active: {},
    }
  }
}

export interface ObsoleteJSON {
  kind: "Obsolete"
}

export class Obsolete {
  static readonly discriminator = 1
  static readonly kind = "Obsolete"
  readonly discriminator = 1
  readonly kind = "Obsolete"

  toJSON(): ObsoleteJSON {
    return {
      kind: "Obsolete",
    }
  }

  toEncodable() {
    return {
      Obsolete: {},
    }
  }
}

export interface HiddenJSON {
  kind: "Hidden"
}

export class Hidden {
  static readonly discriminator = 2
  static readonly kind = "Hidden"
  readonly discriminator = 2
  readonly kind = "Hidden"

  toJSON(): HiddenJSON {
    return {
      kind: "Hidden",
    }
  }

  toEncodable() {
    return {
      Hidden: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.ReserveStatusKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Active" in obj) {
    return new Active()
  }
  if ("Obsolete" in obj) {
    return new Obsolete()
  }
  if ("Hidden" in obj) {
    return new Hidden()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.ReserveStatusJSON
): types.ReserveStatusKind {
  switch (obj.kind) {
    case "Active": {
      return new Active()
    }
    case "Obsolete": {
      return new Obsolete()
    }
    case "Hidden": {
      return new Hidden()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "Active"),
    borsh.struct([], "Obsolete"),
    borsh.struct([], "Hidden"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
