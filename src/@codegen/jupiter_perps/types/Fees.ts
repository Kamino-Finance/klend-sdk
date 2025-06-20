import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface FeesFields {
  increasePositionBps: BN
  decreasePositionBps: BN
  addRemoveLiquidityBps: BN
  swapBps: BN
  taxBps: BN
  stableSwapBps: BN
  stableSwapTaxBps: BN
  liquidationRewardBps: BN
  protocolShareBps: BN
}

export interface FeesJSON {
  increasePositionBps: string
  decreasePositionBps: string
  addRemoveLiquidityBps: string
  swapBps: string
  taxBps: string
  stableSwapBps: string
  stableSwapTaxBps: string
  liquidationRewardBps: string
  protocolShareBps: string
}

export class Fees {
  readonly increasePositionBps: BN
  readonly decreasePositionBps: BN
  readonly addRemoveLiquidityBps: BN
  readonly swapBps: BN
  readonly taxBps: BN
  readonly stableSwapBps: BN
  readonly stableSwapTaxBps: BN
  readonly liquidationRewardBps: BN
  readonly protocolShareBps: BN

  constructor(fields: FeesFields) {
    this.increasePositionBps = fields.increasePositionBps
    this.decreasePositionBps = fields.decreasePositionBps
    this.addRemoveLiquidityBps = fields.addRemoveLiquidityBps
    this.swapBps = fields.swapBps
    this.taxBps = fields.taxBps
    this.stableSwapBps = fields.stableSwapBps
    this.stableSwapTaxBps = fields.stableSwapTaxBps
    this.liquidationRewardBps = fields.liquidationRewardBps
    this.protocolShareBps = fields.protocolShareBps
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("increasePositionBps"),
        borsh.u64("decreasePositionBps"),
        borsh.u64("addRemoveLiquidityBps"),
        borsh.u64("swapBps"),
        borsh.u64("taxBps"),
        borsh.u64("stableSwapBps"),
        borsh.u64("stableSwapTaxBps"),
        borsh.u64("liquidationRewardBps"),
        borsh.u64("protocolShareBps"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new Fees({
      increasePositionBps: obj.increasePositionBps,
      decreasePositionBps: obj.decreasePositionBps,
      addRemoveLiquidityBps: obj.addRemoveLiquidityBps,
      swapBps: obj.swapBps,
      taxBps: obj.taxBps,
      stableSwapBps: obj.stableSwapBps,
      stableSwapTaxBps: obj.stableSwapTaxBps,
      liquidationRewardBps: obj.liquidationRewardBps,
      protocolShareBps: obj.protocolShareBps,
    })
  }

  static toEncodable(fields: FeesFields) {
    return {
      increasePositionBps: fields.increasePositionBps,
      decreasePositionBps: fields.decreasePositionBps,
      addRemoveLiquidityBps: fields.addRemoveLiquidityBps,
      swapBps: fields.swapBps,
      taxBps: fields.taxBps,
      stableSwapBps: fields.stableSwapBps,
      stableSwapTaxBps: fields.stableSwapTaxBps,
      liquidationRewardBps: fields.liquidationRewardBps,
      protocolShareBps: fields.protocolShareBps,
    }
  }

  toJSON(): FeesJSON {
    return {
      increasePositionBps: this.increasePositionBps.toString(),
      decreasePositionBps: this.decreasePositionBps.toString(),
      addRemoveLiquidityBps: this.addRemoveLiquidityBps.toString(),
      swapBps: this.swapBps.toString(),
      taxBps: this.taxBps.toString(),
      stableSwapBps: this.stableSwapBps.toString(),
      stableSwapTaxBps: this.stableSwapTaxBps.toString(),
      liquidationRewardBps: this.liquidationRewardBps.toString(),
      protocolShareBps: this.protocolShareBps.toString(),
    }
  }

  static fromJSON(obj: FeesJSON): Fees {
    return new Fees({
      increasePositionBps: new BN(obj.increasePositionBps),
      decreasePositionBps: new BN(obj.decreasePositionBps),
      addRemoveLiquidityBps: new BN(obj.addRemoveLiquidityBps),
      swapBps: new BN(obj.swapBps),
      taxBps: new BN(obj.taxBps),
      stableSwapBps: new BN(obj.stableSwapBps),
      stableSwapTaxBps: new BN(obj.stableSwapTaxBps),
      liquidationRewardBps: new BN(obj.liquidationRewardBps),
      protocolShareBps: new BN(obj.protocolShareBps),
    })
  }

  toEncodable() {
    return Fees.toEncodable(this)
  }
}
