import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface ObligationOrderFields {
  conditionThresholdSf: BN
  opportunityParameterSf: BN
  minExecutionBonusBps: number
  maxExecutionBonusBps: number
  conditionType: number
  opportunityType: number
  padding1: Array<number>
  padding2: Array<BN>
}

export interface ObligationOrderJSON {
  conditionThresholdSf: string
  opportunityParameterSf: string
  minExecutionBonusBps: number
  maxExecutionBonusBps: number
  conditionType: number
  opportunityType: number
  padding1: Array<number>
  padding2: Array<string>
}

export class ObligationOrder {
  readonly conditionThresholdSf: BN
  readonly opportunityParameterSf: BN
  readonly minExecutionBonusBps: number
  readonly maxExecutionBonusBps: number
  readonly conditionType: number
  readonly opportunityType: number
  readonly padding1: Array<number>
  readonly padding2: Array<BN>

  constructor(fields: ObligationOrderFields) {
    this.conditionThresholdSf = fields.conditionThresholdSf
    this.opportunityParameterSf = fields.opportunityParameterSf
    this.minExecutionBonusBps = fields.minExecutionBonusBps
    this.maxExecutionBonusBps = fields.maxExecutionBonusBps
    this.conditionType = fields.conditionType
    this.opportunityType = fields.opportunityType
    this.padding1 = fields.padding1
    this.padding2 = fields.padding2
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u128("conditionThresholdSf"),
        borsh.u128("opportunityParameterSf"),
        borsh.u16("minExecutionBonusBps"),
        borsh.u16("maxExecutionBonusBps"),
        borsh.u8("conditionType"),
        borsh.u8("opportunityType"),
        borsh.array(borsh.u8(), 10, "padding1"),
        borsh.array(borsh.u128(), 5, "padding2"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new ObligationOrder({
      conditionThresholdSf: obj.conditionThresholdSf,
      opportunityParameterSf: obj.opportunityParameterSf,
      minExecutionBonusBps: obj.minExecutionBonusBps,
      maxExecutionBonusBps: obj.maxExecutionBonusBps,
      conditionType: obj.conditionType,
      opportunityType: obj.opportunityType,
      padding1: obj.padding1,
      padding2: obj.padding2,
    })
  }

  static toEncodable(fields: ObligationOrderFields) {
    return {
      conditionThresholdSf: fields.conditionThresholdSf,
      opportunityParameterSf: fields.opportunityParameterSf,
      minExecutionBonusBps: fields.minExecutionBonusBps,
      maxExecutionBonusBps: fields.maxExecutionBonusBps,
      conditionType: fields.conditionType,
      opportunityType: fields.opportunityType,
      padding1: fields.padding1,
      padding2: fields.padding2,
    }
  }

  toJSON(): ObligationOrderJSON {
    return {
      conditionThresholdSf: this.conditionThresholdSf.toString(),
      opportunityParameterSf: this.opportunityParameterSf.toString(),
      minExecutionBonusBps: this.minExecutionBonusBps,
      maxExecutionBonusBps: this.maxExecutionBonusBps,
      conditionType: this.conditionType,
      opportunityType: this.opportunityType,
      padding1: this.padding1,
      padding2: this.padding2.map((item) => item.toString()),
    }
  }

  static fromJSON(obj: ObligationOrderJSON): ObligationOrder {
    return new ObligationOrder({
      conditionThresholdSf: new BN(obj.conditionThresholdSf),
      opportunityParameterSf: new BN(obj.opportunityParameterSf),
      minExecutionBonusBps: obj.minExecutionBonusBps,
      maxExecutionBonusBps: obj.maxExecutionBonusBps,
      conditionType: obj.conditionType,
      opportunityType: obj.opportunityType,
      padding1: obj.padding1,
      padding2: obj.padding2.map((item) => new BN(item)),
    })
  }

  toEncodable() {
    return ObligationOrder.toEncodable(this)
  }
}
