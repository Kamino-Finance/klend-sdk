import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface VaultAllocationFields {
  reserve: PublicKey
  ctokenVault: PublicKey
  targetAllocationWeight: BN
  /** Maximum token invested in this reserve */
  tokenAllocationCap: BN
  configPadding: Array<BN>
  cTokenAllocation: BN
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
  configPadding: Array<string>
  cTokenAllocation: string
  lastInvestSlot: string
  tokenTargetAllocationSf: string
  statePadding: Array<string>
}

export class VaultAllocation {
  readonly reserve: PublicKey
  readonly ctokenVault: PublicKey
  readonly targetAllocationWeight: BN
  /** Maximum token invested in this reserve */
  readonly tokenAllocationCap: BN
  readonly configPadding: Array<BN>
  readonly cTokenAllocation: BN
  readonly lastInvestSlot: BN
  readonly tokenTargetAllocationSf: BN
  readonly statePadding: Array<BN>

  constructor(fields: VaultAllocationFields) {
    this.reserve = fields.reserve
    this.ctokenVault = fields.ctokenVault
    this.targetAllocationWeight = fields.targetAllocationWeight
    this.tokenAllocationCap = fields.tokenAllocationCap
    this.configPadding = fields.configPadding
    this.cTokenAllocation = fields.cTokenAllocation
    this.lastInvestSlot = fields.lastInvestSlot
    this.tokenTargetAllocationSf = fields.tokenTargetAllocationSf
    this.statePadding = fields.statePadding
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.publicKey("reserve"),
        borsh.publicKey("ctokenVault"),
        borsh.u64("targetAllocationWeight"),
        borsh.u64("tokenAllocationCap"),
        borsh.array(borsh.u64(), 128, "configPadding"),
        borsh.u64("cTokenAllocation"),
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
      configPadding: obj.configPadding,
      cTokenAllocation: obj.cTokenAllocation,
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
      configPadding: fields.configPadding,
      cTokenAllocation: fields.cTokenAllocation,
      lastInvestSlot: fields.lastInvestSlot,
      tokenTargetAllocationSf: fields.tokenTargetAllocationSf,
      statePadding: fields.statePadding,
    }
  }

  toJSON(): VaultAllocationJSON {
    return {
      reserve: this.reserve.toString(),
      ctokenVault: this.ctokenVault.toString(),
      targetAllocationWeight: this.targetAllocationWeight.toString(),
      tokenAllocationCap: this.tokenAllocationCap.toString(),
      configPadding: this.configPadding.map((item) => item.toString()),
      cTokenAllocation: this.cTokenAllocation.toString(),
      lastInvestSlot: this.lastInvestSlot.toString(),
      tokenTargetAllocationSf: this.tokenTargetAllocationSf.toString(),
      statePadding: this.statePadding.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: VaultAllocationJSON): VaultAllocation {
    return new VaultAllocation({
      reserve: new PublicKey(obj.reserve),
      ctokenVault: new PublicKey(obj.ctokenVault),
      targetAllocationWeight: new BN(obj.targetAllocationWeight),
      tokenAllocationCap: new BN(obj.tokenAllocationCap),
      configPadding: obj.configPadding.map((item) => new BN(item)),
      cTokenAllocation: new BN(obj.cTokenAllocation),
      lastInvestSlot: new BN(obj.lastInvestSlot),
      tokenTargetAllocationSf: new BN(obj.tokenTargetAllocationSf),
      statePadding: obj.statePadding.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return VaultAllocation.toEncodable(this)
  }
}
