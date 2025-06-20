import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface PermissionsFields {
  allowSwap: boolean
  allowAddLiquidity: boolean
  allowRemoveLiquidity: boolean
  allowIncreasePosition: boolean
  allowDecreasePosition: boolean
  allowCollateralWithdrawal: boolean
  allowLiquidatePosition: boolean
}

export interface PermissionsJSON {
  allowSwap: boolean
  allowAddLiquidity: boolean
  allowRemoveLiquidity: boolean
  allowIncreasePosition: boolean
  allowDecreasePosition: boolean
  allowCollateralWithdrawal: boolean
  allowLiquidatePosition: boolean
}

export class Permissions {
  readonly allowSwap: boolean
  readonly allowAddLiquidity: boolean
  readonly allowRemoveLiquidity: boolean
  readonly allowIncreasePosition: boolean
  readonly allowDecreasePosition: boolean
  readonly allowCollateralWithdrawal: boolean
  readonly allowLiquidatePosition: boolean

  constructor(fields: PermissionsFields) {
    this.allowSwap = fields.allowSwap
    this.allowAddLiquidity = fields.allowAddLiquidity
    this.allowRemoveLiquidity = fields.allowRemoveLiquidity
    this.allowIncreasePosition = fields.allowIncreasePosition
    this.allowDecreasePosition = fields.allowDecreasePosition
    this.allowCollateralWithdrawal = fields.allowCollateralWithdrawal
    this.allowLiquidatePosition = fields.allowLiquidatePosition
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.bool("allowSwap"),
        borsh.bool("allowAddLiquidity"),
        borsh.bool("allowRemoveLiquidity"),
        borsh.bool("allowIncreasePosition"),
        borsh.bool("allowDecreasePosition"),
        borsh.bool("allowCollateralWithdrawal"),
        borsh.bool("allowLiquidatePosition"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new Permissions({
      allowSwap: obj.allowSwap,
      allowAddLiquidity: obj.allowAddLiquidity,
      allowRemoveLiquidity: obj.allowRemoveLiquidity,
      allowIncreasePosition: obj.allowIncreasePosition,
      allowDecreasePosition: obj.allowDecreasePosition,
      allowCollateralWithdrawal: obj.allowCollateralWithdrawal,
      allowLiquidatePosition: obj.allowLiquidatePosition,
    })
  }

  static toEncodable(fields: PermissionsFields) {
    return {
      allowSwap: fields.allowSwap,
      allowAddLiquidity: fields.allowAddLiquidity,
      allowRemoveLiquidity: fields.allowRemoveLiquidity,
      allowIncreasePosition: fields.allowIncreasePosition,
      allowDecreasePosition: fields.allowDecreasePosition,
      allowCollateralWithdrawal: fields.allowCollateralWithdrawal,
      allowLiquidatePosition: fields.allowLiquidatePosition,
    }
  }

  toJSON(): PermissionsJSON {
    return {
      allowSwap: this.allowSwap,
      allowAddLiquidity: this.allowAddLiquidity,
      allowRemoveLiquidity: this.allowRemoveLiquidity,
      allowIncreasePosition: this.allowIncreasePosition,
      allowDecreasePosition: this.allowDecreasePosition,
      allowCollateralWithdrawal: this.allowCollateralWithdrawal,
      allowLiquidatePosition: this.allowLiquidatePosition,
    }
  }

  static fromJSON(obj: PermissionsJSON): Permissions {
    return new Permissions({
      allowSwap: obj.allowSwap,
      allowAddLiquidity: obj.allowAddLiquidity,
      allowRemoveLiquidity: obj.allowRemoveLiquidity,
      allowIncreasePosition: obj.allowIncreasePosition,
      allowDecreasePosition: obj.allowDecreasePosition,
      allowCollateralWithdrawal: obj.allowCollateralWithdrawal,
      allowLiquidatePosition: obj.allowLiquidatePosition,
    })
  }

  toEncodable() {
    return Permissions.toEncodable(this)
  }
}
