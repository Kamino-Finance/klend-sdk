import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

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

export interface MinInvestAmountJSON {
  kind: "MinInvestAmount"
}

export class MinInvestAmount {
  static readonly discriminator = 4
  static readonly kind = "MinInvestAmount"
  readonly discriminator = 4
  readonly kind = "MinInvestAmount"

  toJSON(): MinInvestAmountJSON {
    return {
      kind: "MinInvestAmount",
    }
  }

  toEncodable() {
    return {
      MinInvestAmount: {},
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

export interface NameJSON {
  kind: "Name"
}

export class Name {
  static readonly discriminator = 8
  static readonly kind = "Name"
  readonly discriminator = 8
  readonly kind = "Name"

  toJSON(): NameJSON {
    return {
      kind: "Name",
    }
  }

  toEncodable() {
    return {
      Name: {},
    }
  }
}

export interface LookupTableJSON {
  kind: "LookupTable"
}

export class LookupTable {
  static readonly discriminator = 9
  static readonly kind = "LookupTable"
  readonly discriminator = 9
  readonly kind = "LookupTable"

  toJSON(): LookupTableJSON {
    return {
      kind: "LookupTable",
    }
  }

  toEncodable() {
    return {
      LookupTable: {},
    }
  }
}

export interface FarmJSON {
  kind: "Farm"
}

export class Farm {
  static readonly discriminator = 10
  static readonly kind = "Farm"
  readonly discriminator = 10
  readonly kind = "Farm"

  toJSON(): FarmJSON {
    return {
      kind: "Farm",
    }
  }

  toEncodable() {
    return {
      Farm: {},
    }
  }
}

export interface AllocationAdminJSON {
  kind: "AllocationAdmin"
}

export class AllocationAdmin {
  static readonly discriminator = 11
  static readonly kind = "AllocationAdmin"
  readonly discriminator = 11
  readonly kind = "AllocationAdmin"

  toJSON(): AllocationAdminJSON {
    return {
      kind: "AllocationAdmin",
    }
  }

  toEncodable() {
    return {
      AllocationAdmin: {},
    }
  }
}

export interface UnallocatedWeightJSON {
  kind: "UnallocatedWeight"
}

export class UnallocatedWeight {
  static readonly discriminator = 12
  static readonly kind = "UnallocatedWeight"
  readonly discriminator = 12
  readonly kind = "UnallocatedWeight"

  toJSON(): UnallocatedWeightJSON {
    return {
      kind: "UnallocatedWeight",
    }
  }

  toEncodable() {
    return {
      UnallocatedWeight: {},
    }
  }
}

export interface UnallocatedTokensCapJSON {
  kind: "UnallocatedTokensCap"
}

export class UnallocatedTokensCap {
  static readonly discriminator = 13
  static readonly kind = "UnallocatedTokensCap"
  readonly discriminator = 13
  readonly kind = "UnallocatedTokensCap"

  toJSON(): UnallocatedTokensCapJSON {
    return {
      kind: "UnallocatedTokensCap",
    }
  }

  toEncodable() {
    return {
      UnallocatedTokensCap: {},
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
  if ("MinInvestAmount" in obj) {
    return new MinInvestAmount()
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
  if ("Name" in obj) {
    return new Name()
  }
  if ("LookupTable" in obj) {
    return new LookupTable()
  }
  if ("Farm" in obj) {
    return new Farm()
  }
  if ("AllocationAdmin" in obj) {
    return new AllocationAdmin()
  }
  if ("UnallocatedWeight" in obj) {
    return new UnallocatedWeight()
  }
  if ("UnallocatedTokensCap" in obj) {
    return new UnallocatedTokensCap()
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
    case "MinInvestAmount": {
      return new MinInvestAmount()
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
    case "Name": {
      return new Name()
    }
    case "LookupTable": {
      return new LookupTable()
    }
    case "Farm": {
      return new Farm()
    }
    case "AllocationAdmin": {
      return new AllocationAdmin()
    }
    case "UnallocatedWeight": {
      return new UnallocatedWeight()
    }
    case "UnallocatedTokensCap": {
      return new UnallocatedTokensCap()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "PerformanceFeeBps"),
    borsh.struct([], "ManagementFeeBps"),
    borsh.struct([], "MinDepositAmount"),
    borsh.struct([], "MinWithdrawAmount"),
    borsh.struct([], "MinInvestAmount"),
    borsh.struct([], "MinInvestDelaySlots"),
    borsh.struct([], "CrankFundFeePerReserve"),
    borsh.struct([], "PendingVaultAdmin"),
    borsh.struct([], "Name"),
    borsh.struct([], "LookupTable"),
    borsh.struct([], "Farm"),
    borsh.struct([], "AllocationAdmin"),
    borsh.struct([], "UnallocatedWeight"),
    borsh.struct([], "UnallocatedTokensCap"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
