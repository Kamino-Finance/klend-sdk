import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ElevationGroupFields {
  maxLiquidationBonusBps: number
  id: number
  ltvPct: number
  liquidationThresholdPct: number
  allowNewLoans: number
  maxReservesAsCollateral: number
  padding0: number
  /** Mandatory debt reserve for this elevation group */
  debtReserve: Address
  padding1: Array<BN>
}

export interface ElevationGroupJSON {
  maxLiquidationBonusBps: number
  id: number
  ltvPct: number
  liquidationThresholdPct: number
  allowNewLoans: number
  maxReservesAsCollateral: number
  padding0: number
  /** Mandatory debt reserve for this elevation group */
  debtReserve: string
  padding1: Array<string>
}

export class ElevationGroup {
  readonly maxLiquidationBonusBps: number
  readonly id: number
  readonly ltvPct: number
  readonly liquidationThresholdPct: number
  readonly allowNewLoans: number
  readonly maxReservesAsCollateral: number
  readonly padding0: number
  /** Mandatory debt reserve for this elevation group */
  readonly debtReserve: Address
  readonly padding1: Array<BN>

  constructor(fields: ElevationGroupFields) {
    this.maxLiquidationBonusBps = fields.maxLiquidationBonusBps
    this.id = fields.id
    this.ltvPct = fields.ltvPct
    this.liquidationThresholdPct = fields.liquidationThresholdPct
    this.allowNewLoans = fields.allowNewLoans
    this.maxReservesAsCollateral = fields.maxReservesAsCollateral
    this.padding0 = fields.padding0
    this.debtReserve = fields.debtReserve
    this.padding1 = fields.padding1
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u16("maxLiquidationBonusBps"),
        borsh.u8("id"),
        borsh.u8("ltvPct"),
        borsh.u8("liquidationThresholdPct"),
        borsh.u8("allowNewLoans"),
        borsh.u8("maxReservesAsCollateral"),
        borsh.u8("padding0"),
        borshAddress("debtReserve"),
        borsh.array(borsh.u64(), 4, "padding1"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ElevationGroup({
      maxLiquidationBonusBps: obj.maxLiquidationBonusBps,
      id: obj.id,
      ltvPct: obj.ltvPct,
      liquidationThresholdPct: obj.liquidationThresholdPct,
      allowNewLoans: obj.allowNewLoans,
      maxReservesAsCollateral: obj.maxReservesAsCollateral,
      padding0: obj.padding0,
      debtReserve: obj.debtReserve,
      padding1: obj.padding1,
    })
  }

  static toEncodable(fields: ElevationGroupFields) {
    return {
      maxLiquidationBonusBps: fields.maxLiquidationBonusBps,
      id: fields.id,
      ltvPct: fields.ltvPct,
      liquidationThresholdPct: fields.liquidationThresholdPct,
      allowNewLoans: fields.allowNewLoans,
      maxReservesAsCollateral: fields.maxReservesAsCollateral,
      padding0: fields.padding0,
      debtReserve: fields.debtReserve,
      padding1: fields.padding1,
    }
  }

  toJSON(): ElevationGroupJSON {
    return {
      maxLiquidationBonusBps: this.maxLiquidationBonusBps,
      id: this.id,
      ltvPct: this.ltvPct,
      liquidationThresholdPct: this.liquidationThresholdPct,
      allowNewLoans: this.allowNewLoans,
      maxReservesAsCollateral: this.maxReservesAsCollateral,
      padding0: this.padding0,
      debtReserve: this.debtReserve,
      padding1: this.padding1.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ElevationGroupJSON): ElevationGroup {
    return new ElevationGroup({
      maxLiquidationBonusBps: obj.maxLiquidationBonusBps,
      id: obj.id,
      ltvPct: obj.ltvPct,
      liquidationThresholdPct: obj.liquidationThresholdPct,
      allowNewLoans: obj.allowNewLoans,
      maxReservesAsCollateral: obj.maxReservesAsCollateral,
      padding0: obj.padding0,
      debtReserve: address(obj.debtReserve),
      padding1: obj.padding1.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ElevationGroup.toEncodable(this)
  }
}
