import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export type BoolFields = [boolean]
export type BoolValue = [boolean]

export interface BoolJSON {
  kind: "Bool"
  value: [boolean]
}

export class Bool {
  static readonly discriminator = 0
  static readonly kind = "Bool"
  readonly discriminator = 0
  readonly kind = "Bool"
  readonly value: BoolValue

  constructor(value: BoolFields) {
    this.value = [value[0]]
  }

  toJSON(): BoolJSON {
    return {
      kind: "Bool",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      Bool: {
        _0: this.value[0],
      },
    }
  }
}

export type U8Fields = [number]
export type U8Value = [number]

export interface U8JSON {
  kind: "U8"
  value: [number]
}

export class U8 {
  static readonly discriminator = 1
  static readonly kind = "U8"
  readonly discriminator = 1
  readonly kind = "U8"
  readonly value: U8Value

  constructor(value: U8Fields) {
    this.value = [value[0]]
  }

  toJSON(): U8JSON {
    return {
      kind: "U8",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      U8: {
        _0: this.value[0],
      },
    }
  }
}

export type U8ArrayFields = [Array<number>]
export type U8ArrayValue = [Array<number>]

export interface U8ArrayJSON {
  kind: "U8Array"
  value: [Array<number>]
}

export class U8Array {
  static readonly discriminator = 2
  static readonly kind = "U8Array"
  readonly discriminator = 2
  readonly kind = "U8Array"
  readonly value: U8ArrayValue

  constructor(value: U8ArrayFields) {
    this.value = [value[0]]
  }

  toJSON(): U8ArrayJSON {
    return {
      kind: "U8Array",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      U8Array: {
        _0: this.value[0],
      },
    }
  }
}

export type U16Fields = [number]
export type U16Value = [number]

export interface U16JSON {
  kind: "U16"
  value: [number]
}

export class U16 {
  static readonly discriminator = 3
  static readonly kind = "U16"
  readonly discriminator = 3
  readonly kind = "U16"
  readonly value: U16Value

  constructor(value: U16Fields) {
    this.value = [value[0]]
  }

  toJSON(): U16JSON {
    return {
      kind: "U16",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      U16: {
        _0: this.value[0],
      },
    }
  }
}

export type U64Fields = [BN]
export type U64Value = [BN]

export interface U64JSON {
  kind: "U64"
  value: [string]
}

export class U64 {
  static readonly discriminator = 4
  static readonly kind = "U64"
  readonly discriminator = 4
  readonly kind = "U64"
  readonly value: U64Value

  constructor(value: U64Fields) {
    this.value = [value[0]]
  }

  toJSON(): U64JSON {
    return {
      kind: "U64",
      value: [this.value[0].toString()],
    }
  }

  toEncodable() {
    return {
      U64: {
        _0: this.value[0],
      },
    }
  }
}

export type U128Fields = [BN]
export type U128Value = [BN]

export interface U128JSON {
  kind: "U128"
  value: [string]
}

export class U128 {
  static readonly discriminator = 5
  static readonly kind = "U128"
  readonly discriminator = 5
  readonly kind = "U128"
  readonly value: U128Value

  constructor(value: U128Fields) {
    this.value = [value[0]]
  }

  toJSON(): U128JSON {
    return {
      kind: "U128",
      value: [this.value[0].toString()],
    }
  }

  toEncodable() {
    return {
      U128: {
        _0: this.value[0],
      },
    }
  }
}

export type PubkeyFields = [Address]
export type PubkeyValue = [Address]

export interface PubkeyJSON {
  kind: "Pubkey"
  value: [string]
}

export class Pubkey {
  static readonly discriminator = 6
  static readonly kind = "Pubkey"
  readonly discriminator = 6
  readonly kind = "Pubkey"
  readonly value: PubkeyValue

  constructor(value: PubkeyFields) {
    this.value = [value[0]]
  }

  toJSON(): PubkeyJSON {
    return {
      kind: "Pubkey",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      Pubkey: {
        _0: this.value[0],
      },
    }
  }
}

