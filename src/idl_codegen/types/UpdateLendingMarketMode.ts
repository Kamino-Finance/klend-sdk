import { PublicKey } from "@solana/web3.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"

export interface UpdateOwnerJSON {
  kind: "UpdateOwner"
}

export class UpdateOwner {
  static readonly discriminator = 0
  static readonly kind = "UpdateOwner"
  readonly discriminator = 0
  readonly kind = "UpdateOwner"

  toJSON(): UpdateOwnerJSON {
    return {
      kind: "UpdateOwner",
    }
  }

  toEncodable() {
    return {
      UpdateOwner: {},
    }
  }
}

export interface UpdateEmergencyModeJSON {
  kind: "UpdateEmergencyMode"
}

export class UpdateEmergencyMode {
  static readonly discriminator = 1
  static readonly kind = "UpdateEmergencyMode"
  readonly discriminator = 1
  readonly kind = "UpdateEmergencyMode"

  toJSON(): UpdateEmergencyModeJSON {
    return {
      kind: "UpdateEmergencyMode",
    }
  }

  toEncodable() {
    return {
      UpdateEmergencyMode: {},
    }
  }
}

export interface UpdateLiquidationCloseFactorJSON {
  kind: "UpdateLiquidationCloseFactor"
}

export class UpdateLiquidationCloseFactor {
  static readonly discriminator = 2
  static readonly kind = "UpdateLiquidationCloseFactor"
  readonly discriminator = 2
  readonly kind = "UpdateLiquidationCloseFactor"

  toJSON(): UpdateLiquidationCloseFactorJSON {
    return {
      kind: "UpdateLiquidationCloseFactor",
    }
  }

  toEncodable() {
    return {
      UpdateLiquidationCloseFactor: {},
    }
  }
}

export interface UpdateLiquidationMaxValueJSON {
  kind: "UpdateLiquidationMaxValue"
}

export class UpdateLiquidationMaxValue {
  static readonly discriminator = 3
  static readonly kind = "UpdateLiquidationMaxValue"
  readonly discriminator = 3
  readonly kind = "UpdateLiquidationMaxValue"

  toJSON(): UpdateLiquidationMaxValueJSON {
    return {
      kind: "UpdateLiquidationMaxValue",
    }
  }

  toEncodable() {
    return {
      UpdateLiquidationMaxValue: {},
    }
  }
}

export interface UpdateGlobalUnhealthyBorrowJSON {
  kind: "UpdateGlobalUnhealthyBorrow"
}

export class UpdateGlobalUnhealthyBorrow {
  static readonly discriminator = 4
  static readonly kind = "UpdateGlobalUnhealthyBorrow"
  readonly discriminator = 4
  readonly kind = "UpdateGlobalUnhealthyBorrow"

  toJSON(): UpdateGlobalUnhealthyBorrowJSON {
    return {
      kind: "UpdateGlobalUnhealthyBorrow",
    }
  }

  toEncodable() {
    return {
      UpdateGlobalUnhealthyBorrow: {},
    }
  }
}

export interface UpdateGlobalAllowedBorrowJSON {
  kind: "UpdateGlobalAllowedBorrow"
}

export class UpdateGlobalAllowedBorrow {
  static readonly discriminator = 5
  static readonly kind = "UpdateGlobalAllowedBorrow"
  readonly discriminator = 5
  readonly kind = "UpdateGlobalAllowedBorrow"

  toJSON(): UpdateGlobalAllowedBorrowJSON {
    return {
      kind: "UpdateGlobalAllowedBorrow",
    }
  }

  toEncodable() {
    return {
      UpdateGlobalAllowedBorrow: {},
    }
  }
}

export interface UpdateRiskCouncilJSON {
  kind: "UpdateRiskCouncil"
}

export class UpdateRiskCouncil {
  static readonly discriminator = 6
  static readonly kind = "UpdateRiskCouncil"
  readonly discriminator = 6
  readonly kind = "UpdateRiskCouncil"

  toJSON(): UpdateRiskCouncilJSON {
    return {
      kind: "UpdateRiskCouncil",
    }
  }

  toEncodable() {
    return {
      UpdateRiskCouncil: {},
    }
  }
}

export interface UpdateMinFullLiquidationThresholdJSON {
  kind: "UpdateMinFullLiquidationThreshold"
}

export class UpdateMinFullLiquidationThreshold {
  static readonly discriminator = 7
  static readonly kind = "UpdateMinFullLiquidationThreshold"
  readonly discriminator = 7
  readonly kind = "UpdateMinFullLiquidationThreshold"

