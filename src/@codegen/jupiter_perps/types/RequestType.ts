import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface MarketJSON {
  kind: "Market"
}

export class Market {
  static readonly discriminator = 0
  static readonly kind = "Market"
  readonly discriminator = 0
  readonly kind = "Market"

  toJSON(): MarketJSON {
    return {
      kind: "Market",
    }
  }

  toEncodable() {
    return {
      Market: {},
    }
  }
}

export interface TriggerJSON {
  kind: "Trigger"
}

export class Trigger {
  static readonly discriminator = 1
  static readonly kind = "Trigger"
  readonly discriminator = 1
  readonly kind = "Trigger"

  toJSON(): TriggerJSON {
    return {
      kind: "Trigger",
    }
  }

  toEncodable() {
    return {
      Trigger: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.RequestTypeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Market" in obj) {
    return new Market()
  }
  if ("Trigger" in obj) {
    return new Trigger()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(obj: types.RequestTypeJSON): types.RequestTypeKind {
  switch (obj.kind) {
    case "Market": {
      return new Market()
    }
    case "Trigger": {
      return new Trigger()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "Market"),
    borsh.struct([], "Trigger"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