export type ElevationGroupFields = [types.ElevationGroupFields]
export type ElevationGroupValue = [types.ElevationGroup]

export interface ElevationGroupJSON {
  kind: "ElevationGroup"
  value: [types.ElevationGroupJSON]
}

export class ElevationGroup {
  static readonly discriminator = 7
  static readonly kind = "ElevationGroup"
  readonly discriminator = 7
  readonly kind = "ElevationGroup"
  readonly value: ElevationGroupValue

  constructor(value: ElevationGroupFields) {
    this.value = [new types.ElevationGroup({ ...value[0] })]
  }

  toJSON(): ElevationGroupJSON {
    return {
      kind: "ElevationGroup",
      value: [this.value[0].toJSON()],
    }
  }

  toEncodable() {
    return {
      ElevationGroup: {
        _0: types.ElevationGroup.toEncodable(this.value[0]),
      },
    }
  }
}

export type NameFields = [Array<number>]
export type NameValue = [Array<number>]

export interface NameJSON {
  kind: "Name"
  value: [Array<number>]
}

export class Name {
  static readonly discriminator = 8
  static readonly kind = "Name"
  readonly discriminator = 8
  readonly kind = "Name"
  readonly value: NameValue

  constructor(value: NameFields) {
    this.value = [value[0]]
  }

  toJSON(): NameJSON {
    return {
      kind: "Name",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      Name: {
        _0: this.value[0],
      },
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(
  obj: any
): types.UpdateLendingMarketConfigValueKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Bool" in obj) {
    const val = obj["Bool"]
    return new Bool([val["_0"]])
  }
  if ("U8" in obj) {
    const val = obj["U8"]
    return new U8([val["_0"]])
  }
  if ("U8Array" in obj) {
    const val = obj["U8Array"]
    return new U8Array([val["_0"]])
  }
  if ("U16" in obj) {
    const val = obj["U16"]
    return new U16([val["_0"]])
  }
  if ("U64" in obj) {
    const val = obj["U64"]
    return new U64([val["_0"]])
  }
  if ("U128" in obj) {
    const val = obj["U128"]
    return new U128([val["_0"]])
  }
  if ("Pubkey" in obj) {
    const val = obj["Pubkey"]
    return new Pubkey([val["_0"]])
  }
  if ("ElevationGroup" in obj) {
    const val = obj["ElevationGroup"]
    return new ElevationGroup([types.ElevationGroup.fromDecoded(val["_0"])])
  }
  if ("Name" in obj) {
    const val = obj["Name"]
    return new Name([val["_0"]])
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateLendingMarketConfigValueJSON
): types.UpdateLendingMarketConfigValueKind {
  switch (obj.kind) {
    case "Bool": {
      return new Bool([obj.value[0]])
    }
    case "U8": {
      return new U8([obj.value[0]])
    }
    case "U8Array": {
      return new U8Array([obj.value[0]])
    }
    case "U16": {
      return new U16([obj.value[0]])
    }
    case "U64": {
      return new U64([new BN(obj.value[0])])
    }
    case "U128": {
      return new U128([new BN(obj.value[0])])
    }
    case "Pubkey": {
      return new Pubkey([address(obj.value[0])])
    }
    case "ElevationGroup": {
      return new ElevationGroup([types.ElevationGroup.fromJSON(obj.value[0])])
    }
    case "Name": {
      return new Name([obj.value[0]])
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([borsh.bool("_0")], "Bool"),
    borsh.struct([borsh.u8("_0")], "U8"),
    borsh.struct([borsh.array(borsh.u8(), 8, "_0")], "U8Array"),
    borsh.struct([borsh.u16("_0")], "U16"),
    borsh.struct([borsh.u64("_0")], "U64"),
    borsh.struct([borsh.u128("_0")], "U128"),
    borsh.struct([borshAddress("_0")], "Pubkey"),
    borsh.struct([types.ElevationGroup.layout("_0")], "ElevationGroup"),
    borsh.struct([borsh.array(borsh.u8(), 32, "_0")], "Name"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