  toJSON(): UpdateMinFullLiquidationThresholdJSON {
    return {
      kind: "UpdateMinFullLiquidationThreshold",
    }
  }

  toEncodable() {
    return {
      UpdateMinFullLiquidationThreshold: {},
    }
  }
}

export interface UpdateInsolvencyRiskLtvJSON {
  kind: "UpdateInsolvencyRiskLtv"
}

export class UpdateInsolvencyRiskLtv {
  static readonly discriminator = 8
  static readonly kind = "UpdateInsolvencyRiskLtv"
  readonly discriminator = 8
  readonly kind = "UpdateInsolvencyRiskLtv"

  toJSON(): UpdateInsolvencyRiskLtvJSON {
    return {
      kind: "UpdateInsolvencyRiskLtv",
    }
  }

  toEncodable() {
    return {
      UpdateInsolvencyRiskLtv: {},
    }
  }
}

export interface UpdateElevationGroupJSON {
  kind: "UpdateElevationGroup"
}

export class UpdateElevationGroup {
  static readonly discriminator = 9
  static readonly kind = "UpdateElevationGroup"
  readonly discriminator = 9
  readonly kind = "UpdateElevationGroup"

  toJSON(): UpdateElevationGroupJSON {
    return {
      kind: "UpdateElevationGroup",
    }
  }

  toEncodable() {
    return {
      UpdateElevationGroup: {},
    }
  }
}

export interface UpdateReferralFeeBpsJSON {
  kind: "UpdateReferralFeeBps"
}

export class UpdateReferralFeeBps {
  static readonly discriminator = 10
  static readonly kind = "UpdateReferralFeeBps"
  readonly discriminator = 10
  readonly kind = "UpdateReferralFeeBps"

  toJSON(): UpdateReferralFeeBpsJSON {
    return {
      kind: "UpdateReferralFeeBps",
    }
  }

  toEncodable() {
    return {
      UpdateReferralFeeBps: {},
    }
  }
}

export interface UpdateMultiplierPointsJSON {
  kind: "UpdateMultiplierPoints"
}

export class UpdateMultiplierPoints {
  static readonly discriminator = 11
  static readonly kind = "UpdateMultiplierPoints"
  readonly discriminator = 11
  readonly kind = "UpdateMultiplierPoints"

  toJSON(): UpdateMultiplierPointsJSON {
    return {
      kind: "UpdateMultiplierPoints",
    }
  }

  toEncodable() {
    return {
      UpdateMultiplierPoints: {},
    }
  }
}

export interface UpdatePriceRefreshTriggerToMaxAgePctJSON {
  kind: "UpdatePriceRefreshTriggerToMaxAgePct"
}

export class UpdatePriceRefreshTriggerToMaxAgePct {
  static readonly discriminator = 12
  static readonly kind = "UpdatePriceRefreshTriggerToMaxAgePct"
  readonly discriminator = 12
  readonly kind = "UpdatePriceRefreshTriggerToMaxAgePct"

  toJSON(): UpdatePriceRefreshTriggerToMaxAgePctJSON {
    return {
      kind: "UpdatePriceRefreshTriggerToMaxAgePct",
    }
  }

  toEncodable() {
    return {
      UpdatePriceRefreshTriggerToMaxAgePct: {},
    }
  }
}

export interface UpdateAutodeleverageEnabledJSON {
  kind: "UpdateAutodeleverageEnabled"
}

export class UpdateAutodeleverageEnabled {
  static readonly discriminator = 13
  static readonly kind = "UpdateAutodeleverageEnabled"
  readonly discriminator = 13
  readonly kind = "UpdateAutodeleverageEnabled"

  toJSON(): UpdateAutodeleverageEnabledJSON {
    return {
      kind: "UpdateAutodeleverageEnabled",
    }
  }

  toEncodable() {
    return {
      UpdateAutodeleverageEnabled: {},
    }
  }
}

export interface UpdateBorrowingDisabledJSON {
  kind: "UpdateBorrowingDisabled"
}

export class UpdateBorrowingDisabled {
  static readonly discriminator = 14
  static readonly kind = "UpdateBorrowingDisabled"
  readonly discriminator = 14
  readonly kind = "UpdateBorrowingDisabled"

  toJSON(): UpdateBorrowingDisabledJSON {
    return {
      kind: "UpdateBorrowingDisabled",
    }
  }

