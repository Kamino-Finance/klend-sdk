import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface VaultAllocationFields {
  reserve: Address
  ctokenVault: Address
  targetAllocationWeight: BN
  /** Maximum token invested in this reserve */
  tokenAllocationCap: BN
  ctokenVaultBump: BN
  configPadding: Array<BN>
  ctokenAllocation: BN
  lastInvestSlot: BN
  tokenTargetAllocationSf: BN
  statePadding: Array<BN>
}

export interface VaultAllocationJSON {
  reserve: string
  ctokenVault: string
  targetAllocationWeight: string
  /** Maximum token invested in this reserve */
  tokenAllocationCap: string
  ctokenVaultBump: string
  configPadding: Array<string>
  ctokenAllocation: string
  lastInvestSlot: string
  tokenTargetAllocationSf: string
  statePadding: Array<string>
}

export class VaultAllocation {
  readonly reserve: Address
  readonly ctokenVault: Address
  readonly targetAllocationWeight: BN
  /** Maximum token invested in this reserve */
  readonly tokenAllocationCap: BN
  readonly ctokenVaultBump: BN
  readonly configPadding: Array<BN>
  readonly ctokenAllocation: BN
  readonly lastInvestSlot: BN
  readonly tokenTargetAllocationSf: BN
  readonly statePadding: Array<BN>

  constructor(fields: VaultAllocationFields) {
    this.reserve = fields.reserve
    this.ctokenVault = fields.ctokenVault
    this.targetAllocationWeight = fields.targetAllocationWeight
    this.tokenAllocationCap = fields.tokenAllocationCap
    this.ctokenVaultBump = fields.ctokenVaultBump
    this.configPadding = fields.configPadding
    this.ctokenAllocation = fields.ctokenAllocation
    this.lastInvestSlot = fields.lastInvestSlot
    this.tokenTargetAllocationSf = fields.tokenTargetAllocationSf
    this.statePadding = fields.statePadding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borshAddress("reserve"),
        borshAddress("ctokenVault"),
        borsh.u64("targetAllocationWeight"),
        borsh.u64("tokenAllocationCap"),
        borsh.u64("ctokenVaultBump"),
        borsh.array(borsh.u64(), 127, "configPadding"),
        borsh.u64("ctokenAllocation"),
        borsh.u64("lastInvestSlot"),
        borsh.u128("tokenTargetAllocationSf"),
        borsh.array(borsh.u64(), 128, "statePadding"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new VaultAllocation({
      reserve: obj.reserve,
      ctokenVault: obj.ctokenVault,
      targetAllocationWeight: obj.targetAllocationWeight,
      tokenAllocationCap: obj.tokenAllocationCap,
      ctokenVaultBump: obj.ctokenVaultBump,
      configPadding: obj.configPadding,
      ctokenAllocation: obj.ctokenAllocation,
      lastInvestSlot: obj.lastInvestSlot,
      tokenTargetAllocationSf: obj.tokenTargetAllocationSf,
      statePadding: obj.statePadding,
    })
  }

  static toEncodable(fields: VaultAllocationFields) {
    return {
      reserve: fields.reserve,
      ctokenVault: fields.ctokenVault,
      targetAllocationWeight: fields.targetAllocationWeight,
      tokenAllocationCap: fields.tokenAllocationCap,
      ctokenVaultBump: fields.ctokenVaultBump,
      configPadding: fields.configPadding,
      ctokenAllocation: fields.ctokenAllocation,
      lastInvestSlot: fields.lastInvestSlot,
      tokenTargetAllocationSf: fields.tokenTargetAllocationSf,
      statePadding: fields.statePadding,
    }
  }

  toJSON(): VaultAllocationJSON {
    return {
      reserve: this.reserve,
      ctokenVault: this.ctokenVault,
      targetAllocationWeight: this.targetAllocationWeight.toString(),
      tokenAllocationCap: this.tokenAllocationCap.toString(),
      ctokenVaultBump: this.ctokenVaultBump.toString(),
      configPadding: this.configPadding.map((item) => item.toString()),
      ctokenAllocation: this.ctokenAllocation.toString(),
      lastInvestSlot: this.lastInvestSlot.toString(),
      tokenTargetAllocationSf: this.tokenTargetAllocationSf.toString(),
      statePadding: this.statePadding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: VaultAllocationJSON): VaultAllocation {
    return new VaultAllocation({
      reserve: address(obj.reserve),
      ctokenVault: address(obj.ctokenVault),
      targetAllocationWeight: new BN(obj.targetAllocationWeight),
      tokenAllocationCap: new BN(obj.tokenAllocationCap),
      ctokenVaultBump: new BN(obj.ctokenVaultBump),
      configPadding: obj.configPadding.map((item) => new BN(item)),
      ctokenAllocation: new BN(obj.ctokenAllocation),
      lastInvestSlot: new BN(obj.lastInvestSlot),
      tokenTargetAllocationSf: new BN(obj.tokenTargetAllocationSf),
      statePadding: obj.statePadding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return VaultAllocation.toEncodable(this)
  }
}
