import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export type PendingAdminFields = [Address]
export type PendingAdminValue = [Address]

export interface PendingAdminJSON {
  kind: "PendingAdmin"
  value: [string]
}

export class PendingAdmin {
  static readonly discriminator = 0
  static readonly kind = "PendingAdmin"
  readonly discriminator = 0
  readonly kind = "PendingAdmin"
  readonly value: PendingAdminValue

  constructor(value: PendingAdminFields) {
    this.value = [value[0]]
  }

  toJSON(): PendingAdminJSON {
    return {
      kind: "PendingAdmin",
      value: [this.value[0]],
    }
  }

  toEncodable() {
    return {
      PendingAdmin: {
        _0: this.value[0],
      },
    }
  }
}

export type MinWithdrawalPenaltyLamportsFields = [BN]
export type MinWithdrawalPenaltyLamportsValue = [BN]

export interface MinWithdrawalPenaltyLamportsJSON {
  kind: "MinWithdrawalPenaltyLamports"
  value: [string]
}

export class MinWithdrawalPenaltyLamports {
  static readonly discriminator = 1
  static readonly kind = "MinWithdrawalPenaltyLamports"
  readonly discriminator = 1
  readonly kind = "MinWithdrawalPenaltyLamports"
  readonly value: MinWithdrawalPenaltyLamportsValue

  constructor(value: MinWithdrawalPenaltyLamportsFields) {
    this.value = [value[0]]
  }

  toJSON(): MinWithdrawalPenaltyLamportsJSON {
    return {
      kind: "MinWithdrawalPenaltyLamports",
      value: [this.value[0].toString()],
    }
  }

  toEncodable() {
    return {
      MinWithdrawalPenaltyLamports: {
        _0: this.value[0],
      },
    }
  }
}

export type MinWithdrawalPenaltyBPSFields = [BN]
export type MinWithdrawalPenaltyBPSValue = [BN]

export interface MinWithdrawalPenaltyBPSJSON {
  kind: "MinWithdrawalPenaltyBPS"
  value: [string]
}

export class MinWithdrawalPenaltyBPS {
  static readonly discriminator = 2
  static readonly kind = "MinWithdrawalPenaltyBPS"
  readonly discriminator = 2
  readonly kind = "MinWithdrawalPenaltyBPS"
  readonly value: MinWithdrawalPenaltyBPSValue

  constructor(value: MinWithdrawalPenaltyBPSFields) {
    this.value = [value[0]]
  }

  toJSON(): MinWithdrawalPenaltyBPSJSON {
    return {
      kind: "MinWithdrawalPenaltyBPS",
      value: [this.value[0].toString()],
    }
  }

  toEncodable() {
    return {
      MinWithdrawalPenaltyBPS: {
        _0: this.value[0],
      },
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateGlobalConfigModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("PendingAdmin" in obj) {
    const val = obj["PendingAdmin"]
    return new PendingAdmin([val["_0"]])
  }
  if ("MinWithdrawalPenaltyLamports" in obj) {
    const val = obj["MinWithdrawalPenaltyLamports"]
    return new MinWithdrawalPenaltyLamports([val["_0"]])
  }
  if ("MinWithdrawalPenaltyBPS" in obj) {
    const val = obj["MinWithdrawalPenaltyBPS"]
    return new MinWithdrawalPenaltyBPS([val["_0"]])
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateGlobalConfigModeJSON
): types.UpdateGlobalConfigModeKind {
  switch (obj.kind) {
    case "PendingAdmin": {
      return new PendingAdmin([address(obj.value[0])])
    }
    case "MinWithdrawalPenaltyLamports": {
      return new MinWithdrawalPenaltyLamports([new BN(obj.value[0])])
    }
    case "MinWithdrawalPenaltyBPS": {
      return new MinWithdrawalPenaltyBPS([new BN(obj.value[0])])
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([borshAddress("_0")], "PendingAdmin"),
    borsh.struct([borsh.u64("_0")], "MinWithdrawalPenaltyLamports"),
    borsh.struct([borsh.u64("_0")], "MinWithdrawalPenaltyBPS"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