  toEncodable() {
    return {
      UpdateBorrowingDisabled: {},
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDecoded(obj: any): types.UpdateLendingMarketModeKind {
  if (typeof obj !== "object") {
    throw new Error("Invalid enum object")
  }

  if ("UpdateOwner" in obj) {
    return new UpdateOwner()
  }
  if ("UpdateEmergencyMode" in obj) {
    return new UpdateEmergencyMode()
  }
  if ("UpdateLiquidationCloseFactor" in obj) {
    return new UpdateLiquidationCloseFactor()
  }
  if ("UpdateLiquidationMaxValue" in obj) {
    return new UpdateLiquidationMaxValue()
  }
  if ("UpdateGlobalUnhealthyBorrow" in obj) {
    return new UpdateGlobalUnhealthyBorrow()
  }
  if ("UpdateGlobalAllowedBorrow" in obj) {
    return new UpdateGlobalAllowedBorrow()
  }
  if ("UpdateRiskCouncil" in obj) {
    return new UpdateRiskCouncil()
  }
  if ("UpdateMinFullLiquidationThreshold" in obj) {
    return new UpdateMinFullLiquidationThreshold()
  }
  if ("UpdateInsolvencyRiskLtv" in obj) {
    return new UpdateInsolvencyRiskLtv()
  }
  if ("UpdateElevationGroup" in obj) {
    return new UpdateElevationGroup()
  }
  if ("UpdateReferralFeeBps" in obj) {
    return new UpdateReferralFeeBps()
  }
  if ("UpdateMultiplierPoints" in obj) {
    return new UpdateMultiplierPoints()
  }
  if ("UpdatePriceRefreshTriggerToMaxAgePct" in obj) {
    return new UpdatePriceRefreshTriggerToMaxAgePct()
  }
  if ("UpdateAutodeleverageEnabled" in obj) {
    return new UpdateAutodeleverageEnabled()
  }
  if ("UpdateBorrowingDisabled" in obj) {
    return new UpdateBorrowingDisabled()
  }

  throw new Error("Invalid enum object")
}

export function fromJSON(
  obj: types.UpdateLendingMarketModeJSON
): types.UpdateLendingMarketModeKind {
  switch (obj.kind) {
    case "UpdateOwner": {
      return new UpdateOwner()
    }
    case "UpdateEmergencyMode": {
      return new UpdateEmergencyMode()
    }
    case "UpdateLiquidationCloseFactor": {
      return new UpdateLiquidationCloseFactor()
    }
    case "UpdateLiquidationMaxValue": {
      return new UpdateLiquidationMaxValue()
    }
    case "UpdateGlobalUnhealthyBorrow": {
      return new UpdateGlobalUnhealthyBorrow()
    }
    case "UpdateGlobalAllowedBorrow": {
      return new UpdateGlobalAllowedBorrow()
    }
    case "UpdateRiskCouncil": {
      return new UpdateRiskCouncil()
    }
    case "UpdateMinFullLiquidationThreshold": {
      return new UpdateMinFullLiquidationThreshold()
    }
    case "UpdateInsolvencyRiskLtv": {
      return new UpdateInsolvencyRiskLtv()
    }
    case "UpdateElevationGroup": {
      return new UpdateElevationGroup()
    }
    case "UpdateReferralFeeBps": {
      return new UpdateReferralFeeBps()
    }
    case "UpdateMultiplierPoints": {
      return new UpdateMultiplierPoints()
    }
    case "UpdatePriceRefreshTriggerToMaxAgePct": {
      return new UpdatePriceRefreshTriggerToMaxAgePct()
    }
    case "UpdateAutodeleverageEnabled": {
      return new UpdateAutodeleverageEnabled()
    }
    case "UpdateBorrowingDisabled": {
      return new UpdateBorrowingDisabled()
    }
  }
}

export function layout(property?: string) {
  const ret = borsh.rustEnum([
    borsh.struct([], "UpdateOwner"),
    borsh.struct([], "UpdateEmergencyMode"),
    borsh.struct([], "UpdateLiquidationCloseFactor"),
    borsh.struct([], "UpdateLiquidationMaxValue"),
    borsh.struct([], "UpdateGlobalUnhealthyBorrow"),
    borsh.struct([], "UpdateGlobalAllowedBorrow"),
    borsh.struct([], "UpdateRiskCouncil"),
    borsh.struct([], "UpdateMinFullLiquidationThreshold"),
    borsh.struct([], "UpdateInsolvencyRiskLtv"),
    borsh.struct([], "UpdateElevationGroup"),
    borsh.struct([], "UpdateReferralFeeBps"),
    borsh.struct([], "UpdateMultiplierPoints"),
    borsh.struct([], "UpdatePriceRefreshTriggerToMaxAgePct"),
    borsh.struct([], "UpdateAutodeleverageEnabled"),
    borsh.struct([], "UpdateBorrowingDisabled"),
  ])
  if (property !== undefined) {
    return ret.replicate(property)
  }
  return ret
}
