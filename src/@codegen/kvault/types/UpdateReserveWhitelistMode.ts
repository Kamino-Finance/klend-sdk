import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export type InvestFields = [number]
export type InvestValue = [number]

export interface InvestJSON {
  kind: "Invest"
  value: [number]
}

export class Invest {
  static readonly discriminator = 0
  static readonly kind = "Invest"
  readonly discriminator = 0
  readonly kind = "Invest"
  readonly value: InvestValue

  constructor(value: InvestFields) {
    this.value = [value[0]]
  }

  toJSON(): InvestJSON {
    return {
      kind: "Invest",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      Invest: {
        _0: this.value[0],
      },
    }
  }
}

export type AddAllocationFields = [number]
export type AddAllocationValue = [number]

export interface AddAllocationJSON {
  kind: "AddAllocation"
  value: [number]
}

export class AddAllocation {
  static readonly discriminator = 1
  static readonly kind = "AddAllocation"
  readonly discriminator = 1
  readonly kind = "AddAllocation"
  readonly value: AddAllocationValue

  constructor(value: AddAllocationFields) {
    this.value = [value[0]]
  }

  toJSON(): AddAllocationJSON {
    return {
      kind: "AddAllocation",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      AddAllocation: {
        _0: this.value[0],
      },
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateReserveWhitelistModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("Invest" in obj) {
    const val = obj["Invest"]
    return new Invest([val["_0"]])
  }
  if ("AddAllocation" in obj) {
    const val = obj["AddAllocation"]
    return new AddAllocation([val["_0"]])
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateReserveWhitelistModeJSON
): types.UpdateReserveWhitelistModeKind {
  switch (obj.kind) {
    case "Invest": {
      return new Invest([obj.value[0]])
    }
    case "AddAllocation": {
      return new AddAllocation([obj.value[0]])
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([borsh.u8("_0")], "Invest"),
    borsh.struct([borsh.u8("_0")], "AddAllocation"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
