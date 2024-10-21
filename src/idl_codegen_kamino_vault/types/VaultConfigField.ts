import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface PerformanceFeeBpsJSON {
  kind: "PerformanceFeeBps"
}

export class PerformanceFeeBps {
  static readonly discriminator = 0
  static readonly kind = "PerformanceFeeBps"
  readonly discriminator = 0
  readonly kind = "PerformanceFeeBps"

  toJSON(): PerformanceFeeBpsJSON {
    return {
      kind: "PerformanceFeeBps",
    }
  }

  toEncodable() {
    return {
      PerformanceFeeBps: {},
    }
  }
}

export interface ManagementFeeBpsJSON {
  kind: "ManagementFeeBps"
}

export class ManagementFeeBps {
  static readonly discriminator = 1
  static readonly kind = "ManagementFeeBps"
  readonly discriminator = 1
  readonly kind = "ManagementFeeBps"

  toJSON(): ManagementFeeBpsJSON {
    return {
      kind: "ManagementFeeBps",
    }
  }

  toEncodable() {
    return {
      ManagementFeeBps: {},
    }
  }
}

export interface MinDepositAmountJSON {
  kind: "MinDepositAmount"
}

export class MinDepositAmount {
  static readonly discriminator = 2
  static readonly kind = "MinDepositAmount"
  readonly discriminator = 2
  readonly kind = "MinDepositAmount"

  toJSON(): MinDepositAmountJSON {
    return {
      kind: "MinDepositAmount",
    }
  }

  toEncodable() {
    return {
      MinDepositAmount: {},
    }
  }
}

export interface MinWithdrawAmountJSON {
  kind: "MinWithdrawAmount"
}

export class MinWithdrawAmount {
  static readonly discriminator = 3
  static readonly kind = "MinWithdrawAmount"
  readonly discriminator = 3
  readonly kind = "MinWithdrawAmount"

  toJSON(): MinWithdrawAmountJSON {
    return {
      kind: "MinWithdrawAmount",
    }
  }

  toEncodable() {
    return {
      MinWithdrawAmount: {},
    }
  }
}

export interface MintInvestAmountJSON {
  kind: "MintInvestAmount"
}

export class MintInvestAmount {
  static readonly discriminator = 4
  static readonly kind = "MintInvestAmount"
  readonly discriminator = 4
  readonly kind = "MintInvestAmount"

  toJSON(): MintInvestAmountJSON {
    return {
      kind: "MintInvestAmount",
    }
  }

  toEncodable() {
    return {
      MintInvestAmount: {},
    }
  }
}

export interface MinInvestDelaySlotsJSON {
  kind: "MinInvestDelaySlots"
}

export class MinInvestDelaySlots {
  static readonly discriminator = 5
  static readonly kind = "MinInvestDelaySlots"
  readonly discriminator = 5
  readonly kind = "MinInvestDelaySlots"

  toJSON(): MinInvestDelaySlotsJSON {
    return {
      kind: "MinInvestDelaySlots",
    }
  }

  toEncodable() {
    return {
      MinInvestDelaySlots: {},
    }
  }
}

export interface CrankFundFeePerReserveJSON {
  kind: "CrankFundFeePerReserve"
}

export class CrankFundFeePerReserve {
  static readonly discriminator = 6
  static readonly kind = "CrankFundFeePerReserve"
  readonly discriminator = 6
  readonly kind = "CrankFundFeePerReserve"

  toJSON(): CrankFundFeePerReserveJSON {
    return {
      kind: "CrankFundFeePerReserve",
    }
  }

  toEncodable() {
    return {
      CrankFundFeePerReserve: {},
    }
  }
}

export interface PendingVaultAdminJSON {
  kind: "PendingVaultAdmin"
}

export class PendingVaultAdmin {
  static readonly discriminator = 7
  static readonly kind = "PendingVaultAdmin"
  readonly discriminator = 7
  readonly kind = "PendingVaultAdmin"

  toJSON(): PendingVaultAdminJSON {
    return {
      kind: "PendingVaultAdmin",
    }
  }

  toEncodable() {
    return {
      PendingVaultAdmin: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.VaultConfigFieldKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("PerformanceFeeBps" in obj) {
    return new PerformanceFeeBps()
  }
  if ("ManagementFeeBps" in obj) {
    return new ManagementFeeBps()
  }
  if ("MinDepositAmount" in obj) {
    return new MinDepositAmount()
  }
  if ("MinWithdrawAmount" in obj) {
    return new MinWithdrawAmount()
  }
  if ("MintInvestAmount" in obj) {
    return new MintInvestAmount()
  }
  if ("MinInvestDelaySlots" in obj) {
    return new MinInvestDelaySlots()
  }
  if ("CrankFundFeePerReserve" in obj) {
    return new CrankFundFeePerReserve()
  }
  if ("PendingVaultAdmin" in obj) {
    return new PendingVaultAdmin()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.VaultConfigFieldJSON
): types.VaultConfigFieldKind {
  switch (obj.kind) {
    case "PerformanceFeeBps": {
      return new PerformanceFeeBps()
    }
    case "ManagementFeeBps": {
      return new ManagementFeeBps()
    }
    case "MinDepositAmount": {
      return new MinDepositAmount()
    }
    case "MinWithdrawAmount": {
      return new MinWithdrawAmount()
    }
    case "MintInvestAmount": {
      return new MintInvestAmount()
    }
    case "MinInvestDelaySlots": {
      return new MinInvestDelaySlots()
    }
    case "CrankFundFeePerReserve": {
      return new CrankFundFeePerReserve()
    }
    case "PendingVaultAdmin": {
      return new PendingVaultAdmin()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "PerformanceFeeBps"),
    borsh.struct([], "ManagementFeeBps"),
    borsh.struct([], "MinDepositAmount"),
    borsh.struct([], "MinWithdrawAmount"),
    borsh.struct([], "MintInvestAmount"),
    borsh.struct([], "MinInvestDelaySlots"),
    borsh.struct([], "CrankFundFeePerReserve"),
    borsh.struct([], "PendingVaultAdmin"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
